import { SignJWT, jwtVerify } from "jose"

export const SESSION_COOKIE_NAME = "fm_session"

const encoder = new TextEncoder()

function getSecretKey() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable belum diatur")
  }
  return encoder.encode(secret)
}

export async function createSessionToken(user: { id: number; email: string; name?: string | null }) {
  return new SignJWT({
    email: user.email,
    name: user.name ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey())
}

export type SessionUser = {
  id: number
  email: string
  name: string | null
}

export async function verifySessionToken(token: string): Promise<SessionUser> {
  const { payload } = await jwtVerify(token, getSecretKey())
  return {
    id: Number(payload.sub),
    email: String(payload.email ?? ""),
    name: payload.name !== undefined && payload.name !== null ? String(payload.name) : null,
  }
}

