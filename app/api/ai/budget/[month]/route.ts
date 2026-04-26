import { NextResponse } from "next/server"
import type { RowDataPacket } from "mysql2"

import { query } from "@/lib/db"
import { getUserFromCookies } from "@/lib/server-session"
import type { BudgetAnalysis } from "@/types/ai"

type BudgetRow = RowDataPacket & {
  user_id: string
  month: string
  monthly_income: number
  status_keuangan: "sehat" | "perhatian" | "kritis"
  persentase_pengeluaran: number
  pesan_utama: string
  analysis_json: string
  created_at: string
  updated_at: string
}

function isValidMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
}

export async function GET(_: Request, context: { params: Promise<{ month: string }> }) {
  try {
    const sessionUser = await getUserFromCookies()
    if (!sessionUser?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const { month } = await context.params
    if (!isValidMonth(month)) {
      return NextResponse.json({ message: "Format month harus YYYY-MM" }, { status: 400 })
    }

    const rows = await query<BudgetRow[]>(
      `SELECT user_id, month, monthly_income, status_keuangan, persentase_pengeluaran, pesan_utama,
              analysis_json, created_at, updated_at
       FROM ai_budget_analysis
       WHERE user_id = ? AND month = ?
       LIMIT 1`,
      [String(sessionUser.id), month],
    )

    if (rows.length === 0) {
      return NextResponse.json({ exists: false })
    }

    const row = rows[0]
    let parsed: BudgetAnalysis | null = null

    try {
      parsed = JSON.parse(row.analysis_json) as BudgetAnalysis
    } catch {
      parsed = null
    }

    return NextResponse.json({
      exists: true,
      data: parsed,
      meta: {
        month: row.month,
        monthlyIncome: Number(row.monthly_income),
        status: row.status_keuangan,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    })
  } catch (error) {
    console.error("GET /api/ai/budget/[month] error", error)
    return NextResponse.json({ exists: false, message: "Gagal mengambil analisis budget" }, { status: 500 })
  }
}
