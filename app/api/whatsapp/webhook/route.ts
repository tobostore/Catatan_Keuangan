import { NextResponse } from "next/server"
import type { RowDataPacket } from "mysql2"

import { createTransaction, type TransactionResponse, InvalidAccountError } from "@/app/api/transactions/helpers"
import { resolveAccountReference, resolveUserReference } from "@/lib/external-transaction-utils"
import { buildAccountBalanceMessage } from "@/lib/account-balances"
import { sendTransactionNotification, sendWhatsAppText, formatTransactionMessage } from "@/lib/whatsapp"
import { normalizeWhatsAppJid } from "@/lib/whatsapp-utils"
import { query } from "@/lib/db"
import {
  isBalanceCommand,
  isFormatHelpCommand,
  buildFormatHelpMessage,
  parseHistoryCommand,
  parseTransactionCommand,
} from "@/lib/whatsapp-commands"
import { ensureSenderLinkTable, findSenderLink, upsertSenderLink } from "@/lib/whatsapp-sender-links"

const WEBHOOK_ENABLED = process.env.WHATSAPP_WEBHOOK_ENABLED !== "false"
const SECRET = process.env.WHATSAPP_WEBHOOK_SECRET?.trim()
const STRICT_MODE = process.env.WHATSAPP_WEBHOOK_STRICT === "true"
const DEFAULT_USER_ID = readNumberEnv("WHATSAPP_WEBHOOK_DEFAULT_USER_ID")
const ALLOWED_SENDERS = buildAllowedSenderSet()
const SELF_SENDERS = buildSelfSenderSet()
if (process.env.NODE_ENV !== "production") {
  console.log("[whatsapp-webhook] allowed senders", Array.from(ALLOWED_SENDERS))
}
const SENDER_MAP = buildSenderMap()
const SHOULD_ACK = process.env.WHATSAPP_WEBHOOK_SEND_ACK !== "false"
const SHOULD_NOTIFY_LINKED = process.env.WHATSAPP_WEBHOOK_NOTIFY_LINKED === "true"
const FAILURE_NOTICE_WINDOW_MS = readNumberEnv("WHATSAPP_WEBHOOK_FAILURE_NOTICE_WINDOW_MS") ?? 20_000
const MESSAGE_KEY_SET = new Set(["message", "text", "body", "content", "conversation", "caption", "displaybody"])
const SENDER_PRIMARY_KEY_SET = new Set([
  "participant",
  "author",
  "sender",
  "from",
  "phone",
  "jid",
  "number",
  "wid",
])
const SENDER_FALLBACK_KEY_SET = new Set([
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

const globalState = globalThis as typeof globalThis & {
  __whatsappWebhookFailureNoticeMap?: Map<string, number>
}

export async function GET(request: Request) {
  if (!WEBHOOK_ENABLED) {
    return NextResponse.json({ message: "Webhook WhatsApp dinonaktifkan" }, { status: 404 })
  }

  if (SECRET) {
    const providedSecret = readWebhookSecret(request)
    if (providedSecret !== SECRET) {
      return NextResponse.json({ message: "Token webhook tidak valid" }, { status: 401 })
    }
  }

  return NextResponse.json({
    message: "Webhook WhatsApp aktif",
    data: {
      enabled: WEBHOOK_ENABLED,
      requiresSecret: Boolean(SECRET),
      hasDefaultUser: Boolean(DEFAULT_USER_ID),
      allowedSendersCount: ALLOWED_SENDERS.size,
      sendAck: SHOULD_ACK,
    },
  })
}

export async function POST(request: Request) {
  if (!WEBHOOK_ENABLED) {
    return NextResponse.json({ message: "Webhook WhatsApp dinonaktifkan" }, { status: 404 })
  }

  if (SECRET) {
    const providedSecret = readWebhookSecret(request)
    if (providedSecret !== SECRET) {
      return NextResponse.json({ message: "Token webhook tidak valid" }, { status: 401 })
    }
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch (error) {
    console.error("Failed to parse WhatsApp webhook payload", error)
    return shouldStrictReject("Payload harus berupa JSON")
  }

  const { message, sender } = extractMessageAndSender(payload)
  if (process.env.NODE_ENV !== "production") {
    console.log("[whatsapp-webhook] extracted", {
      sender,
      messagePreview: typeof message === "string" ? message.slice(0, 120) : undefined,
    })
  }
  if (!message) {
    return shouldStrictReject("Teks pesan tidak ditemukan")
  }

  if (!sender) {
    return shouldStrictReject("Pengirim tidak terdeteksi")
  }

  if (shouldIgnoreNonUserEvent(message, sender)) {
    return NextResponse.json({ message: "Event non-user diabaikan" }, { status: 200 })
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
    return replyWithFailure(sender, registrationIntent.message)
  }

  if (registrationIntent.status === "register") {
    const registrationResponse = await handleRegistrationCommand(sender, registrationIntent)
    return registrationResponse
  }

  const senderConfig = await resolveSenderConfig(sender)
  const userId = senderConfig?.userId ?? DEFAULT_USER_ID
  if (!userId) {
    await sendFailureNotice(sender, "Konfigurasi user default webhook belum diatur")
    return NextResponse.json({ message: "Konfigurasi user default webhook belum diatur" }, { status: 500 })
  }

  if (isBalanceCommand(message)) {
    return handleBalanceCommand(sender, userId)
  }

  if (isFormatHelpCommand(message)) {
    const guide = buildFormatHelpMessage()
    try {
      await sendWhatsAppText({ message: guide, recipients: [sender] })
      return NextResponse.json({ message: "Panduan format terkirim" })
    } catch (error) {
      console.error("Failed to send format guide", { sender, error })
      return NextResponse.json({ message: "Gagal mengirim panduan format" }, { status: 500 })
    }
  }

  const historyIntent = parseHistoryCommand(message)
  if (historyIntent.status === "error") {
    return replyWithFailure(sender, historyIntent.error)
  }

  if (historyIntent.status === "ok") {
    try {
      const historyMessage = await buildTransactionHistoryMessage(userId, historyIntent.data)
      await sendWhatsAppText({ message: historyMessage, recipients: [sender] })
      return NextResponse.json({ message: "Riwayat transaksi terkirim" })
    } catch (error) {
      console.error("Failed to build history message", { sender, error })
      await sendFailureNotice(sender, "Gagal mengambil riwayat transaksi")
      return NextResponse.json({ message: "Gagal mengambil riwayat transaksi" }, { status: 500 })
    }
  }

  const parsed = parseTransactionCommand(message)
  if (!parsed.ok) {
    if (!isLikelyTransactionIntent(message)) {
      return NextResponse.json({ message: "Pesan non-transaksi diabaikan" }, { status: 200 })
    }
    return replyWithFailure(sender, parsed.error)
  }

  const accountResolution = await resolveAccountReference(userId, {
    accountId: parsed.data.accountId,
    accountName: parsed.data.accountName,
    source: parsed.data.accountName,
    sumber: parsed.data.accountName,
  })
  if (!accountResolution.ok) {
    return replyWithFailure(sender, accountResolution.message)
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
      submittedAccountId: accountResolution.accountId,
    })
  } catch (error) {
    if (error instanceof InvalidAccountError) {
      await sendFailureNotice(sender, error.message)
      return NextResponse.json({ message: error.message }, { status: 400 })
    }
    console.error("Failed to insert transaction from WhatsApp", error)
    await sendFailureNotice(sender, "Gagal menyimpan transaksi")
    return NextResponse.json({ message: "Gagal menyimpan transaksi" }, { status: 500 })
  }

  if (!transaction) {
    await sendFailureNotice(sender, "Transaksi tersimpan namun tidak dapat dimuat ulang")
    return NextResponse.json({ message: "Transaksi tersimpan namun tidak dapat dimuat ulang" }, { status: 201 })
  }

  if (SHOULD_NOTIFY_LINKED) {
    void sendTransactionNotification({
      userId,
      type: transaction.type,
      category: transaction.category,
      amount: transaction.amount,
      description: transaction.description,
      date: transaction.date,
      accountName: transaction.accountName,
    })
  }

  if (SHOULD_ACK) {
    const ackMessage = buildAckMessage(transaction)
    try {
      if (process.env.NODE_ENV !== "production") {
        console.log("[whatsapp-webhook] sending ACK", { sender })
      }
      await sendWhatsAppText({ message: ackMessage, recipients: [sender] })
      if (process.env.NODE_ENV !== "production") {
        console.log("[whatsapp-webhook] ACK sent", { sender })
      }
    } catch (error) {
      console.error("Failed to send webhook ACK", { sender, error })
    }
  }

  return NextResponse.json({ message: "Transaksi berhasil dicatat", data: transaction })
}

function shouldStrictReject(message: string) {
  if (STRICT_MODE) {
    return NextResponse.json({ message }, { status: 400 })
  }

  return NextResponse.json({ message: `${message}. Event diabaikan.` }, { status: 200 })
}

async function replyWithFailure(sender: string, message: string) {
  await sendFailureNotice(sender, message)
  return shouldStrictReject(message)
}

async function sendFailureNotice(sender: string, reason: string) {
  if (shouldThrottleFailureNotice(sender, reason)) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[whatsapp-webhook] failure notice throttled", { sender, reason })
    }
    return
  }

  const failureMessage = `Transaksi gagal diproses.\nAlasan: ${reason}`
  try {
    await sendWhatsAppText({ message: failureMessage, recipients: [sender] })
  } catch (error) {
    console.error("Failed to send webhook failure notice", { sender, reason, error })
  }
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

  const sender = extractSender(source)

  return { message, sender }
}

function extractSender(source: Record<string, unknown>) {
  const candidates = [
    selectNestedString(source, "data", ["participant", "author", "sender", "phone", "jid", "number", "chatId", "chat_id"]),
    selectNestedString(source, "key", ["participant", "author", "sender", "phone", "jid", "number", "chatId", "chat_id"]),
    selectString(source, ["participant", "author", "sender", "phone", "jid", "number", "chatId", "chat_id"]),
    ...findStringsDeep(source, SENDER_PRIMARY_KEY_SET),
    ...findStringsDeep(source, SENDER_FALLBACK_KEY_SET),
  ]
    .map((value) => normalizeWhatsAppJid(value))
    .filter((value): value is string => Boolean(value))

  const uniqueCandidates = Array.from(new Set(candidates)).filter((candidate) => isLikelyWhatsAppSender(candidate))
  const preferred = uniqueCandidates.find((candidate) => !SELF_SENDERS.has(candidate) && !candidate.endsWith("@g.us"))
  if (preferred) {
    return preferred
  }

  const nonGroup = uniqueCandidates.find((candidate) => !candidate.endsWith("@g.us"))
  return nonGroup ?? uniqueCandidates[0]
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

function findStringsDeep(value: unknown, keys: Set<string>): string[] {
  if (!value) {
    return []
  }

  if (typeof value === "string") {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => findStringsDeep(entry, keys))
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const matched = Object.keys(record)
      .filter((key) => keys.has(key.toLowerCase()))
      .flatMap((key) => findStringsDeep(record[key], keys))
    const nested = Object.values(record).flatMap((entry) => findStringsDeep(entry, keys))
    return matched.concat(nested)
  }

  return []
}

function isLikelyWhatsAppSender(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  // Drop common event labels accidentally picked from webhook payload metadata.
  if (
    normalized === "message" ||
    normalized === "messages" ||
    normalized === "message.ack" ||
    normalized === "ack" ||
    normalized === "event" ||
    normalized === "notification"
  ) {
    return false
  }

  const [localPart = normalized] = normalized.split("@")
  const digits = localPart.replace(/\D/g, "")
  return digits.length >= 8
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
    .map((entry) => normalizeWhatsAppJid(entry))
    .filter((entry): entry is string => Boolean(entry))

  return new Set(entries)
}

function buildSelfSenderSet() {
  const raw = [
    process.env.WHATSAPP_WEBHOOK_SELF_SENDERS,
    process.env.WHATSAPP_WEBHOOK_BOT_NUMBER,
    process.env.WHATSAPP_BOT_NUMBER,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(",")

  if (!raw) {
    return new Set<string>()
  }

  const entries = raw
    .split(",")
    .map((entry) => normalizeWhatsAppJid(entry))
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

    const normalizedId = normalizeWhatsAppJid(identifier)
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

function shouldIgnoreMessage(message: string) {
  const normalized = message.trim().toLowerCase()
  return normalized.startsWith("#bot") || normalized.startsWith("[bot]")
}

function isLikelyTransactionIntent(message: string) {
  const normalized = message.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  if (normalized.includes(";")) {
    return true
  }

  const firstToken = normalized.split(/\s+/)[0] ?? ""
  return [
    "pengeluaran",
    "keluar",
    "expense",
    "pemasukan",
    "masuk",
    "income",
  ].includes(firstToken)
}

function shouldIgnoreNonUserEvent(message: string, sender: string) {
  const normalized = message.trim().toLowerCase()
  const normalizedSender = sender.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  if (
    normalized === "message" ||
    normalized === "messages" ||
    normalized === "message.ack" ||
    normalized === "ack" ||
    normalized === "event" ||
    normalized === "notification" ||
    normalized.startsWith("message.")
  ) {
    return true
  }

  if (normalized === normalizedSender) {
    return true
  }

  const messageAsJid = normalizeWhatsAppJid(normalized)
  if (messageAsJid && messageAsJid === sender) {
    return true
  }

  return false
}

function shouldThrottleFailureNotice(sender: string, reason: string) {
  const state = getFailureNoticeStore()
  const key = `${sender}::${reason}`
  const now = Date.now()
  const previous = state.get(key)
  if (previous && now - previous < FAILURE_NOTICE_WINDOW_MS) {
    return true
  }

  state.set(key, now)
  if (state.size > 1000) {
    const first = state.keys().next().value
    if (first) {
      state.delete(first)
    }
  }

  return false
}

function getFailureNoticeStore() {
  if (!globalState.__whatsappWebhookFailureNoticeMap) {
    globalState.__whatsappWebhookFailureNoticeMap = new Map<string, number>()
  }

  return globalState.__whatsappWebhookFailureNoticeMap
}

function readWebhookSecret(request: Request) {
  return request.headers.get("x-whatsapp-secret") ?? new URL(request.url).searchParams.get("secret")
}

type HistoryOptions = {
  type?: "income" | "expense"
  accountName?: string
  limit: number
}

type HistoryRow = RowDataPacket & {
  id: number
  type: "income" | "expense"
  category: string | null
  amount: number
  description: string | null
  date: string
  account_name: string | null
}

async function buildTransactionHistoryMessage(userId: number, options: HistoryOptions) {
  const limit = Number.isFinite(options.limit) ? Math.min(Math.max(options.limit, 1), 20) : 10
  const filters: string[] = ["t.user_id = ?"]
  const params: Array<number | string> = [userId]

  if (options.type) {
    filters.push("t.type = ?")
    params.push(options.type)
  }

  if (options.accountName?.trim()) {
    filters.push("LOWER(a.name) LIKE LOWER(?)")
    params.push(`%${options.accountName.trim()}%`)
  }

  const rows = await query<HistoryRow[]>(
    `
      SELECT
        t.id,
        t.type,
        c.name AS category,
        t.amount,
        t.description,
        DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date,
        a.name AS account_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE ${filters.join(" AND ")}
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ?
    `,
    [...params, limit],
  )

  if (rows.length === 0) {
    const scope = options.accountName ? ` untuk sumber ${options.accountName}` : ""
    const typeLabel = options.type === "income" ? "pemasukan" : options.type === "expense" ? "pengeluaran" : "transaksi"
    return `Belum ada riwayat ${typeLabel}${scope}.`
  }

  const titleParts = ["Riwayat"]
  if (options.type === "income") {
    titleParts.push("Pemasukan")
  } else if (options.type === "expense") {
    titleParts.push("Pengeluaran")
  } else {
    titleParts.push("Transaksi")
  }

  if (options.accountName) {
    titleParts.push(`(${options.accountName})`)
  }

  const header = `${titleParts.join(" ")} - ${rows.length} data terakhir`

  const lines = rows.map((row, index) => {
    const amountText = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(Number(row.amount))
    const typeIcon = row.type === "income" ? "+" : "-"
    const category = row.category ?? "-"
    const account = row.account_name ?? "-"
    const note = row.description?.trim() || "-"
    return `${index + 1}. ${typeIcon} ${amountText}\n   ${row.date} | ${category} | ${account}\n   ${note}`
  })

  return [header, ...lines].join("\n")
}
