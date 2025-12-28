import { NextResponse } from "next/server"
import type { RowDataPacket } from "mysql2"

import {
  createTransaction,
  InvalidAccountError,
  type TransactionResponse,
} from "@/app/api/transactions/helpers"
import { query } from "@/lib/db"
import { resolveAccountReference } from "@/lib/external-transaction-utils"
import {
  formatTransactionMessage,
  getWhatsAppConfig,
  sendTransactionNotification,
  sendWhatsAppText,
  type WhatsAppConfig,
} from "@/lib/whatsapp"
import { buildAccountBalanceMessage } from "@/lib/account-balances"
import { isBalanceCommand, parseTransactionCommand } from "@/lib/whatsapp-commands"

const POLL_SECRET = process.env.WHATSAPP_POLL_SECRET?.trim()
const SHOULD_ACK = process.env.WHATSAPP_POLL_SEND_ACK === "true"
const POLL_LIMIT = readNumberEnv("WHATSAPP_POLL_LIMIT", 25, 100)
const LOOKBACK_MINUTES = readNumberEnv("WHATSAPP_POLL_LOOKBACK_MINUTES", 120, 1440)
const POLL_TARGETS = buildPollTargets()
let stateTablePromise: Promise<void> | null = null

type PollTarget = {
  chatJid: string
  userId: number
  accountId?: number
}

type PollFailure = {
  id: string
  reason: string
}

type PollSummary = {
  chatJid: string
  fetched: number
  processed: number
  created: number
  skipped: number
  failures: PollFailure[]
}

type PollState = {
  lastTimestamp: Date | null
  lastMessageId: string | null
}

type ChatMessage = {
  id?: string
  content?: string
  timestamp?: string
  sender_jid?: string
  is_from_me?: boolean
}

type ChatMessagesPayload = {
  results?: {
    data?: ChatMessage[]
  }
}

export async function POST(request: Request) {
  if (!POLL_SECRET) {
    return NextResponse.json({ message: "POLL SECRET belum diatur" }, { status: 503 })
  }

  const providedSecret = request.headers.get("x-poll-secret") ?? new URL(request.url).searchParams.get("secret")
  if (providedSecret !== POLL_SECRET) {
    return NextResponse.json({ message: "Token poller tidak valid" }, { status: 401 })
  }

  if (POLL_TARGETS.length === 0) {
    return NextResponse.json({ message: "Tidak ada chat yang dipantau" }, { status: 400 })
  }

  const config = getWhatsAppConfig()
  if (!config) {
    return NextResponse.json({ message: "Konfigurasi WhatsApp API belum lengkap" }, { status: 503 })
  }

  const requestedChats = extractRequestedChats(request.url)
  const targets = requestedChats.size > 0 ? POLL_TARGETS.filter((target) => requestedChats.has(target.chatJid)) : POLL_TARGETS

  if (requestedChats.size > 0 && targets.length === 0) {
    return NextResponse.json({ message: "Chat tidak ditemukan dalam konfigurasi" }, { status: 404 })
  }

  await ensureStateTable()

  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        return await processChat(target, config)
      } catch (error) {
        console.error(`WhatsApp poller gagal untuk ${target.chatJid}`, error)
        return {
          chatJid: target.chatJid,
          fetched: 0,
          processed: 0,
          created: 0,
          skipped: 0,
          failures: [{ id: "-", reason: "Gagal memuat pesan" }],
        }
      }
    }),
  )

  const totalCreated = results.reduce((sum, result) => sum + result.created, 0)

  return NextResponse.json({
    message: "Polling selesai",
    stats: {
      chats: targets.length,
      created: totalCreated,
    },
    results,
  })
}

async function processChat(target: PollTarget, config: WhatsAppConfig): Promise<PollSummary> {
  const state = await getPollState(target.chatJid)
  const since = state?.lastTimestamp ?? new Date(Date.now() - LOOKBACK_MINUTES * 60_000)
  const messages = await fetchChatMessages(config, target.chatJid, POLL_LIMIT, since)

  if (messages.length === 0) {
    return {
      chatJid: target.chatJid,
      fetched: 0,
      processed: 0,
      created: 0,
      skipped: 0,
      failures: [],
    }
  }

  messages.sort((a, b) => {
    const aTime = Date.parse(a.timestamp ?? "") || 0
    const bTime = Date.parse(b.timestamp ?? "") || 0
    return aTime - bTime
  })

  let lastTimestamp = state?.lastTimestamp ?? null
  let lastMessageId = state?.lastMessageId ?? null

  const summary: PollSummary = {
    chatJid: target.chatJid,
    fetched: messages.length,
    processed: 0,
    created: 0,
    skipped: 0,
    failures: [],
  }

  for (const message of messages) {
    const messageId = message.id?.trim()
    const timestamp = parseTimestamp(message.timestamp)

    if (!messageId || !timestamp) {
      summary.skipped++
      continue
    }

    if (!isNewerMessage(timestamp, messageId, lastTimestamp, lastMessageId)) {
      summary.skipped++
      continue
    }

    const content = message.content?.trim()
    if (!content) {
      summary.skipped++
      await updatePollState(target.chatJid, messageId, timestamp)
      lastTimestamp = timestamp
      lastMessageId = messageId
      continue
    }

    summary.processed++

    if (isBalanceCommand(content)) {
      try {
        const summaryMessage = await buildAccountBalanceMessage(target.userId)
        await sendWhatsAppText({ message: summaryMessage.message, recipients: [target.chatJid] })
      } catch (error) {
        console.error(`Gagal menyiapkan ringkasan saldo untuk ${target.chatJid}`, error)
        summary.failures.push({ id: messageId, reason: "Gagal mengirim ringkasan saldo" })
      }

      await updatePollState(target.chatJid, messageId, timestamp)
      lastTimestamp = timestamp
      lastMessageId = messageId
      continue
    }

    const parsed = parseTransactionCommand(content)
    if (!parsed.ok) {
      summary.failures.push({ id: messageId, reason: parsed.error })
      await updatePollState(target.chatJid, messageId, timestamp)
      lastTimestamp = timestamp
      lastMessageId = messageId
      continue
    }

    try {
      const accountResolution = await resolveAccountReference(target.userId, {
        accountId: parsed.data.accountId,
        accountName: parsed.data.accountName,
        source: parsed.data.accountName,
        sumber: parsed.data.accountName,
      })

      if (!accountResolution.ok) {
        summary.failures.push({ id: messageId, reason: accountResolution.message })
      } else {
        const transaction = await createTransaction({
          userId: target.userId,
          type: parsed.data.type,
          category: parsed.data.category,
          amount: parsed.data.amount,
          description: parsed.data.description,
          date: parsed.data.date,
          preferredAccountId: target.accountId,
          submittedAccountId: accountResolution.accountId,
        })

        if (!transaction) {
          summary.failures.push({ id: messageId, reason: "Transaksi tersimpan namun tidak dapat dimuat ulang" })
        } else {
          summary.created++
          void sendTransactionNotification({
            userId: target.userId,
            type: transaction.type,
            category: transaction.category,
            amount: transaction.amount,
            description: transaction.description,
            date: transaction.date,
            accountName: transaction.accountName,
          })

          if (SHOULD_ACK) {
            const ackMessage = buildAckMessage(transaction)
            void sendWhatsAppText({ message: ackMessage, recipients: [target.chatJid] })
          }
        }
      }
    } catch (error) {
      if (error instanceof InvalidAccountError) {
        summary.failures.push({ id: messageId, reason: error.message })
      } else {
        console.error(`Gagal membuat transaksi dari pesan poller ${messageId}`, error)
        summary.failures.push({ id: messageId, reason: "Gagal menyimpan transaksi" })
      }
    } finally {
      await updatePollState(target.chatJid, messageId, timestamp)
      lastTimestamp = timestamp
      lastMessageId = messageId
    }
  }

  return summary
}

async function fetchChatMessages(
  config: WhatsAppConfig,
  chatJid: string,
  limit: number,
  since?: Date,
): Promise<ChatMessage[]> {
  const safeChatId = chatJid.replace(/[^a-zA-Z0-9@._-]/g, "")
  const url = new URL(`/chat/${safeChatId}/messages`, config.baseUrl)
  url.searchParams.set("limit", String(limit))
  url.searchParams.set("is_from_me", "false")
  if (since) {
    url.searchParams.set("start_time", since.toISOString())
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: buildBasicAuth(config),
  }

  if (config.deviceId) {
    headers["X-Device-Id"] = config.deviceId
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new Error(`WhatsApp API error ${response.status}: ${errorText}`)
  }

  const payload = (await response.json().catch(() => ({}))) as ChatMessagesPayload
  return payload?.results?.data ?? []
}

async function ensureStateTable() {
  if (!stateTablePromise) {
    stateTablePromise = query(`
      CREATE TABLE IF NOT EXISTS whatsapp_poll_state (
        chat_jid VARCHAR(191) PRIMARY KEY,
        last_message_id VARCHAR(191) NULL,
        last_timestamp DATETIME NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)
      .then(() => undefined)
      .catch((error) => {
        stateTablePromise = null
        throw error
      })
  }

  await stateTablePromise
}

type PollStateRow = RowDataPacket & {
  last_message_id: string | null
  last_timestamp: Date | string | null
}

async function getPollState(chatJid: string): Promise<PollState> {
  const rows = await query<PollStateRow[]>(
    "SELECT last_message_id, last_timestamp FROM whatsapp_poll_state WHERE chat_jid = ? LIMIT 1",
    [chatJid],
  )

  if (rows.length === 0) {
    return { lastMessageId: null, lastTimestamp: null }
  }

  const row = rows[0]
  return {
    lastMessageId: row.last_message_id ?? null,
    lastTimestamp: row.last_timestamp ? new Date(row.last_timestamp) : null,
  }
}

async function updatePollState(chatJid: string, messageId: string, timestamp: Date) {
  await query(
    `
    INSERT INTO whatsapp_poll_state (chat_jid, last_message_id, last_timestamp)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      last_message_id = VALUES(last_message_id),
      last_timestamp = VALUES(last_timestamp),
      updated_at = CURRENT_TIMESTAMP
  `,
    [chatJid, messageId, timestamp],
  )
}

function parseTimestamp(value?: string | null) {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isNewerMessage(
  current: Date,
  messageId: string,
  lastTimestamp: Date | null,
  lastMessageId: string | null,
) {
  if (!lastTimestamp) {
    return true
  }

  const currentValue = current.getTime()
  const previousValue = lastTimestamp.getTime()
  if (currentValue > previousValue) {
    return true
  }

  return currentValue === previousValue && messageId !== lastMessageId
}

function buildBasicAuth(config: WhatsAppConfig) {
  const token = Buffer.from(`${config.username}:${config.password}`).toString("base64")
  return `Basic ${token}`
}

function readNumberEnv(key: string, defaultValue: number, max?: number) {
  const raw = process.env[key]
  const parsed = raw ? Number(raw) : defaultValue
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue
  }
  if (max !== undefined) {
    return Math.min(parsed, max)
  }
  return parsed
}

function buildPollTargets(): PollTarget[] {
  const source = process.env.WHATSAPP_POLL_TARGETS ?? process.env.WHATSAPP_WEBHOOK_SENDER_MAP ?? ""
  if (!source.trim()) {
    return []
  }

  const entries = source.split(",").map((entry) => entry.trim()).filter(Boolean)
  const map = new Map<string, PollTarget>()

  for (const entry of entries) {
    const [identifier, target] = entry.split("=").map((item) => item.trim())
    if (!identifier || !target) {
      continue
    }

    const chatJid = normalizeChatJid(identifier)
    if (!chatJid) {
      continue
    }

    const [userPart, accountPart] = target.split(":").map((part) => part.trim())
    const userId = Number(userPart)
    if (!Number.isFinite(userId) || userId <= 0) {
      continue
    }

    const accountId = accountPart ? Number(accountPart) : undefined
    const parsedAccountId = accountId && Number.isFinite(accountId) ? accountId : undefined
    map.set(chatJid, {
      chatJid,
      userId,
      accountId: parsedAccountId,
    })
  }

  return Array.from(map.values())
}

function normalizeChatJid(value?: string | null) {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim().toLowerCase()
  if (!trimmed) {
    return undefined
  }

  if (trimmed.includes("@")) {
    return trimmed
  }

  const digits = trimmed.replace(/[^0-9]/g, "")
  if (!digits) {
    return undefined
  }

  return `${digits}@s.whatsapp.net`
}

function extractRequestedChats(url: string) {
  const searchParams = new URL(url).searchParams
  const entries = searchParams.getAll("chat")
  const normalized = entries
    .map((entry) => normalizeChatJid(entry))
    .filter((entry): entry is string => Boolean(entry))
  return new Set(normalized)
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
