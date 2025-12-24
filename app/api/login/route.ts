import { NextResponse } from "next/server"
import type { RowDataPacket } from "mysql2"

import { createHash } from "crypto"

import { query } from "@/lib/db"
import { createSessionToken } from "@/lib/auth"
import { setSessionCookie } from "@/lib/server-session"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === "string" ? body.email.trim() : ""
    const password = typeof body?.password === "string" ? body.password : ""

    if (!email || !password) {
      return NextResponse.json({ message: "Email dan password wajib diisi" }, { status: 400 })
    }

    const hashed = createHash("md5").update(password).digest("hex")

    const rows = await query<
      (RowDataPacket & { id: number; email: string; name: string | null; password_hash: string })[]
    >("SELECT id, email, name, password_hash FROM users WHERE email = ? LIMIT 1", [email])

    if (rows.length === 0) {
      console.warn("Login gagal: user tidak ditemukan", { email })
      return NextResponse.json({ message: "Email atau password salah" }, { status: 401 })
    }

    const userRow = rows[0]
    console.info("Login debug", {
      email,
      hashedInput: hashed,
      storedHash: userRow.password_hash,
    })
    if (userRow.password_hash !== hashed) {
      return NextResponse.json({ message: "Email atau password salah" }, { status: 401 })
    }

    const user = { id: Number(userRow.id), email: userRow.email, name: userRow.name }
    const token = await createSessionToken(user)
    await setSessionCookie(token)

    return NextResponse.json({ user: { id: String(user.id), email: user.email, name: user.name } })
  } catch (error) {
    console.error("POST /api/login error", error)
    return NextResponse.json({ message: "Terjadi kesalahan saat login" }, { status: 500 })
  }
}
