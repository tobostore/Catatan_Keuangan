import { NextResponse } from "next/server"
import type { ResultSetHeader } from "mysql2"

import { query } from "@/lib/db"
import { getUserFromCookies } from "@/lib/server-session"
import {
  getOrCreateCategoryId,
  VALID_TYPES,
  type TransactionType,
  resolveAccountId,
  fetchTransactionRowById,
  mapTransactionRow,
  InvalidAccountError,
} from "../helpers"

type RouteContext = { params: Promise<{ id: string }> }

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getUserFromCookies()
    if (!user?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const userId = Number(user.id)
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ message: "ID pengguna tidak valid" }, { status: 400 })
    }

    const { id } = await context.params

    if (!id) {
      return NextResponse.json({ message: "ID transaksi wajib diisi" }, { status: 400 })
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

    const categoryId = await getOrCreateCategoryId(userId, category.trim(), type)

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
      resolvedAccountId = await resolveAccountId({ userId, submittedAccountId: parsedAccountId })
    } catch (error) {
      if (error instanceof InvalidAccountError) {
        return NextResponse.json({ message: error.message }, { status: 400 })
      }
      throw error
    }

    const result = await query<ResultSetHeader>(
      `UPDATE transactions
       SET type = ?, category_id = ?, amount = ?, description = ?, transaction_date = ?, account_id = ?
       WHERE id = ? AND user_id = ?`,
      [type, categoryId, Number(amount), description ?? "", date, resolvedAccountId, id, userId],
    )

    if (result.affectedRows === 0) {
      return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 })
    }

    const updatedRow = await fetchTransactionRowById(Number(id), userId)
    if (!updatedRow) {
      return NextResponse.json({ message: "Transaksi berhasil diperbarui tetapi tidak dapat dibaca kembali" })
    }

    return NextResponse.json(mapTransactionRow(updatedRow))
  } catch (error) {
    console.error("PUT /api/transactions/[id] error", error)
    return NextResponse.json({ message: "Gagal memperbarui transaksi" }, { status: 500 })
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const user = await getUserFromCookies()
    if (!user?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const userId = Number(user.id)
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ message: "ID pengguna tidak valid" }, { status: 400 })
    }

    const { id } = await context.params

    if (!id) {
      return NextResponse.json({ message: "ID transaksi wajib diisi" }, { status: 400 })
    }

    const result = await query<ResultSetHeader>("DELETE FROM transactions WHERE id = ? AND user_id = ?", [id, userId])

    if (result.affectedRows === 0) {
      return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 })
    }

    return NextResponse.json({ id })
  } catch (error) {
    console.error("DELETE /api/transactions/[id] error", error)
    return NextResponse.json({ message: "Gagal menghapus transaksi" }, { status: 500 })
  }
}
