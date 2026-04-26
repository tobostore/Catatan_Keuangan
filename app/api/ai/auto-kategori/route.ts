import { NextResponse } from "next/server"
import type { RowDataPacket } from "mysql2"

import { hitRateLimit } from "@/lib/ai-rate-limit"
import { query } from "@/lib/db"
import { askGroqDeterministic, parseGroqJSON } from "@/lib/groq"
import { getUserFromCookies } from "@/lib/server-session"

type Body = {
  keterangan?: string
}

type AllocationRuleRow = RowDataPacket & {
  name: string
}

type AutoKategoriResult = {
  kategori: string | null
  confidence: number
  alasan: string
}

function sanitize(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
}

function clampConfidence(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100))
}

function fallbackResult(alasan = "Deskripsi belum cukup jelas untuk menentukan kategori."): AutoKategoriResult {
  return {
    kategori: null,
    confidence: 0,
    alasan,
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getUserFromCookies()
    if (!sessionUser?.id) {
      return NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
    }

    const body = (await request.json()) as Body
    const keterangan = sanitize(String(body.keterangan ?? ""))

    if (keterangan.length < 3) {
      return NextResponse.json(fallbackResult("Deskripsi terlalu singkat untuk dicocokkan."))
    }

    const rlKey = `auto-kategori:${String(sessionUser.id)}:${new Date().toISOString().slice(0, 10)}`
    if (hitRateLimit(rlKey, 100, 24 * 60 * 60 * 1000)) {
      return NextResponse.json(fallbackResult("Batas klasifikasi harian tercapai."))
    }

    const rows = await query<AllocationRuleRow[]>(
      `SELECT name
       FROM user_allocation_rules
       WHERE user_id = ? AND is_active = 1
       ORDER BY sort_order ASC, id ASC`,
      [Number(sessionUser.id)],
    )

    const kategoriList = Array.from(
      new Set(
        rows
          .map((row) => sanitize(String(row.name ?? "")))
          .filter((name) => name.length > 0),
      ),
    )

    if (kategoriList.length === 0) {
      return NextResponse.json(fallbackResult("Belum ada kategori alokasi aktif untuk dicocokkan."))
    }

    const prompt = `Kamu adalah asisten keuangan pribadi. Tugasmu adalah mendeteksi kategori transaksi
yang paling sesuai berdasarkan deskripsi yang diberikan pengguna.

Kategori yang tersedia (dibuat oleh user):
${JSON.stringify(kategoriList)}

Pilih SATU kategori yang paling relevan dari daftar di atas.
Gunakan konteks dan makna dari deskripsi untuk mencocokkan dengan nama kategori.
Jangan hardcode asumsi kategori - sepenuhnya andalkan nama kategori dari daftar.

Input deskripsi: "${keterangan}"

Balas HANYA dengan JSON berikut, tanpa teks atau markdown tambahan:
{
  "kategori": "<nama kategori dari daftar, atau null jika tidak ada yang cocok>",
  "confidence": <0.0 - 1.0>,
  "alasan": "<1 kalimat singkat>"
}`

    const raw = await askGroqDeterministic(
      "Anda adalah asisten keuangan pribadi. Jawab hanya JSON valid sesuai format diminta.",
      prompt,
    )

    const parsed = raw ? parseGroqJSON<AutoKategoriResult>(raw) : null
    if (!parsed) {
      return NextResponse.json(fallbackResult())
    }

    const kategori = typeof parsed.kategori === "string" && kategoriList.includes(parsed.kategori) ? parsed.kategori : null
    const confidence = clampConfidence(parsed.confidence)
    const alasan = sanitize(String(parsed.alasan ?? "Tidak ada alasan yang diberikan."))

    return NextResponse.json({ kategori, confidence, alasan })
  } catch (error) {
    console.error("POST /api/ai/auto-kategori error", error)
    return NextResponse.json(fallbackResult())
  }
}
