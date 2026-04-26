import { NextResponse } from "next/server"
import type { ResultSetHeader, RowDataPacket } from "mysql2"

import { hitRateLimit } from "@/lib/ai-rate-limit"
import { query } from "@/lib/db"
import { askGroq, parseGroqJSON } from "@/lib/groq"
import { getUserFromCookies } from "@/lib/server-session"
import type { AIAlert } from "@/types/ai"

type BiggestExpenseRow = RowDataPacket & {
  jumlah: number
  kategori: string | null
  keterangan: string | null
  tanggal: string
}

type AvgRow = RowDataPacket & {
  rata_rata: number
}

type CategoryMonthRow = RowDataPacket & {
  kategori: string | null
  bulan: string
  total: number
}

type TotalsRow = RowDataPacket & {
  total_income: number
  total_expense: number
}

type RawAlert = {
  id: string
  tipe: "besar" | "kategori" | "saldo"
  level: "warning" | "danger"
  angkaUtama: number
  metadata: Record<string, string | number>
}

type GroqAlert = {
  id: string
  tipe: "besar" | "kategori" | "saldo"
  level: "warning" | "danger"
  judul: string
  pesan: string
  aksi: string
}

type AlertRow = RowDataPacket & AIAlert

function toInt(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0
  return Math.round(value)
}

function sanitize(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
}

function fallbackMessages(rawAlerts: RawAlert[]): GroqAlert[] {
  return rawAlerts.map((alert) => {
    if (alert.tipe === "besar") {
      return {
        id: alert.id,
        tipe: alert.tipe,
        level: alert.level,
        judul: "Pengeluaran Besar",
        pesan: `Ada transaksi besar Rp ${toInt(alert.angkaUtama)} dalam 7 hari terakhir yang jauh di atas pola normal.`,
        aksi: "Tinjau transaksi tersebut dan batasi pengeluaran non-prioritas minggu ini.",
      }
    }

    if (alert.tipe === "kategori") {
      return {
        id: alert.id,
        tipe: alert.tipe,
        level: alert.level,
        judul: "Kategori Naik",
        pesan: `Salah satu kategori naik tajam dibanding bulan lalu sehingga berisiko menekan arus kas bulan ini.`,
        aksi: "Tetapkan batas kategori mingguan dan evaluasi transaksi terbesar di kategori itu.",
      }
    }

    return {
      id: alert.id,
      tipe: alert.tipe,
      level: alert.level,
      judul: "Saldo Menipis",
      pesan: `Sisa saldo bulan ini sudah mendekati batas aman dari total pemasukan.`,
      aksi: "Prioritaskan kebutuhan pokok dan hentikan pembelanjaan non-esensial hingga awal bulan depan.",
    }
  })
}

export async function GET(request: Request) {
  try {
    const sessionUser = await getUserFromCookies()
    if (!sessionUser?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = String(searchParams.get("userId") ?? "").trim()

    if (!userId || userId !== String(sessionUser.id)) {
      return NextResponse.json({ message: "userId tidak valid" }, { status: 400 })
    }

    const rlKey = `alerts:${userId}:${new Date().toISOString().slice(0, 13)}`
    if (hitRateLimit(rlKey, 10, 60 * 60 * 1000)) {
      const existingLimited = await query<AlertRow[]>(
        `SELECT id, tipe, level, judul, pesan, aksi, is_read, expired_at, created_at
         FROM ai_alerts
         WHERE user_id = ? AND is_read = FALSE AND expired_at > NOW()
         ORDER BY created_at DESC`,
        [userId],
      )
      return NextResponse.json({ success: true, data: existingLimited })
    }

    const biggestRows = await query<BiggestExpenseRow[]>(
      `SELECT t.amount AS jumlah,
              c.name AS kategori,
              t.description AS keterangan,
              DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS tanggal
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ?
         AND t.type = 'expense'
         AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       ORDER BY t.amount DESC
       LIMIT 1`,
      [Number(userId)],
    )

    const avgRows = await query<AvgRow[]>(
      `SELECT AVG(t.amount) AS rata_rata
       FROM transactions t
       WHERE t.user_id = ? AND t.type = 'expense'`,
      [Number(userId)],
    )

    const categoryRows = await query<CategoryMonthRow[]>(
      `SELECT c.name AS kategori,
              DATE_FORMAT(t.transaction_date, '%Y-%m') AS bulan,
              SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ?
         AND t.type = 'expense'
         AND DATE_FORMAT(t.transaction_date, '%Y-%m') IN (
           DATE_FORMAT(CURDATE(), '%Y-%m'),
           DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m')
         )
       GROUP BY c.name, bulan`,
      [Number(userId)],
    )

    const totalsRows = await query<TotalsRow[]>(
      `SELECT
         SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) AS total_income,
         SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) AS total_expense
       FROM transactions t
       WHERE t.user_id = ?
         AND DATE_FORMAT(t.transaction_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      [Number(userId)],
    )

    const rawAlerts: RawAlert[] = []

    const biggest = biggestRows[0]
    const avg = Number(avgRows[0]?.rata_rata ?? 0)
    if (biggest && avg > 0 && Number(biggest.jumlah) > avg * 3) {
      rawAlerts.push({
        id: "besar-1",
        tipe: "besar",
        level: "danger",
        angkaUtama: Number(biggest.jumlah),
        metadata: {
          kategori: biggest.kategori ?? "Lainnya",
          rata_rata: toInt(avg),
          tanggal: biggest.tanggal,
        },
      })
    }

    const thisMonth = new Map<string, number>()
    const prevMonth = new Map<string, number>()
    const currentMonth = new Date().toISOString().slice(0, 7)

    for (const row of categoryRows) {
      const key = row.kategori ?? "Lainnya"
      if (row.bulan === currentMonth) {
        thisMonth.set(key, Number(row.total ?? 0))
      } else {
        prevMonth.set(key, Number(row.total ?? 0))
      }
    }

    for (const [kategori, currTotal] of thisMonth.entries()) {
      const prevTotal = prevMonth.get(kategori) ?? 0
      if (prevTotal > 0 && currTotal > prevTotal * 1.5) {
        rawAlerts.push({
          id: `kategori-${kategori.toLowerCase().replace(/\s+/g, "-")}`,
          tipe: "kategori",
          level: currTotal > prevTotal * 2 ? "danger" : "warning",
          angkaUtama: currTotal,
          metadata: {
            kategori,
            bulan_lalu: toInt(prevTotal),
            bulan_ini: toInt(currTotal),
          },
        })
      }
    }

    const totalIncome = Number(totalsRows[0]?.total_income ?? 0)
    const totalExpense = Number(totalsRows[0]?.total_expense ?? 0)
    const sisa = totalIncome - totalExpense
    if (totalIncome > 0 && sisa < totalIncome * 0.2) {
      rawAlerts.push({
        id: "saldo-1",
        tipe: "saldo",
        level: sisa < totalIncome * 0.1 ? "danger" : "warning",
        angkaUtama: sisa,
        metadata: {
          total_income: toInt(totalIncome),
          total_expense: toInt(totalExpense),
          sisa: toInt(sisa),
        },
      })
    }

    if (rawAlerts.length > 0) {
      const systemPrompt = `Kamu adalah asisten keuangan. Tulis pesan peringatan yang singkat, jelas, dan actionable dalam Bahasa Indonesia. Return HANYA JSON valid, tanpa teks lain.`
      const userPrompt = `Buat pesan singkat (maks 2 kalimat) untuk setiap peringatan berikut.\nPeringatan: ${JSON.stringify(rawAlerts)}\n\nFormat response:\n[\n  {\n    "id": "string (sama dengan id dari input)",\n    "tipe": "besar" | "kategori" | "saldo",\n    "level": "warning" | "danger",\n    "judul": "string (maks 5 kata)",\n    "pesan": "string (maks 2 kalimat, spesifik dengan angka)",\n    "aksi": "string (1 saran tindakan konkret)"\n  }\n]`

      const raw = await askGroq(systemPrompt, userPrompt)
      const parsed = raw ? parseGroqJSON<GroqAlert[]>(raw) : null
      const alerts = Array.isArray(parsed) && parsed.length > 0 ? parsed : fallbackMessages(rawAlerts)

      for (const alert of alerts) {
        const fromInput = rawAlerts.find((r) => r.id === alert.id)
        await query<ResultSetHeader>(
          `INSERT INTO ai_alerts (user_id, tipe, level, judul, pesan, aksi, expired_at)
           VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
          [
            userId,
            alert.tipe,
            fromInput?.level ?? alert.level,
            sanitize(alert.judul).slice(0, 100),
            sanitize(alert.pesan),
            sanitize(alert.aksi),
          ],
        )
      }
    }

    const existing = await query<AlertRow[]>(
      `SELECT id, tipe, level, judul, pesan, aksi, is_read, expired_at, created_at
       FROM ai_alerts
       WHERE user_id = ? AND is_read = FALSE AND expired_at > NOW()
       ORDER BY created_at DESC`,
      [userId],
    )

    return NextResponse.json({ success: true, data: existing })
  } catch (error) {
    console.error("GET /api/ai/alerts error", error)
    return NextResponse.json({ success: false, data: [] }, { status: 500 })
  }
}
