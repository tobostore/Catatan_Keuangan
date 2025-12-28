import type { RowDataPacket } from "mysql2"

import { query } from "@/lib/db"
import { normalizeWhatsAppJid } from "@/lib/whatsapp-utils"

type SenderLinkRow = RowDataPacket & {
  sender_jid: string
  user_id: number
  account_id: number | null
}

type SenderLinkPayload = {
  sender: string
  userId: number
  accountId?: number
}

let senderLinkTablePromise: Promise<void> | null = null

export async function ensureSenderLinkTable() {
  if (!senderLinkTablePromise) {
    senderLinkTablePromise = query(`
      CREATE TABLE IF NOT EXISTS whatsapp_sender_links (
        sender_jid VARCHAR(191) PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        account_id BIGINT UNSIGNED NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)
      .then(() => undefined)
      .catch((error) => {
        senderLinkTablePromise = null
        throw error
      })
  }

  await senderLinkTablePromise
}

export async function upsertSenderLink({ sender, userId, accountId }: SenderLinkPayload) {
  const normalized = normalizeWhatsAppJid(sender)
  if (!normalized) {
    return
  }

  await ensureSenderLinkTable()
  await query(
    `
      INSERT INTO whatsapp_sender_links (sender_jid, user_id, account_id)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        account_id = VALUES(account_id),
        updated_at = CURRENT_TIMESTAMP
    `,
    [normalized, userId, accountId ?? null],
  )
}

export async function findSenderLink(sender: string) {
  await ensureSenderLinkTable()
  const normalized = normalizeWhatsAppJid(sender)
  const candidates = Array.from(new Set([normalized, sender].filter((entry): entry is string => Boolean(entry))))

  let row = await fetchLinkByCandidates(candidates)
  if (!row && normalized) {
    row = await fetchLinkByPattern(`%${normalized}%`)
  }

  if (!row) {
    return undefined
  }

  const sanitized = normalizeWhatsAppJid(row.sender_jid) ?? row.sender_jid
  if (sanitized !== row.sender_jid) {
    void migrateSenderJid(row.sender_jid, sanitized)
  }

  return {
    userId: Number(row.user_id),
    accountId: row.account_id !== null ? Number(row.account_id) : undefined,
  }
}

export async function listSenderLinksForUser(userId: number) {
  await ensureSenderLinkTable()
  const rows = await query<SenderLinkRow[]>(
    "SELECT sender_jid FROM whatsapp_sender_links WHERE user_id = ?",
    [userId],
  )
  const sanitized = rows
    .map((row) => normalizeWhatsAppJid(row.sender_jid))
    .filter((jid): jid is string => Boolean(jid))
  return Array.from(new Set(sanitized))
}

async function fetchLinkByCandidates(candidates: string[]) {
  if (candidates.length === 0) {
    return undefined
  }
  const placeholders = candidates.map(() => "?").join(", ")
  const rows = await query<SenderLinkRow[]>(
    `SELECT sender_jid, user_id, account_id FROM whatsapp_sender_links WHERE sender_jid IN (${placeholders}) LIMIT 1`,
    candidates,
  )
  return rows[0]
}

async function fetchLinkByPattern(pattern: string) {
  const rows = await query<SenderLinkRow[]>(
    "SELECT sender_jid, user_id, account_id FROM whatsapp_sender_links WHERE sender_jid LIKE ? LIMIT 1",
    [pattern],
  )
  return rows[0]
}

async function migrateSenderJid(current: string, normal: string) {
  try {
    await query(
      "UPDATE whatsapp_sender_links SET sender_jid = ?, updated_at = CURRENT_TIMESTAMP WHERE sender_jid = ?",
      [normal, current],
    )
  } catch (error) {
    console.warn("Failed to normalize sender jid", current, error)
  }
}