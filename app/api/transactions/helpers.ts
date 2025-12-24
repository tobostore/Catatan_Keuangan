import type { ResultSetHeader, RowDataPacket } from "mysql2"

import { query } from "@/lib/db"

export const VALID_TYPES = ["income", "expense"] as const

export type TransactionType = (typeof VALID_TYPES)[number]

export class InvalidAccountError extends Error {
  constructor(message = "Akun tidak ditemukan") {
    super(message)
    this.name = "InvalidAccountError"
  }
}

export type TransactionRow = RowDataPacket & {
  id: number
  type: TransactionType
  category: string | null
  amount: number
  description: string | null
  date: string
  account_id: number
  account_name: string | null
  user_id: number
}

export type TransactionResponse = {
  id: string
  type: TransactionType
  category: string
  amount: number
  description: string
  date: string
  accountId: number
  accountName: string
}

export const TRANSACTION_SELECT = `
  SELECT
    t.id,
    t.type,
    c.name AS category,
    t.amount,
    t.description,
    DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date,
    t.account_id,
    a.name AS account_name,
    t.user_id
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN accounts a ON t.account_id = a.id
`

export function mapTransactionRow(row: TransactionRow): TransactionResponse {
  return {
    id: String(row.id),
    type: row.type,
    category: row.category ?? "-",
    amount: Number(row.amount),
    description: row.description ?? "",
    date: row.date,
    accountId: Number(row.account_id),
    accountName: row.account_name ?? "-",
  }
}

export async function fetchTransactionRowById(id: number, userId: number) {
  const rows = await query<TransactionRow[]>(`${TRANSACTION_SELECT} WHERE t.id = ? AND t.user_id = ? LIMIT 1`, [id, userId])
  return rows[0]
}

export async function resolveAccountId({
  userId,
  preferredAccountId,
  submittedAccountId,
}: {
  userId: number
  preferredAccountId?: number
  submittedAccountId?: number
}) {
  if (submittedAccountId) {
    const match = await query<RowDataPacket[]>(
      "SELECT id FROM accounts WHERE id = ? AND user_id = ? LIMIT 1",
      [submittedAccountId, userId],
    )
    if (match.length === 0) {
      throw new InvalidAccountError()
    }
    return Number(match[0].id)
  }

  if (preferredAccountId) {
    const match = await query<RowDataPacket[]>(
      "SELECT id FROM accounts WHERE id = ? AND user_id = ? LIMIT 1",
      [preferredAccountId, userId],
    )
    if (match.length > 0) {
      return Number(match[0].id)
    }
  }

  const [fallback] = await query<RowDataPacket[]>(
    "SELECT id FROM accounts WHERE user_id = ? ORDER BY id ASC LIMIT 1",
    [userId],
  )
  if (!fallback?.id) {
    throw new Error("Tidak ada akun di tabel accounts untuk pengguna ini. Tambahkan minimal satu akun terlebih dahulu.")
  }

  return Number(fallback.id)
}

export async function getOrCreateCategoryId(userId: number, name: string, type: TransactionType) {
  const existing = await query<RowDataPacket[]>(
    "SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ? LIMIT 1",
    [userId, name, type],
  )

  if (existing.length > 0) {
    return Number(existing[0].id)
  }

  const color = type === "income" ? "#16a34a" : "#dc2626"
  const inserted = await query<ResultSetHeader>(
    "INSERT INTO categories (user_id, name, type, color) VALUES (?, ?, ?, ?)",
    [userId, name, type, color],
  )

  return inserted.insertId
}
