import { NextResponse } from "next/server"

import {
  createTransaction,
  InvalidAccountError,
  VALID_TYPES,
  type TransactionType,
} from "@/app/api/transactions/helpers"
import { sendTransactionNotification } from "@/lib/whatsapp"
import { resolveAccountReference, resolveUserReference } from "@/lib/external-transaction-utils"
import { parseTransactionCommand } from "@/lib/whatsapp-commands"

const EXTERNAL_TOKEN = process.env.EXTERNAL_TRANSACTION_TOKEN?.trim()
const DEFAULT_EXTERNAL_USER_ID = readNumberEnv("EXTERNAL_DEFAULT_USER_ID")

export async function GET(request: Request) {
  const payload = Object.fromEntries(new URL(request.url).searchParams.entries())
  return handleExternalTransaction(request, payload)
}

export async function POST(request: Request) {
  const parsed = await parsePayload(request)
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 })
  }

  return handleExternalTransaction(request, parsed.payload)
}

async function handleExternalTransaction(request: Request, rawPayload: Record<string, unknown>) {
  if (!EXTERNAL_TOKEN) {
    return NextResponse.json({ message: "Endpoint belum dikonfigurasi" }, { status: 503 })
  }

  const payload: Record<string, unknown> = { ...rawPayload }

  const textCommand = firstString(payload, ["message", "text", "body", "content"])
  if (textCommand && !payload.type && !payload.category && !payload.amount) {
    const parsedCommand = parseTransactionCommand(textCommand)
    if (!parsedCommand.ok) {
      return NextResponse.json({ message: parsedCommand.error }, { status: 400 })
    }

    payload.type = parsedCommand.data.type
    payload.category = parsedCommand.data.category
    payload.amount = parsedCommand.data.amount
    payload.date = parsedCommand.data.date
    payload.description = parsedCommand.data.description
    if (parsedCommand.data.accountId) {
      payload.accountId = parsedCommand.data.accountId
    }
    if (parsedCommand.data.accountName) {
      payload.source = parsedCommand.data.accountName
    }
  }

  if (!payload.userId && !payload.user_id && !payload.email && DEFAULT_EXTERNAL_USER_ID) {
    payload.userId = DEFAULT_EXTERNAL_USER_ID
  }

  const providedToken =
    request.headers.get("x-external-secret") ??
    new URL(request.url).searchParams.get("token") ??
    new URL(request.url).searchParams.get("secret") ??
    firstString(payload, ["token", "secret", "x_external_secret"])

  if (providedToken !== EXTERNAL_TOKEN) {
    return NextResponse.json({ message: "Token tidak valid" }, { status: 401 })
  }

  const userResult = await resolveUserReference(payload)
  if (!userResult.ok) {
    return NextResponse.json({ message: userResult.message }, { status: 400 })
  }
  const userId = userResult.userId

  const type = normalizeType(payload.type)
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ message: "Tipe transaksi tidak valid" }, { status: 400 })
  }

  const category = String(payload.category ?? "").trim()
  if (!category) {
    return NextResponse.json({ message: "Kategori wajib diisi" }, { status: 400 })
  }

  const amount = normalizeAmount(payload.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "Jumlah tidak valid" }, { status: 400 })
  }

  const date = normalizeDate(payload.date)
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
      userId,
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

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""
  const raw = await request.text()
  const trimmed = raw.trim()

  if (!trimmed) {
    return { ok: true as const, payload: {} as Record<string, unknown> }
  }

  if (contentType.includes("application/json") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (!parsed || typeof parsed !== "object") {
        return { ok: false as const, message: "Payload JSON tidak valid" }
      }
      return { ok: true as const, payload: parsed as Record<string, unknown> }
    } catch (error) {
      console.error("External transaction payload invalid JSON", error)
      return { ok: false as const, message: "Payload JSON tidak valid" }
    }
  }

  const formEntries = Object.fromEntries(new URLSearchParams(trimmed).entries())
  if (Object.keys(formEntries).length > 0) {
    return { ok: true as const, payload: formEntries }
  }

  return { ok: false as const, message: "Payload tidak valid" }
}

function normalizeType(value: unknown): TransactionType {
  const lower = String(value ?? "").trim().toLowerCase()
  if (["income", "pemasukan", "masuk"].includes(lower)) {
    return "income"
  }
  if (["expense", "pengeluaran", "keluar"].includes(lower)) {
    return "expense"
  }
  return lower as TransactionType
}

function normalizeAmount(value: unknown) {
  if (typeof value === "number") {
    return value
  }
  const text = String(value ?? "").trim()
  const numeric = text.replace(/[^0-9]/g, "")
  return Number(numeric)
}

function normalizeDate(value: unknown) {
  const text = String(value ?? "").trim()
  if (!text) {
    return new Date().toISOString().split("T")[0]
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text
  }

  const altMatch = text.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/)
  if (altMatch) {
    const [, day, month, year] = altMatch
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0]
  }

  return text
}

function firstString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function readNumberEnv(key: string) {
  const raw = process.env[key]?.trim()
  if (!raw) {
    return undefined
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}
