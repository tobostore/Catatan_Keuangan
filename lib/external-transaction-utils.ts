import type { RowDataPacket } from "mysql2"

import { query } from "@/lib/db"

export type ExternalTransactionPayload = Record<string, unknown>

export type UserResolution = { ok: true; userId: number } | { ok: false; message: string }
export type AccountResolution = { ok: true; accountId?: number } | { ok: false; message: string }

export async function resolveUserReference(payload: ExternalTransactionPayload): Promise<UserResolution> {
  const directUserId = payload.userId ?? payload.user_id
  if (directUserId !== undefined && directUserId !== null && directUserId !== "") {
    const numericId = Number(directUserId)
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return { ok: false, message: "userId tidak valid" }
    }
    return { ok: true, userId: numericId }
  }

  const emailCandidate = firstString(payload, ["email", "userEmail", "user_email"])
  if (!emailCandidate) {
    return { ok: false, message: "Email wajib diisi" }
  }

  const email = emailCandidate.trim()
  const users = await query<(RowDataPacket & { id: number })[]>("SELECT id FROM users WHERE email = ? LIMIT 1", [email])
  if (users.length === 0) {
    return { ok: false, message: "Email belum terdaftar" }
  }

  return { ok: true, userId: Number(users[0].id) }
}

export async function resolveAccountReference(
  userId: number,
  payload: ExternalTransactionPayload,
): Promise<AccountResolution> {
  const rawId = payload.accountId ?? payload.account_id
  if (rawId !== undefined && rawId !== null && rawId !== "") {
    const numericId = Number(rawId)
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return { ok: false, message: "Account ID tidak valid" }
    }
    return { ok: true, accountId: numericId }
  }

  const accountNameCandidate = firstString(payload, ["accountName", "account_name", "source", "sumber"])
  if (accountNameCandidate) {
    const rows = await query<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM accounts WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1",
      [userId, accountNameCandidate.trim()],
    )
    if (rows.length === 0) {
      return { ok: false, message: "Sumber/akun tidak ditemukan" }
    }
    return { ok: true, accountId: Number(rows[0].id) }
  }

  return { ok: true }
}

function firstString(payload: ExternalTransactionPayload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) {
      return value
    }
  }
  return undefined
}
