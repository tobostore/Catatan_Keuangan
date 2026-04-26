import { NextResponse } from "next/server"
import type { ResultSetHeader } from "mysql2"

import { query } from "@/lib/db"
import { getUserFromCookies } from "@/lib/server-session"

type Body = {
  alertId?: number
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getUserFromCookies()
    if (!sessionUser?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const body = (await request.json()) as Body
    const alertId = Number(body.alertId)

    if (!Number.isFinite(alertId) || alertId <= 0) {
      return NextResponse.json({ message: "alertId tidak valid" }, { status: 400 })
    }

    await query<ResultSetHeader>(
      `UPDATE ai_alerts
       SET is_read = TRUE
       WHERE id = ? AND user_id = ?`,
      [alertId, String(sessionUser.id)],
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("POST /api/ai/alerts/read error", error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
