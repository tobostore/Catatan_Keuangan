import { NextResponse } from "next/server"
import type { ResultSetHeader, RowDataPacket } from "mysql2"

import { hitRateLimit } from "@/lib/ai-rate-limit"
import { query } from "@/lib/db"
import { askGroq, parseGroqJSON } from "@/lib/groq"
import { getUserFromCookies } from "@/lib/server-session"
import type { BudgetAnalysis, SaranBudgetKategori } from "@/types/ai"

type ExpenseRow = RowDataPacket & {
  kategori: string | null
  total: number
  jumlah_transaksi: number
}

type AvgExpenseRow = RowDataPacket & {
  kategori: string | null
  rata_rata: number
}

type AllocationRow = RowDataPacket & {
  id: number
  name: string
  percentage: number
  sort_order: number
}

type SalaryIncomeRow = RowDataPacket & {
  total_gaji: number
}

type RequestBody = {
  userId?: string
  month?: string
}

type AllocationRule = {
  name: string
  percentage: number
  sortOrder: number
}

function sanitizeText(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
}

function toInt(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0
  return Math.max(0, Math.round(value))
}

function toPercent(value: unknown) {
  const n = toInt(value)
  return Math.max(0, Math.min(100, n))
}

function isValidMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
}

function normalizeAllocationRules(rows: AllocationRow[]): AllocationRule[] {
  const normalized = rows
    .map((row, index) => ({
      name: sanitizeText(String(row.name ?? "")),
      percentage: Math.max(0, Number(row.percentage ?? 0)),
      sortOrder: Number(row.sort_order ?? index + 1),
    }))
    .filter((item) => item.name.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  if (normalized.length === 0) {
    return [
      { name: "Kebutuhan Pokok", percentage: 50, sortOrder: 1 },
      { name: "Keinginan", percentage: 30, sortOrder: 2 },
      { name: "Tabungan", percentage: 20, sortOrder: 3 },
    ]
  }

  const total = normalized.reduce((sum, item) => sum + item.percentage, 0)
  if (total <= 0) {
    const even = 100 / normalized.length
    return normalized.map((item, index) => ({ ...item, percentage: even, sortOrder: index + 1 }))
  }

  return normalized.map((item, index) => ({
    ...item,
    percentage: (item.percentage / total) * 100,
    sortOrder: index + 1,
  }))
}

function toIdealAllocationItems(monthlyIncome: number, rules: AllocationRule[]) {
  return rules.map((rule) => ({
    name: rule.name,
    percentage: Math.round(rule.percentage * 100) / 100,
    amount: toInt((monthlyIncome * rule.percentage) / 100),
  }))
}

function findTabunganAmount(items: Array<{ name: string; amount: number }>) {
  const match = items.find((item) => /tabungan|saving|investasi|dana darurat/i.test(item.name))
  return toInt(match?.amount ?? 0)
}

function fallbackBudgetAnalysis(
  monthlyIncome: number,
  totalExpense: number,
  nowRows: ExpenseRow[],
  avgRows: AvgExpenseRow[],
  allocationRules: AllocationRule[],
): BudgetAnalysis {
  const percentage = monthlyIncome > 0 ? Math.round((totalExpense / monthlyIncome) * 100) : 0
  const status: BudgetAnalysis["status_keuangan"] =
    percentage <= 70 ? "sehat" : percentage <= 90 ? "perhatian" : "kritis"

  const avgMap = new Map<string, number>()
  for (const row of avgRows) {
    avgMap.set(row.kategori ?? "Lainnya", toInt(Number(row.rata_rata ?? 0)))
  }

  const saranBudget: SaranBudgetKategori[] = nowRows.map((row) => {
    const kategori = row.kategori ?? "Lainnya"
    const current = toInt(Number(row.total ?? 0))
    const avg = avgMap.get(kategori) ?? 0
    const batasSaran = avg > 0 ? toInt(Math.round(avg * 1.1)) : toInt(Math.round(monthlyIncome * 0.1))
    const over = batasSaran > 0 ? current / batasSaran : 0

    const itemStatus: SaranBudgetKategori["status"] =
      over <= 1 ? "aman" : over <= 1.3 ? "berlebih" : "kritis"

    const saran =
      itemStatus === "aman"
        ? `Pengeluaran ${kategori} masih terkendali, pertahankan pola saat ini.`
        : itemStatus === "berlebih"
          ? `Kurangi pengeluaran ${kategori} sekitar ${toInt(current - batasSaran)} agar kembali ke batas aman.`
          : `Pengeluaran ${kategori} terlalu tinggi, lakukan pembatasan ketat minggu ini.`

    return {
      kategori,
      pengeluaran_sekarang: current,
      batas_saran: batasSaran,
      status: itemStatus,
      saran,
    }
  })

  const allocationItems = toIdealAllocationItems(monthlyIncome, allocationRules)
  const legacyMap = new Map(allocationItems.map((item) => [item.name.toLowerCase(), item.amount]))
  const targetTabungan = findTabunganAmount(allocationItems)

  return {
    status_keuangan: status,
    persentase_pengeluaran: toPercent(percentage),
    pesan_utama:
      status === "sehat"
        ? "Arus kas bulan ini cukup sehat dan masih memberi ruang untuk menabung."
        : status === "perhatian"
          ? "Pengeluaran mulai menekan arus kas, perlu pengendalian di beberapa kategori."
          : "Pengeluaran terlalu tinggi dibanding pemasukan, perlu tindakan korektif segera.",
    saran_budget: saranBudget,
    alokasi_ideal: {
      kebutuhan_pokok: toInt(legacyMap.get("kebutuhan pokok") ?? 0),
      keinginan: toInt(legacyMap.get("keinginan") ?? 0),
      tabungan: targetTabungan,
    },
    alokasi_ideal_items: allocationItems,
    target_tabungan_bulan_ini: targetTabungan,
    estimasi_tabungan_aktual: toInt(monthlyIncome - totalExpense),
    tips_bulan_ini: [
      "Tetapkan batas pengeluaran mingguan agar total bulanan tidak melonjak.",
      "Prioritaskan kebutuhan pokok dan tunda pembelian non-prioritas.",
      "Sisihkan dana tabungan di awal bulan, bukan dari sisa akhir bulan.",
    ],
  }
}

function normalizeAnalysis(
  input: BudgetAnalysis,
  monthlyIncome: number,
  totalExpense: number,
  allocationRules: AllocationRule[],
): BudgetAnalysis {
  const allocationItems =
    Array.isArray(input.alokasi_ideal_items) && input.alokasi_ideal_items.length > 0
      ? input.alokasi_ideal_items.map((item) => ({
          name: sanitizeText(String(item.name ?? "Lainnya")),
          percentage: Math.max(0, Number(item.percentage ?? 0)),
          amount: toInt(item.amount),
        }))
      : toIdealAllocationItems(monthlyIncome, allocationRules)

  const legacyMap = new Map(allocationItems.map((item) => [item.name.toLowerCase(), item.amount]))
  const targetTabungan =
    toInt(input.target_tabungan_bulan_ini) > 0 ? toInt(input.target_tabungan_bulan_ini) : findTabunganAmount(allocationItems)

  return {
    status_keuangan: input.status_keuangan,
    persentase_pengeluaran: toPercent(input.persentase_pengeluaran),
    pesan_utama: sanitizeText(input.pesan_utama ?? ""),
    saran_budget: Array.isArray(input.saran_budget)
      ? input.saran_budget.map((item) => ({
          kategori: sanitizeText(item.kategori ?? "Lainnya"),
          pengeluaran_sekarang: toInt(item.pengeluaran_sekarang),
          batas_saran: toInt(item.batas_saran),
          status: item.status,
          saran: sanitizeText(item.saran ?? ""),
        }))
      : [],
    alokasi_ideal: {
      kebutuhan_pokok: toInt(input.alokasi_ideal?.kebutuhan_pokok ?? legacyMap.get("kebutuhan pokok") ?? 0),
      keinginan: toInt(input.alokasi_ideal?.keinginan ?? legacyMap.get("keinginan") ?? 0),
      tabungan: toInt(input.alokasi_ideal?.tabungan ?? targetTabungan),
    },
    alokasi_ideal_items: allocationItems,
    target_tabungan_bulan_ini: targetTabungan,
    estimasi_tabungan_aktual: toInt(input.estimasi_tabungan_aktual ?? monthlyIncome - totalExpense),
    tips_bulan_ini: Array.isArray(input.tips_bulan_ini)
      ? input.tips_bulan_ini.slice(0, 3).map((tip) => sanitizeText(tip))
      : [],
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

    const rlKey = `budget:${userId}:${month}:${new Date().toISOString().slice(0, 10)}`
    if (hitRateLimit(rlKey, 3, 24 * 60 * 60 * 1000)) {
      return NextResponse.json({ message: "Batas analisis harian tercapai" }, { status: 429 })
    }

    const salaryRows = await query<SalaryIncomeRow[]>(
      `SELECT COALESCE(SUM(t.amount), 0) AS total_gaji
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ?
         AND DATE_FORMAT(t.transaction_date, '%Y-%m') = ?
         AND t.type = 'income'
         AND LOWER(TRIM(COALESCE(c.name, ''))) = 'gaji'`,
      [Number(userId), month],
    )

    const autoIncome = Number(salaryRows[0]?.total_gaji ?? 0)
    const monthlyIncome = autoIncome

    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
      return NextResponse.json(
        {
          message: "Belum ada transaksi pemasukan kategori Gaji di bulan ini.",
        },
        { status: 400 },
      )
    }

    const expenseRows = await query<ExpenseRow[]>(
      `SELECT c.name AS kategori, SUM(t.amount) AS total, COUNT(*) AS jumlah_transaksi
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ?
         AND DATE_FORMAT(t.transaction_date, '%Y-%m') = ?
         AND t.type = 'expense'
       GROUP BY c.name`,
      [Number(userId), month],
    )

    const avgRows = await query<AvgExpenseRow[]>(
      `SELECT kategori, AVG(total_per_bulan) AS rata_rata
       FROM (
         SELECT c.name AS kategori,
                DATE_FORMAT(t.transaction_date, '%Y-%m') AS bulan,
                SUM(t.amount) AS total_per_bulan
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = ?
           AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
           AND t.type = 'expense'
         GROUP BY c.name, bulan
       ) x
       GROUP BY kategori`,
      [Number(userId)],
    )

    const totalExpense = expenseRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0)
    const sisaUang = monthlyIncome - totalExpense

    const allocationRows = await query<AllocationRow[]>(
      `SELECT id, name, percentage, sort_order
       FROM user_allocation_rules
       WHERE user_id = ? AND is_active = 1`,
      [Number(userId)],
    )
    const allocationRules = normalizeAllocationRules(allocationRows)

    const systemPrompt = `Kamu adalah analis keuangan pribadi yang ahli.
Berikan analisis dan saran budget HANYA dalam format JSON valid.
Jangan tambahkan teks apapun di luar JSON.
Gunakan Bahasa Indonesia. Semua angka dalam format integer (tanpa titik/koma).`

    const userPrompt = `Data keuangan pengguna bulan ini:
- Gaji/Pemasukan: Rp ${toInt(monthlyIncome)}
- Total pengeluaran bulan ini: Rp ${toInt(totalExpense)}
- Sisa uang: Rp ${toInt(sisaUang)}
- Rincian pengeluaran per kategori bulan ini: ${JSON.stringify(expenseRows)}
- Rata-rata pengeluaran per kategori 3 bulan lalu: ${JSON.stringify(avgRows)}

Berikan response JSON dengan struktur PERSIS seperti ini:
{
  "status_keuangan": "sehat" | "perhatian" | "kritis",
  "persentase_pengeluaran": number,
  "pesan_utama": "string, 1 kalimat ringkasan kondisi keuangan",
  "saran_budget": [
    {
      "kategori": "string",
      "pengeluaran_sekarang": number,
      "batas_saran": number,
      "status": "aman" | "berlebih" | "kritis",
      "saran": "string, 1 kalimat saran spesifik"
    }
  ],
  "alokasi_ideal": {
    "kebutuhan_pokok": number,
    "keinginan": number,
    "tabungan": number
  },
  "target_tabungan_bulan_ini": number,
  "estimasi_tabungan_aktual": number,
  "tips_bulan_ini": ["string", "string", "string"]
}`

    const raw = await askGroq(systemPrompt, userPrompt)
    const aiAnalysis = raw ? parseGroqJSON<BudgetAnalysis>(raw) : null

    const merged = normalizeAnalysis(
      aiAnalysis ?? fallbackBudgetAnalysis(monthlyIncome, totalExpense, expenseRows, avgRows, allocationRules),
      monthlyIncome,
      totalExpense,
      allocationRules,
    )

    await query<ResultSetHeader>(
      `INSERT INTO ai_budget_analysis
      (user_id, month, monthly_income, status_keuangan, persentase_pengeluaran, pesan_utama, analysis_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        monthly_income = VALUES(monthly_income),
        status_keuangan = VALUES(status_keuangan),
        persentase_pengeluaran = VALUES(persentase_pengeluaran),
        pesan_utama = VALUES(pesan_utama),
        analysis_json = VALUES(analysis_json),
        updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        month,
        toInt(monthlyIncome),
        merged.status_keuangan,
        toPercent(merged.persentase_pengeluaran),
        merged.pesan_utama,
        JSON.stringify(merged),
      ],
    )

    return NextResponse.json({ success: true, data: merged })
  } catch (error) {
    console.error("POST /api/ai/budget error", error)
    return NextResponse.json({ success: false, message: "Gagal membuat analisis budget" }, { status: 500 })
  }
}
