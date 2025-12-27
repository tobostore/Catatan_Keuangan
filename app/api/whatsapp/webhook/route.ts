import { NextResponse } from "next/server"
import type { RowDataPacket } from "mysql2"

import { createTransaction, type TransactionResponse, InvalidAccountError } from "@/app/api/transactions/helpers"
import { resolveUserReference } from "@/lib/external-transaction-utils"
import { query } from "@/lib/db"
import { buildAccountBalanceMessage } from "@/lib/account-balances"
import { sendTransactionNotification, sendWhatsAppText, formatTransactionMessage } from "@/lib/whatsapp"
import { isBalanceCommand, parseTransactionCommand } from "@/lib/whatsapp-commands"

const SECRET = process.env.WHATSAPP_WEBHOOK_SECRET?.trim()
const DEFAULT_USER_ID = readNumberEnv("WHATSAPP_WEBHOOK_DEFAULT_USER_ID")
const ALLOWED_SENDERS = buildAllowedSenderSet()
if (process.env.NODE_ENV !== "production") {
  console.log("[whatsapp-webhook] allowed senders", Array.from(ALLOWED_SENDERS))
}
const SENDER_MAP = buildSenderMap()
const SHOULD_ACK = process.env.WHATSAPP_WEBHOOK_SEND_ACK === "true"
const MESSAGE_KEY_SET = new Set(["message", "text", "body", "content", "conversation", "caption", "displaybody"])
const SENDER_KEY_SET = new Set([
  "from",
  "sender",
  "phone",
  "jid",
  "number",
  "remotejid",
  "remote_jid",
  "chatid",
  "chat_id",
  "author",
  "participant",
  "contact",
  "wid",
])

export async function POST(request: Request) {
  if (SECRET) {
    const providedSecret = request.headers.get("x-whatsapp-secret")
    const querySecret = new URL(request.url).searchParams.get("secret")
    if (providedSecret !== SECRET && querySecret !== SECRET) {
      return NextResponse.json({ message: "Token webhook tidak valid" }, { status: 401 })
    }
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch (error) {
    console.error("Failed to parse WhatsApp webhook payload", error)
    return NextResponse.json({ message: "Payload harus berupa JSON" }, { status: 400 })
  }

  const { message, sender } = extractMessageAndSender(payload)
  if (!message) {
    return NextResponse.json({ message: "Teks pesan tidak ditemukan" }, { status: 400 })
  }

  if (!sender) {
    return NextResponse.json({ message: "Pengirim tidak terdeteksi" }, { status: 400 })
  }

  if (shouldIgnoreMessage(message)) {
    return NextResponse.json({ message: "Pesan diabaikan" }, { status: 200 })
  }

  if (ALLOWED_SENDERS.size > 0 && !ALLOWED_SENDERS.has(sender)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[whatsapp-webhook] blocked sender", sender)
      console.warn("[whatsapp-webhook] sender codepoints", toCodepoints(sender))
    }
    return NextResponse.json({ message: "Pengirim tidak diizinkan" }, { status: 403 })
  }

  const registrationIntent = parseRegistrationIntent(message)
  if (registrationIntent.status === "error") {
    return NextResponse.json({ message: registrationIntent.message }, { status: 400 })
  }

  if (registrationIntent.status === "register") {
    const registrationResponse = await handleRegistrationCommand(sender, registrationIntent)
    return registrationResponse
  }

  const senderConfig = await resolveSenderConfig(sender)
  const userId = senderConfig?.userId ?? DEFAULT_USER_ID
  if (!userId) {
    return NextResponse.json({ message: "Konfigurasi user default webhook belum diatur" }, { status: 500 })
  }

  if (isBalanceCommand(message)) {
    return handleBalanceCommand(sender, userId)
  }

  const parsed = parseTransactionCommand(message)
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.error }, { status: 400 })
  }

  let transaction: TransactionResponse | null
  try {
    transaction = await createTransaction({
      userId,
      type: parsed.data.type,
      category: parsed.data.category,
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: parsed.data.date,
      preferredAccountId: senderConfig?.accountId,
      submittedAccountId: parsed.data.accountId,
    })
  } catch (error) {
    if (error instanceof InvalidAccountError) {
      return NextResponse.json({ message: error.message }, { status: 400 })
    }
    console.error("Failed to insert transaction from WhatsApp", error)
    return NextResponse.json({ message: "Gagal menyimpan transaksi" }, { status: 500 })
  }

  if (!transaction) {
    return NextResponse.json({ message: "Transaksi tersimpan namun tidak dapat dimuat ulang" }, { status: 201 })
  }

  void sendTransactionNotification({
    type: transaction.type,
    category: transaction.category,
    amount: transaction.amount,
    description: transaction.description,
    date: transaction.date,
    accountName: transaction.accountName,
  })

  if (SHOULD_ACK) {
    const ackMessage = buildAckMessage(transaction)
    void sendWhatsAppText({ message: ackMessage, recipients: [sender] })
  }

  return NextResponse.json({ message: "Transaksi berhasil dicatat", data: transaction })
}

function extractMessageAndSender(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { message: undefined, sender: undefined }
  }

  const source = payload as Record<string, unknown>
  const message =
    selectString(source, ["message", "text", "body", "content"]) ??
    selectNestedString(source, "data", ["message", "text", "body"]) ??
    selectNestedString(source, "payload", ["message", "text", "body"]) ??
    findStringDeep(source, MESSAGE_KEY_SET)

  const sender = normalizeSender(
    selectString(source, ["from", "sender", "phone", "jid", "number", "remoteJid"]) ??
      selectNestedString(source, "contact", ["jid", "number", "wid"]) ??
      selectNestedString(source, "data", ["from", "sender", "phone"]) ??
      findStringDeep(source, SENDER_KEY_SET),
  )

  return { message, sender }
}

function selectString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) {
      return value
    }
  }
  return undefined
}

function selectNestedString(record: Record<string, unknown>, nestedKey: string, keys: string[]) {
  const nested = record[nestedKey]
  if (!nested || typeof nested !== "object") {
    return undefined
  }

  return selectString(nested as Record<string, unknown>, keys)
}

function findStringDeep(value: unknown, keys: Set<string>): string | undefined {
  if (!value) {
    return undefined
  }

  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findStringDeep(entry, keys)
      if (found) {
        return found
      }
    }
    return undefined
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (keys.has(key.toLowerCase())) {
        const found = findStringDeep(record[key], keys)
        if (found) {
          return found
        }
      }
    }

    for (const nested of Object.values(record)) {
      const found = findStringDeep(nested, keys)
      if (found) {
        return found
      }
    }
  }

  return undefined
}

function normalizeSender(value?: string | null) {
  if (!value) {
    return undefined
  }

  const sanitized = value.replace(/[\u0000-\u0020\u007f-\u009f\u00a0\u00ad\ufeff\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
  let trimmed = sanitized.trim()
  const jidMatch = sanitized.match(/[0-9a-zA-Z_.-]+@[0-9a-zA-Z_.-]+/)
  if (jidMatch) {
    trimmed = jidMatch[0]
  }
  if (!trimmed) {
    return undefined
  }

  if (trimmed.includes("@")) {
    const lower = trimmed.toLowerCase()
    const [localPartRaw = "", domainPartRaw = ""] = lower.split("@")
    const [localPart = "", resourcePart = ""] = localPartRaw.split(":")
    const domainPart = domainPartRaw.split(":")[0] ?? domainPartRaw
    const cleanLocal = localPart.split(":")[0] ?? localPart
    if (!domainPart) {
      return cleanLocal
    }
    const cleanDomain = domainPart.split("/")[0]?.split(":")[0] ?? domainPart
    if (!cleanDomain) {
      return cleanLocal
    }
    const base = `${cleanLocal}@${cleanDomain}`
    if (resourcePart) {
      return `${base}:${resourcePart}`
    }
    return base
  }

  const digits = trimmed.replace(/[^0-9]/g, "")
  if (!digits) {
    return trimmed.toLowerCase()
  }

  return `${digits}@s.whatsapp.net`
}

function toCodepoints(value: string) {
  return Array.from(value)
    .map((char) => `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ")
}

function readNumberEnv(key: string) {
  const raw = process.env[key]?.trim()
  if (!raw) {
    return undefined
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function buildAllowedSenderSet() {
  const raw = process.env.WHATSAPP_WEBHOOK_ALLOWED_SENDERS
  if (!raw) {
    return new Set<string>()
  }

  const entries = raw
    .split(",")
    .map((entry) => normalizeSender(entry))
    .filter((entry): entry is string => Boolean(entry))

  return new Set(entries)
}

type SenderConfig = {
  userId: number
  accountId?: number
}

function buildSenderMap() {
  const raw = process.env.WHATSAPP_WEBHOOK_SENDER_MAP
  const map = new Map<string, SenderConfig>()
  if (!raw) {
    return map
  }

  for (const entry of raw.split(",")) {
    const [identifier, target] = entry.split("=").map((part) => part.trim())
    if (!identifier || !target) {
      continue
    }

    const normalizedId = normalizeSender(identifier)
    if (!normalizedId) {
      continue
    }

    const [userPart, accountPart] = target.split(":").map((part) => part.trim())
    const userId = Number(userPart)
    if (!Number.isFinite(userId)) {
      continue
    }

    const parsedAccountId = accountPart ? Number(accountPart) : undefined
    const accountId = parsedAccountId !== undefined && Number.isFinite(parsedAccountId) ? parsedAccountId : undefined
    map.set(normalizedId, {
      userId,
      accountId,
    })
  }

  return map
}

async function resolveSenderConfig(sender: string) {
  const stored = await findSenderLink(sender)
  if (stored) {
    return stored
  }
  return SENDER_MAP.get(sender)
}

function buildAckMessage(transaction: TransactionResponse) {
  const summary = formatTransactionMessage({
    type: transaction.type,
    category: transaction.category,
    amount: transaction.amount,
    description: transaction.description,
    date: transaction.date,
    accountName: transaction.accountName,
  })

  return `Transaksi berhasil dicatat.\n\n${summary}`
}

type RegistrationIntentResult =
  | { status: "none" }
  | { status: "error"; message: string }
  | { status: "register"; email: string; accountId?: number }

function parseRegistrationIntent(message: string): RegistrationIntentResult {
  const trimmed = message.trim()
  if (!trimmed.toLowerCase().startsWith("email")) {
    return { status: "none" }
  }

  const remainder = trimmed.slice(5).trim()
  if (!remainder) {
    return { status: "error", message: "Format registrasi: EMAIL <alamat> [acc=<id>]" }
  }

  const tokens = remainder
    .split(/[;\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)

  const emailCandidate = tokens.shift()
  if (!emailCandidate) {
    return { status: "error", message: "Email wajib diisi" }
  }

  const normalizedEmail = emailCandidate.toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { status: "error", message: "Format email tidak valid" }
  }

  let accountId: number | undefined
  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (lower.startsWith("acc=") || lower.startsWith("account=") || lower.startsWith("akun=")) {
      const value = token.split("=")[1]?.trim()
      const parsed = value ? Number(value) : Number.NaN
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { status: "error", message: "Account ID pada registrasi tidak valid" }
      }
      accountId = parsed
      break
    }
  }

  return { status: "register", email: normalizedEmail, accountId }
}

async function handleRegistrationCommand(sender: string, intent: Extract<RegistrationIntentResult, { status: "register" }>) {
  await ensureSenderLinkTable()
  const userResult = await resolveUserReference({ email: intent.email })
  if (!userResult.ok) {
    return NextResponse.json({ message: userResult.message }, { status: 400 })
  }

  await upsertSenderLink({ sender, userId: userResult.userId, accountId: intent.accountId })
  const responseMessage = `Registrasi berhasil. WhatsApp ini sekarang terhubung ke ${intent.email}.`
  void sendWhatsAppText({ message: responseMessage, recipients: [sender] })
  return NextResponse.json({ message: responseMessage })
}

async function handleBalanceCommand(sender: string, userId: number) {
  try {
    const summary = await buildAccountBalanceMessage(userId)
    await sendWhatsAppText({ message: summary.message, recipients: [sender] })
    return NextResponse.json({ message: "Ringkasan saldo terkirim", data: summary })
  } catch (error) {
    console.error("Failed to build balance message", error)
    return NextResponse.json({ message: "Gagal mengambil saldo akun" }, { status: 500 })
  }
}

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

async function ensureSenderLinkTable() {
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

async function upsertSenderLink({ sender, userId, accountId }: SenderLinkPayload) {
  await query(
    `
      INSERT INTO whatsapp_sender_links (sender_jid, user_id, account_id)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        account_id = VALUES(account_id),
        updated_at = CURRENT_TIMESTAMP
    `,
    [sender, userId, accountId ?? null],
  )
}

async function findSenderLink(sender: string) {
  await ensureSenderLinkTable()
  const rows = await query<SenderLinkRow[]>(
    "SELECT sender_jid, user_id, account_id FROM whatsapp_sender_links WHERE sender_jid = ? LIMIT 1",
    [sender],
  )

  if (rows.length === 0) {
    return undefined
  }

  return {
    userId: Number(rows[0].user_id),
    accountId: rows[0].account_id !== null ? Number(rows[0].account_id) : undefined,
  }
}

function shouldIgnoreMessage(message: string) {
  const normalized = message.trim().toLowerCase()
  return normalized.startsWith("#bot") || normalized.startsWith("[bot]")
}
