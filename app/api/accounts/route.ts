import { NextResponse } from "next/server"
import type { RowDataPacket } from "mysql2"

import { query } from "@/lib/db"
import { getUserFromCookies } from "@/lib/server-session"

type AccountRow = RowDataPacket & {
  id: number
  name: string
  type: string
  institution: string | null
  account_number: string | null
  opening_balance: number
}

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

    const rows = await query<AccountRow[]>(
      "SELECT id, name, type, institution, account_number, opening_balance FROM accounts WHERE user_id = ? ORDER BY name ASC",
      [userId],
    )

    const data = rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      type: row.type,
      institution: row.institution,
      accountNumber: row.account_number,
      openingBalance: Number(row.opening_balance ?? 0),
    }))

    return NextResponse.json(data)
  } catch (error) {
    console.error("GET /api/accounts error", error)
    return NextResponse.json({ message: "Gagal mengambil data akun" }, { status: 500 })
  }
}
