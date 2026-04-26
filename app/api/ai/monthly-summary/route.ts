import { NextResponse } from "next/server"
import type { ResultSetHeader, RowDataPacket } from "mysql2"

import { hitRateLimit } from "@/lib/ai-rate-limit"
import { query } from "@/lib/db"
import { askGroq, parseGroqJSON } from "@/lib/groq"
import { getUserFromCookies } from "@/lib/server-session"
import type { MonthlySummary } from "@/types/ai"

type RequestBody = {
  userId?: string
  month?: string
}

type TotalsRow = RowDataPacket & {
  total_income: number
  total_expense: number
}

type CategoryRow = RowDataPacket & {
  kategori: string | null
  total: number
}

type TopTrxRow = RowDataPacket & {
  amount: number
  category: string | null
  description: string | null
  date: string
  type: "income" | "expense"
}

type DaySpendRow = RowDataPacket & {
  date: string
  total_expense: number
}

type ActiveDaysRow = RowDataPacket & {
  active_days: number
}

type SummaryRow = RowDataPacket & {
  id: number
  month: string
  skor_keuangan: number
  grade: string
  summary_json: string
  created_at: string
}

function isValidMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
}

function toInt(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0
  return Math.round(value)
}

function sanitize(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
}

function getWorkingDaysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  const start = new Date(year, monthNumber - 1, 1)
  const end = new Date(year, monthNumber, 0)

  let workingDays = 0
  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const d = day.getDay()
    if (d >= 1 && d <= 5) {
      workingDays += 1
    }
  }

  return workingDays
}

function buildFallback(data: {
  income: number
  expense: number
  kategoriBoros: string
}): MonthlySummary {
  const savings = data.income - data.expense
  const ratio = data.income > 0 ? savings / data.income : 0

  const skor = Math.max(1, Math.min(100, Math.round(50 + ratio * 60)))
  const grade: MonthlySummary["grade"] = skor >= 80 ? "A" : skor >= 65 ? "B" : skor >= 50 ? "C" : "D"

  return {
    skor_keuangan: skor,
    grade,
    ringkasan:
      ratio >= 0.2
        ? "Kondisi keuangan bulan ini cukup kuat dengan ruang tabungan yang sehat. Pertahankan disiplin pengeluaran agar tren positif berlanjut."
        : ratio >= 0
          ? "Arus kas masih positif namun margin tabungan tipis. Pengeluaran perlu lebih selektif agar bulan depan lebih longgar."
          : "Pengeluaran melebihi pemasukan dan menekan kondisi keuangan. Prioritaskan pemulihan cash flow pada bulan berikutnya.",
    pencapaian: [
      "Pencatatan transaksi sudah konsisten sepanjang bulan.",
      "Pengeluaran utama sudah terpetakan per kategori.",
      "Ada dasar data yang cukup untuk evaluasi bulan depan.",
    ],
    perlu_diperbaiki: [
      "Kurangi pengeluaran impulsif di pertengahan bulan.",
      "Tetapkan batas kategori dengan nominal mingguan.",
      "Tingkatkan porsi tabungan otomatis sejak awal bulan.",
    ],
    target_bulan_depan: [
      "Naikkan rasio tabungan minimal 5 persen dari pemasukan.",
      "Batasi kategori boros maksimal sesuai anggaran mingguan.",
      "Lakukan review transaksi setiap akhir pekan.",
    ],
    kategori_boros: data.kategoriBoros,
    saran_kategori_boros: `Tetapkan pagu mingguan untuk kategori ${data.kategoriBoros} agar total bulanan tidak melampaui target.`,
  }
}

export async function GET(request: Request) {
  try {
    const sessionUser = await getUserFromCookies()
    if (!sessionUser?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const month = String(searchParams.get("month") ?? "").trim()

    if (!isValidMonth(month)) {
      return NextResponse.json({ message: "Format month harus YYYY-MM" }, { status: 400 })
    }

    const rows = await query<SummaryRow[]>(
      `SELECT id, month, skor_keuangan, grade, summary_json, created_at
       FROM ai_monthly_summary
       WHERE user_id = ? AND month = ?
       LIMIT 1`,
      [String(sessionUser.id), month],
    )

    if (rows.length === 0) {
      return NextResponse.json({ exists: false })
    }

    const row = rows[0]
    let data: MonthlySummary | null = null

    try {
      data = JSON.parse(row.summary_json) as MonthlySummary
    } catch {
      data = null
    }

    return NextResponse.json({
      exists: true,
      data,
      meta: {
        month: row.month,
        skor: row.skor_keuangan,
        grade: row.grade,
        createdAt: row.created_at,
      },
    })
  } catch (error) {
    console.error("GET /api/ai/monthly-summary error", error)
    return NextResponse.json({ exists: false }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getUserFromCookies()
    if (!sessionUser?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const body = (await request.json()) as RequestBody
    const userId = String(body.userId ?? "").trim()
    const month = String(body.month ?? "").trim()

    if (!userId || userId !== String(sessionUser.id)) {
      return NextResponse.json({ message: "userId tidak valid" }, { status: 400 })
    }

    if (!isValidMonth(month)) {
      return NextResponse.json({ message: "Format month harus YYYY-MM" }, { status: 400 })
    }

    const rlKey = `monthly-summary:${userId}:${month}:${new Date().toISOString().slice(0, 7)}`
    if (hitRateLimit(rlKey, 2, 31 * 24 * 60 * 60 * 1000)) {
      return NextResponse.json({ message: "Batas generate laporan tercapai" }, { status: 429 })
    }

    const totalsRows = await query<TotalsRow[]>(
      `SELECT
         SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) AS total_income,
         SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) AS total_expense
       FROM transactions t
       WHERE t.user_id = ?
         AND DATE_FORMAT(t.transaction_date, '%Y-%m') = ?`,
      [Number(userId), month],
    )

    const categoryRows = await query<CategoryRow[]>(
      `SELECT c.name AS kategori, SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ?
         AND t.type = 'expense'
         AND DATE_FORMAT(t.transaction_date, '%Y-%m') = ?
       GROUP BY c.name
       ORDER BY total DESC`,
      [Number(userId), month],
    )

    const topRows = await query<TopTrxRow[]>(
      `SELECT t.amount,
              c.name AS category,
              t.description,
              DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date,
              t.type
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ?
         AND DATE_FORMAT(t.transaction_date, '%Y-%m') = ?
       ORDER BY t.amount DESC
       LIMIT 3`,
      [Number(userId), month],
    )

    const dayRows = await query<DaySpendRow[]>(
      `SELECT DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date,
              SUM(t.amount) AS total_expense
       FROM transactions t
       WHERE t.user_id = ?
         AND t.type = 'expense'
         AND DATE_FORMAT(t.transaction_date, '%Y-%m') = ?
       GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m-%d')
       ORDER BY total_expense DESC
       LIMIT 1`,
      [Number(userId), month],
    )

    const activeRows = await query<ActiveDaysRow[]>(
      `SELECT COUNT(DISTINCT DATE_FORMAT(t.transaction_date, '%Y-%m-%d')) AS active_days
       FROM transactions t
       WHERE t.user_id = ?
         AND DATE_FORMAT(t.transaction_date, '%Y-%m') = ?`,
      [Number(userId), month],
    )

    const totalIncome = Number(totalsRows[0]?.total_income ?? 0)
    const totalExpense = Number(totalsRows[0]?.total_expense ?? 0)
    const workingDays = getWorkingDaysInMonth(month)

    const breakdown = categoryRows.map((row) => ({
      kategori: row.kategori ?? "Lainnya",
      jumlah: toInt(Number(row.total ?? 0)),
      persentase: totalExpense > 0 ? toInt((Number(row.total ?? 0) / totalExpense) * 100) : 0,
    }))

    const monthlyData = {
      total_pemasukan: toInt(totalIncome),
      total_pengeluaran: toInt(totalExpense),
      breakdown_per_kategori: breakdown,
      transaksi_terbesar: topRows.map((row) => ({
        jumlah: toInt(Number(row.amount ?? 0)),
        kategori: row.category ?? "Lainnya",
        keterangan: row.description ?? "",
        tanggal: row.date,
        tipe: row.type,
      })),
      hari_paling_boros: dayRows[0]
        ? {
            tanggal: dayRows[0].date,
            total: toInt(Number(dayRows[0].total_expense ?? 0)),
          }
        : null,
      hari_transaksi: Number(activeRows[0]?.active_days ?? 0),
      hari_kerja: workingDays,
    }

    const systemPrompt = `Kamu adalah analis keuangan. Tulis laporan keuangan bulanan yang ringkas, jujur, dan memotivasi. Return HANYA JSON valid tanpa teks lain. Bahasa Indonesia, angka tanpa titik/koma pemisah ribuan.`
    const userPrompt = `Buat laporan bulanan untuk data berikut:\nBulan: ${month}\nData: ${JSON.stringify(monthlyData)}\n\nFormat response JSON:\n{\n  "skor_keuangan": number (1-100),\n  "grade": "A" | "B" | "C" | "D",\n  "ringkasan": "string (2-3 kalimat narasi kondisi keuangan bulan ini)",\n  "pencapaian": ["string"] (hal positif yang dilakukan, maks 3),\n  "perlu_diperbaiki": ["string"] (hal yang perlu diperbaiki, maks 3),\n  "target_bulan_depan": ["string"] (3 target konkret untuk bulan depan),\n  "kategori_boros": "string (nama kategori paling boros)",\n  "saran_kategori_boros": "string (1 saran spesifik untuk kategori boros ini)"\n}`

    const raw = await askGroq(systemPrompt, userPrompt)
    const parsed = raw ? parseGroqJSON<MonthlySummary>(raw) : null

    const fallback = buildFallback({
      income: totalIncome,
      expense: totalExpense,
      kategoriBoros: breakdown[0]?.kategori ?? "Lainnya",
    })

    const summary: MonthlySummary = {
      skor_keuangan: toInt(parsed?.skor_keuangan ?? fallback.skor_keuangan),
      grade: parsed?.grade ?? fallback.grade,
      ringkasan: sanitize(parsed?.ringkasan ?? fallback.ringkasan),
      pencapaian: Array.isArray(parsed?.pencapaian)
        ? parsed.pencapaian.slice(0, 3).map((v) => sanitize(v))
        : fallback.pencapaian,
      perlu_diperbaiki: Array.isArray(parsed?.perlu_diperbaiki)
        ? parsed.perlu_diperbaiki.slice(0, 3).map((v) => sanitize(v))
        : fallback.perlu_diperbaiki,
      target_bulan_depan: Array.isArray(parsed?.target_bulan_depan)
        ? parsed.target_bulan_depan.slice(0, 3).map((v) => sanitize(v))
        : fallback.target_bulan_depan,
      kategori_boros: sanitize(parsed?.kategori_boros ?? fallback.kategori_boros),
      saran_kategori_boros: sanitize(parsed?.saran_kategori_boros ?? fallback.saran_kategori_boros),
    }

    await query<ResultSetHeader>(
      `INSERT INTO ai_monthly_summary (user_id, month, skor_keuangan, grade, summary_json)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         skor_keuangan = VALUES(skor_keuangan),
         grade = VALUES(grade),
         summary_json = VALUES(summary_json)`,
      [userId, month, summary.skor_keuangan, summary.grade, JSON.stringify(summary)],
    )

    return NextResponse.json({ success: true, data: summary })
  } catch (error) {
    console.error("POST /api/ai/monthly-summary error", error)
    return NextResponse.json({ success: false, message: "Gagal generate laporan bulanan" }, { status: 500 })
  }
}
