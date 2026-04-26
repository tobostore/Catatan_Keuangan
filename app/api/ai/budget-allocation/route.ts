import { NextResponse } from "next/server"
import type { ResultSetHeader, RowDataPacket } from "mysql2"

import { query } from "@/lib/db"
import { askGroq, parseGroqJSON } from "@/lib/groq"
import { getUserFromCookies } from "@/lib/server-session"

type RuleRow = RowDataPacket & {
  id: number
  name: string
  percentage: number
  sort_order: number
  is_active: number
}

type AllocationBody = {
  autoAllocate?: boolean
  rules?: Array<{
    id?: number
    name?: string
    percentage?: number
  }>
}

const DEFAULT_RULES = [
  { name: "Kebutuhan Pokok", percentage: 50, sortOrder: 1 },
  { name: "Keinginan", percentage: 30, sortOrder: 2 },
  { name: "Tabungan", percentage: 20, sortOrder: 3 },
]

function clampPercent(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100))
}

async function ensureDefaultRules(userId: number) {
  for (const item of DEFAULT_RULES) {
    await query<ResultSetHeader>(
      `INSERT INTO user_allocation_rules (user_id, name, percentage, description, sort_order, is_active)
       SELECT ?, ?, ?, ?, ?, 1
       WHERE NOT EXISTS (
         SELECT 1 FROM user_allocation_rules WHERE user_id = ? AND LOWER(name) = LOWER(?)
       )`,
      [userId, item.name, item.percentage, "Preferensi alokasi budget", item.sortOrder, userId, item.name],
    )
  }
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim()
}

type ExpenseForAI = RowDataPacket & {
  kategori: string | null
  total: number
}

function normalizePercentages(items: Array<{ name: string; percentage?: number }>) {
  const sanitized = items.map((item) => ({
    name: item.name,
    percentage: Math.max(0, Number(item.percentage ?? 0)),
  }))

  const total = sanitized.reduce((sum, item) => sum + item.percentage, 0)
  if (total <= 0) {
    const even = 100 / Math.max(1, sanitized.length)
    return sanitized.map((item) => ({ ...item, percentage: Math.round(even * 100) / 100 }))
  }

  return sanitized.map((item) => ({
    ...item,
    percentage: Math.round(((item.percentage / total) * 100) * 100) / 100,
  }))
}

async function generateAllocationByAI(userId: number, rules: Array<{ name: string }>) {
  const expenseRows = await query<ExpenseForAI[]>(
    `SELECT c.name AS kategori, SUM(t.amount) AS total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ?
       AND t.type = 'expense'
       AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
     GROUP BY c.name
     ORDER BY total DESC`,
    [userId],
  )

  const systemPrompt = `Kamu adalah perencana keuangan pribadi. Jawab HANYA dengan JSON valid.`
  const userPrompt = `Buat alokasi persentase budget untuk pos berikut:
${JSON.stringify(rules.map((rule) => rule.name))}

Referensi histori pengeluaran 3 bulan terakhir:
${JSON.stringify(expenseRows)}

Aturan:
- Total persentase harus tepat 100.
- Semua persentase >= 0.
- Fokus prioritas kebutuhan pokok, lalu kewajiban, lalu tabungan/dana darurat.
- Beri alokasi realistis untuk gaya hidup (keinginan) agar tetap terkontrol.

Format output wajib:
{
  "rules": [
    { "name": "string", "percentage": number }
  ]
}`

  const raw = await askGroq(systemPrompt, userPrompt)
  const parsed = raw ? parseGroqJSON<{ rules?: Array<{ name?: string; percentage?: number }> }>(raw) : null
  const parsedRules = Array.isArray(parsed?.rules) ? parsed.rules : []

  if (parsedRules.length === 0) {
    return normalizePercentages(rules.map((rule) => ({ name: rule.name })))
  }

  const byName = new Map<string, number>()
  for (const item of parsedRules) {
    const name = normalizeName(item.name)
    if (!name) continue
    byName.set(name.toLowerCase(), clampPercent(item.percentage))
  }

  const merged = rules.map((rule) => ({
    name: rule.name,
    percentage: byName.get(rule.name.toLowerCase()) ?? 0,
  }))

  return normalizePercentages(merged)
}

export async function GET() {
  try {
    const user = await getUserFromCookies()
    if (!user?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const userId = Number(user.id)
    await ensureDefaultRules(userId)

    const rows = await query<RuleRow[]>(
      `SELECT id, name, percentage, sort_order, is_active
       FROM user_allocation_rules
       WHERE user_id = ? AND is_active = 1
       ORDER BY sort_order ASC, id ASC`,
      [userId],
    )

    const data = rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name ?? ""),
      percentage: Number(row.percentage ?? 0),
      sortOrder: Number(row.sort_order ?? 0),
      isActive: Boolean(row.is_active),
    }))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("GET /api/ai/budget-allocation error", error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getUserFromCookies()
    if (!user?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const body = (await request.json()) as AllocationBody
    const incomingRules = Array.isArray(body.rules) ? body.rules : []
    const normalizedRules = incomingRules
      .map((item, index) => ({
        id: typeof item.id === "number" && Number.isFinite(item.id) ? Math.trunc(item.id) : undefined,
        name: normalizeName(item.name),
        percentage: clampPercent(item.percentage),
        sortOrder: index + 1,
      }))
      .filter((item) => item.name.length > 0)

    if (normalizedRules.length === 0) {
      return NextResponse.json({ message: "Minimal harus ada 1 pos alokasi" }, { status: 400 })
    }

    const duplicateCheck = new Set<string>()
    for (const item of normalizedRules) {
      const key = item.name.toLowerCase()
      if (duplicateCheck.has(key)) {
        return NextResponse.json({ message: `Nama pos duplikat: ${item.name}` }, { status: 400 })
      }
      duplicateCheck.add(key)
    }

    const useAutoAllocate = body.autoAllocate !== false

    const finalPercentages = useAutoAllocate
      ? await generateAllocationByAI(
          Number(user.id),
          normalizedRules.map((rule) => ({ name: rule.name })),
        )
      : normalizePercentages(normalizedRules)

    const finalRules = normalizedRules.map((item, index) => ({
      ...item,
      percentage: finalPercentages[index]?.percentage ?? 0,
    }))

    const userId = Number(user.id)
    await ensureDefaultRules(userId)

    await query<ResultSetHeader>(
      `UPDATE user_allocation_rules
       SET is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [userId],
    )

    for (const item of finalRules) {
      if (item.id && item.id > 0) {
        await query<ResultSetHeader>(
          `UPDATE user_allocation_rules
           SET name = ?, percentage = ?, sort_order = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND user_id = ?`,
          [item.name, item.percentage, item.sortOrder, item.id, userId],
        )
      } else {
        await query<ResultSetHeader>(
          `INSERT INTO user_allocation_rules (user_id, name, percentage, description, sort_order, is_active)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [userId, item.name, item.percentage, "Preferensi alokasi budget", item.sortOrder],
        )
      }
    }

    const rows = await query<RuleRow[]>(
      `SELECT id, name, percentage, sort_order, is_active
       FROM user_allocation_rules
       WHERE user_id = ? AND is_active = 1
       ORDER BY sort_order ASC, id ASC`,
      [userId],
    )

    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? ""),
        percentage: Number(row.percentage ?? 0),
        sortOrder: Number(row.sort_order ?? 0),
        isActive: Boolean(row.is_active),
      })),
    })
  } catch (error) {
    console.error("PUT /api/ai/budget-allocation error", error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
