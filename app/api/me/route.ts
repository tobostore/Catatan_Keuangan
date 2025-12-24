import { NextResponse } from "next/server"

import { getUserFromCookies } from "@/lib/server-session"

export async function GET() {
  const user = await getUserFromCookies()
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  return NextResponse.json({
    user: {
      id: String(user.id),
      email: user.email,
      name: user.name,
    },
  })
}
