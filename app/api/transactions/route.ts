import { NextResponse } from "next/server"
import type { ResultSetHeader } from "mysql2"

import { query } from "@/lib/db"
import { getUserFromCookies } from "@/lib/server-session"
import {
  getOrCreateCategoryId,
  resolveAccountId,
  VALID_TYPES,
  type TransactionType,
  TRANSACTION_SELECT,
  mapTransactionRow,
  fetchTransactionRowById,
  InvalidAccountError,
  type TransactionRow,
} from "./helpers"

const defaultAccountEnv = process.env.DEFAULT_ACCOUNT_ID
const preferredAccountId =
  defaultAccountEnv && Number.isFinite(Number(defaultAccountEnv)) ? Number(defaultAccountEnv) : null

export async function GET() {
  try {
    const user = await getUserFromCookies()
    if (!user?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const userId = Number(user.id)
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ message: "ID pengguna tidak valid" }, { status: 400 })
    }

    const rows = await query<TransactionRow[]>(
      `${TRANSACTION_SELECT} WHERE t.user_id = ? ORDER BY t.transaction_date DESC, t.id DESC`,
      [userId],
    )

    const data = rows.map((row) => mapTransactionRow(row))

    return NextResponse.json(data)
  } catch (error) {
    console.error("GET /api/transactions error", error)
    return NextResponse.json({ message: "Gagal mengambil data transaksi" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromCookies()
    if (!user?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const userId = Number(user.id)
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ message: "ID pengguna tidak valid" }, { status: 400 })
    }

    const body = await request.json()
    const { type, category, amount, description, date, accountId } = body as {
      type?: TransactionType
      category?: string
      amount?: number
      description?: string
      date?: string
      accountId?: number | string | null
    }

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ message: "Tipe transaksi tidak valid" }, { status: 400 })
    }

    if (!category || !category.trim()) {
      return NextResponse.json({ message: "Kategori wajib diisi" }, { status: 400 })
    }

    if (amount === undefined || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ message: "Jumlah tidak valid" }, { status: 400 })
    }

    if (!date) {
      return NextResponse.json({ message: "Tanggal wajib diisi" }, { status: 400 })
    }

    if (accountId === undefined || accountId === null || accountId === "") {
      return NextResponse.json({ message: "Sumber dana wajib dipilih" }, { status: 400 })
    }

    let parsedAccountId: number | undefined
    if (accountId !== undefined && accountId !== null && accountId !== "") {
      const numericAccountId = Number(accountId)
      if (!Number.isFinite(numericAccountId) || numericAccountId <= 0) {
        return NextResponse.json({ message: "Akun tidak valid" }, { status: 400 })
      }
      parsedAccountId = numericAccountId
    }

    let resolvedAccountId: number
    try {
      resolvedAccountId = await resolveAccountId({
        userId,
        preferredAccountId: preferredAccountId ?? undefined,
        submittedAccountId: parsedAccountId,
      })
    } catch (error) {
      if (error instanceof InvalidAccountError) {
        return NextResponse.json({ message: error.message }, { status: 400 })
      }
      throw error
    }
    const categoryId = await getOrCreateCategoryId(userId, category.trim(), type)

    const result = await query<ResultSetHeader>(
      `INSERT INTO transactions (user_id, account_id, category_id, type, amount, description, transaction_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, resolvedAccountId, categoryId, type, Number(amount), description ?? "", date],
    )

    const createdRow = await fetchTransactionRowById(result.insertId, userId)
    if (!createdRow) {
      return NextResponse.json({ message: "Transaksi berhasil disimpan tetapi tidak dapat dibaca kembali" }, { status: 201 })
    }

    return NextResponse.json(mapTransactionRow(createdRow), { status: 201 })
  } catch (error) {
    console.error("POST /api/transactions error", error)
    return NextResponse.json({ message: "Gagal menyimpan transaksi" }, { status: 500 })
  }
}
