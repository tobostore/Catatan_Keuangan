import type { RowDataPacket } from "mysql2"

import { query } from "@/lib/db"

export type AccountBalanceRecord = {
  id: number
  name: string
  type: string
  institution?: string | null
  accountNumber?: string | null
  openingBalance: number
  incomeTotal: number
  expenseTotal: number
  balance: number
}

type AccountBalanceRow = RowDataPacket & {
  id: number
  name: string
  type: string
  institution: string | null
  account_number: string | null
  opening_balance: number | null
  income_total: number | null
  expense_total: number | null
}

const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
})

export async function fetchAccountBalances(userId: number): Promise<AccountBalanceRecord[]> {
  const rows = await query<AccountBalanceRow[]>(
    `
      SELECT
        a.id,
        a.name,
        a.type,
        a.institution,
        a.account_number,
        a.opening_balance,
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS income_total,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS expense_total
      FROM accounts a
      LEFT JOIN transactions t ON t.account_id = a.id AND t.user_id = a.user_id
      WHERE a.user_id = ?
      GROUP BY a.id, a.name, a.type, a.institution, a.account_number, a.opening_balance
      ORDER BY a.name ASC
    `,
    [userId],
  )

  return rows.map((row) => {
    const openingBalance = Number(row.opening_balance ?? 0)
    const incomeTotal = Number(row.income_total ?? 0)
    const expenseTotal = Number(row.expense_total ?? 0)
    const balance = openingBalance + incomeTotal - expenseTotal

    return {
      id: Number(row.id),
      name: row.name,
      type: row.type,
      institution: row.institution,
      accountNumber: row.account_number,
      openingBalance,
      incomeTotal,
      expenseTotal,
      balance,
    }
  })
}

export async function buildAccountBalanceMessage(userId: number) {
  const accounts = await fetchAccountBalances(userId)
  const total = accounts.reduce((sum, account) => sum + account.balance, 0)
  return {
    accounts,
    total,
    message: formatAccountBalanceMessage(accounts, total),
  }
}

export function formatAccountBalanceMessage(accounts: AccountBalanceRecord[], total?: number) {
  if (accounts.length === 0) {
    return "Belum ada akun yang terdaftar. Tambahkan akun di aplikasi terlebih dahulu."
  }

  const lines: string[] = ["Ringkasan Saldo Akun"]
  lines.push("------------------------------")

  accounts.forEach((account, index) => {
    const label = `${index + 1}. ${account.name}`
    lines.push(`${label} : ${currencyFormatter.format(account.balance)}`)
  })

  const computedTotal = total ?? accounts.reduce((sum, account) => sum + account.balance, 0)
  lines.push("==============================")
  lines.push(`Total Saldo : ${currencyFormatter.format(computedTotal)}`)

  return lines.join("\n")
}
