import { NextResponse } from "next/server"

import {
  createTransaction,
  InvalidAccountError,
  VALID_TYPES,
  type TransactionType,
} from "@/app/api/transactions/helpers"
import { sendTransactionNotification } from "@/lib/whatsapp"
import { resolveAccountReference, resolveUserReference } from "@/lib/external-transaction-utils"

const EXTERNAL_TOKEN = process.env.EXTERNAL_TRANSACTION_TOKEN?.trim()

export async function POST(request: Request) {
  if (!EXTERNAL_TOKEN) {
    return NextResponse.json({ message: "Endpoint belum dikonfigurasi" }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    console.error("External transaction payload invalid JSON", error)
    return NextResponse.json({ message: "Payload harus berupa JSON" }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Payload tidak valid" }, { status: 400 })
  }

  const payload = body as Record<string, unknown>
  const providedToken =
    request.headers.get("x-external-secret") ??
    (typeof payload.token === "string" ? payload.token : undefined)

  if (providedToken !== EXTERNAL_TOKEN) {
    return NextResponse.json({ message: "Token tidak valid" }, { status: 401 })
  }

  const userResult = await resolveUserReference(payload)
  if (!userResult.ok) {
    return NextResponse.json({ message: userResult.message }, { status: 400 })
  }
  const userId = userResult.userId

  const type = String(payload.type ?? "").toLowerCase() as TransactionType
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ message: "Tipe transaksi tidak valid" }, { status: 400 })
  }

  const category = String(payload.category ?? "").trim()
  if (!category) {
    return NextResponse.json({ message: "Kategori wajib diisi" }, { status: 400 })
  }

  const amount = Number(payload.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "Jumlah tidak valid" }, { status: 400 })
  }

  const date = String(payload.date ?? "").trim() || new Date().toISOString().split("T")[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ message: "Tanggal harus format YYYY-MM-DD" }, { status: 400 })
  }

  const description = typeof payload.description === "string" ? payload.description : ""
  const accountResolution = await resolveAccountReference(userId, payload)
  if (!accountResolution.ok) {
    return NextResponse.json({ message: accountResolution.message }, { status: 400 })
  }
  const submittedAccountId = accountResolution.accountId

  try {
    const transaction = await createTransaction({
      userId,
      type,
      category,
      amount,
      description,
      date,
      submittedAccountId,
    })

    if (!transaction) {
      return NextResponse.json({ message: "Transaksi tersimpan namun tidak dapat dimuat" }, { status: 201 })
    }

    void sendTransactionNotification({
      type: transaction.type,
      category: transaction.category,
      amount: transaction.amount,
      description: transaction.description,
      date: transaction.date,
      accountName: transaction.accountName,
    })

    return NextResponse.json({ message: "Transaksi berhasil", data: transaction })
  } catch (error) {
    if (error instanceof InvalidAccountError) {
      return NextResponse.json({ message: error.message }, { status: 400 })
    }

    console.error("External transaction insert failed", error)
    return NextResponse.json({ message: "Gagal menyimpan transaksi" }, { status: 500 })
  }
}
