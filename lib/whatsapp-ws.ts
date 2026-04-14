import { createTransaction, type TransactionResponse, InvalidAccountError } from "@/app/api/transactions/helpers"
import { resolveAccountReference } from "@/lib/external-transaction-utils"
import { sendTransactionNotification, sendWhatsAppText, formatTransactionMessage } from "@/lib/whatsapp"
import { parseTransactionCommand, isBalanceCommand, type ParsedCommand } from "@/lib/whatsapp-commands"
import { buildAccountBalanceMessage } from "@/lib/account-balances"
import { findSenderLink } from "@/lib/whatsapp-sender-links"
import { normalizeWhatsAppJid } from "@/lib/whatsapp-utils"

type WsClientStatus = "idle" | "connecting" | "connected" | "error"

type StartOptions = {
  url?: string
}

type WsState = {
  status: WsClientStatus
  url: string | null
  connectedAt: string | null
  lastMessageAt: string | null
  lastError: string | null
  reconnectInMs: number | null
  processedCount: number
}

type InternalState = WsState & {
  socket: WebSocket | null
  reconnectTimer: NodeJS.Timeout | null
  shouldReconnect: boolean
  reconnectDelayMs: number
  seenMessageIds: Set<string>
  recentEvents: Array<{ timestamp: string; type: string; data: unknown }>
}

function readNumberEnv(key: string) {
  const raw = process.env[key]?.trim()
  if (!raw) {
    return undefined
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

const DEFAULT_WS_URL = process.env.WHATSAPP_WS_URL?.trim() || "ws://10.20.25.25:3000/ws"
const DEFAULT_DEVICE_ID = process.env.WHATSAPP_DEVICE_ID?.trim() || "a534a587-fabb-4726-a40d-bd8ef054130c"
const DEFAULT_USER_ID = readNumberEnv("WHATSAPP_WS_DEFAULT_USER_ID") ?? readNumberEnv("WHATSAPP_WEBHOOK_DEFAULT_USER_ID")
const SHOULD_ACK = process.env.WHATSAPP_WS_SEND_ACK === "true"

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
const MESSAGE_ID_KEY_SET = new Set(["id", "messageid", "message_id", "stanzaid", "stanza_id"])
const FROM_ME_KEY_SET = new Set(["fromme", "isfromme", "is_from_me", "from_me"])

const globalState = globalThis as typeof globalThis & {
  __whatsappWsState?: InternalState
}

function getStateStore() {
  if (!globalState.__whatsappWsState) {
    globalState.__whatsappWsState = {
      status: "idle",
      url: null,
      connectedAt: null,
      lastMessageAt: null,
      lastError: null,
      reconnectInMs: null,
      processedCount: 0,
      socket: null,
      reconnectTimer: null,
      shouldReconnect: false,
      reconnectDelayMs: 2000,
      seenMessageIds: new Set<string>(),
      recentEvents: [],
    }
  }

  return globalState.__whatsappWsState
}

export function getWhatsAppWsStatus(): WsState {
  const state = getStateStore()
  return {
    status: state.status,
    url: state.url,
    connectedAt: state.connectedAt,
    lastMessageAt: state.lastMessageAt,
    lastError: state.lastError,
    reconnectInMs: state.reconnectInMs,
    processedCount: state.processedCount,
  }
}

export function startWhatsAppWsClient(options: StartOptions = {}) {
  const state = getStateStore()
  const wsUrl = buildWsUrl(options.url)

  state.shouldReconnect = true
  state.url = wsUrl
  state.lastError = null

  if (state.status === "connected" || state.status === "connecting") {
    return getWhatsAppWsStatus()
  }

  connect(wsUrl)
  return getWhatsAppWsStatus()
}

export function stopWhatsAppWsClient() {
  const state = getStateStore()
  state.shouldReconnect = false
  state.reconnectInMs = null

  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
  }

  if (state.socket) {
    state.socket.close()
    state.socket = null
  }

  state.status = "idle"
  state.connectedAt = null
  return getWhatsAppWsStatus()
}

export const handleIncomingForDebug = handleIncoming

function logEvent(type: string, data: unknown) {
  const state = getStateStore()
  state.recentEvents.push({
    timestamp: new Date().toISOString(),
    type,
    data,
  })
  if (state.recentEvents.length > 100) {
    state.recentEvents.shift()
  }
}
function connect(wsUrl: string) {
  const state = getStateStore()

  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
  }

  state.status = "connecting"
  state.reconnectInMs = null

  try {
    const socket = new WebSocket(wsUrl)
    state.socket = socket

    socket.onopen = () => {
      state.status = "connected"
      state.connectedAt = new Date().toISOString()
      state.reconnectDelayMs = 2000
      state.lastError = null
      console.log("[whatsapp-ws] WebSocket connected to:", wsUrl)
    }

    socket.onmessage = (event) => {
      console.log("[whatsapp-ws] Raw WS message received:", typeof event.data, event.data?.toString?.()?.slice?.(0, 300))
      void handleIncoming(event.data)
    }

    socket.onerror = (err) => {
      state.status = "error"
      state.lastError = "WebSocket error"
      console.error("[whatsapp-ws] WebSocket error:", err)
    }

    socket.onclose = () => {
      state.socket = null
      state.connectedAt = null
      console.log("[whatsapp-ws] WebSocket closed")

      if (!state.shouldReconnect) {
        state.status = "idle"
        state.reconnectInMs = null
        return
      }

      state.status = "error"
      scheduleReconnect(wsUrl)
    }
  } catch (error) {
    state.status = "error"
    state.lastError = error instanceof Error ? error.message : "Gagal membuka koneksi WebSocket"
    console.error("[whatsapp-ws] WebSocket connection error:", error)
    scheduleReconnect(wsUrl)
  }
}

function scheduleReconnect(wsUrl: string) {
  const state = getStateStore()
  if (!state.shouldReconnect) {
    return
  }

  const delay = Math.min(state.reconnectDelayMs, 30000)
  state.reconnectInMs = delay

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    connect(wsUrl)
  }, delay)

  state.reconnectDelayMs = Math.min(delay * 2, 30000)
}

async function handleIncoming(rawData: unknown) {
  const state = getStateStore()
  state.lastMessageAt = new Date().toISOString()

  let payload: unknown = rawData
  if (typeof rawData === "string") {
    try {
      payload = JSON.parse(rawData)
    } catch {
      payload = { message: rawData }
    }
  }

  console.log("[whatsapp-ws] Incoming event:", JSON.stringify(payload)?.slice(0, 500))
  logEvent("incoming_raw", payload)

  const entries = flattenCandidateEvents(payload)
  console.log("[whatsapp-ws] Flattened candidates:", entries.length)
  for (const entry of entries) {
    const messageText = extractMessage(entry)
    if (!messageText) {
      continue
    }

    if (isFromMe(entry)) {
      console.log("[whatsapp-ws] Skipped message from self")
      continue
    }

    const sender = extractSender(entry)
    if (!sender) {
      console.log("[whatsapp-ws] No sender extracted from entry")
      continue
    }

    const messageId = extractMessageId(entry)
    if (messageId && isDuplicateMessage(messageId)) {
      console.log("[whatsapp-ws] Skipped duplicate message:", messageId)
      continue
    }

    console.log("[whatsapp-ws] Processing message from", sender, ":", messageText?.slice(0, 100))

    if (isBalanceCommand(messageText)) {
      console.log("[whatsapp-ws] Balance command detected")
      await handleBalanceCommand(sender)
      continue
    }

    const parsed = parseTransactionCommand(messageText)
    if (!parsed.ok) {
      console.log("[whatsapp-ws] Parse failed:", parsed.error)
      continue
    }

    console.log("[whatsapp-ws] Parsed command:", parsed.data)
    await createTransactionFromCommand(sender, parsed.data)
  }
}

async function createTransactionFromCommand(
  sender: string,
  command: ParsedCommand,
) {
  const senderConfig = await findSenderLink(sender)
  const userId = senderConfig?.userId ?? DEFAULT_USER_ID
  if (!userId) {
    console.log("[whatsapp-ws] No user configured for sender:", sender)
    return
  }

  console.log("[whatsapp-ws] Creating transaction for user:", userId)

  const accountResolution = await resolveAccountReference(userId, {
    accountId: command.accountId,
    accountName: command.accountName,
    source: command.accountName,
    sumber: command.accountName,
  })
  if (!accountResolution.ok) {
    console.log("[whatsapp-ws] Account resolution failed:", accountResolution.message)
    return
  }

  console.log("[whatsapp-ws] Account resolved:", accountResolution.accountId)

  let transaction: TransactionResponse | null = null
  try {
    transaction = await createTransaction({
      userId,
      type: command.type,
      category: command.category,
      amount: command.amount,
      description: command.description,
      date: command.date,
      preferredAccountId: senderConfig?.accountId,
      submittedAccountId: accountResolution.accountId,
    })

    console.log("[whatsapp-ws] Transaction created:", transaction?.id)
  } catch (error) {
    if (!(error instanceof InvalidAccountError)) {
      console.error("[whatsapp-ws] Failed to create transaction", error)
    }
    return
  }

  if (!transaction) {
    console.log("[whatsapp-ws] Transaction created but not readable")
    return
  }

  void sendTransactionNotification({
    userId,
    type: transaction.type,
    category: transaction.category,
    amount: transaction.amount,
    description: transaction.description,
    date: transaction.date,
    accountName: transaction.accountName,
  })

  if (SHOULD_ACK) {
    const summary = formatTransactionMessage({
      type: transaction.type,
      category: transaction.category,
      amount: transaction.amount,
      description: transaction.description,
      date: transaction.date,
      accountName: transaction.accountName,
    })
    void sendWhatsAppText({ message: `Transaksi berhasil dicatat.\n\n${summary}`, recipients: [sender] })
  }

  const state = getStateStore()
  state.processedCount += 1
  console.log("[whatsapp-ws] Transaction processed. Total count:", state.processedCount)
}

async function handleBalanceCommand(sender: string) {
  const senderConfig = await findSenderLink(sender)
  const userId = senderConfig?.userId ?? DEFAULT_USER_ID
  if (!userId) {
    return
  }

  try {
    const summary = await buildAccountBalanceMessage(userId)
    await sendWhatsAppText({ message: summary.message, recipients: [sender] })
  } catch (error) {
    console.error("[whatsapp-ws] Failed to send balance summary", error)
  }
}

function flattenCandidateEvents(payload: unknown) {
  const list: unknown[] = []
  collectEvents(payload, list)
  return list
}

function collectEvents(value: unknown, list: unknown[]) {
  if (!value) {
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectEvents(entry, list)
    }
    return
  }

  if (typeof value === "object") {
    list.push(value)
    const record = value as Record<string, unknown>
    for (const nested of Object.values(record)) {
      if (typeof nested === "object" && nested !== null) {
        collectEvents(nested, list)
      }
    }
  }
}

function extractMessage(value: unknown) {
  const msg = findStringDeep(value, MESSAGE_KEY_SET)
  console.log("[whatsapp-ws] Message extraction result:", { msg: msg?.slice?.(0, 100) })
  return msg
}

function extractSender(value: unknown) {
  const candidate = findStringDeep(value, SENDER_KEY_SET)
  const normalized = normalizeWhatsAppJid(candidate)
  console.log("[whatsapp-ws] Sender extraction result:", { raw: candidate, normalized })
  return normalized
}

function extractMessageId(value: unknown) {
  const id = findStringDeep(value, MESSAGE_ID_KEY_SET)
  console.log("[whatsapp-ws] Message ID extraction result:", id)
  return id
}

function isFromMe(value: unknown) {
  const result = findBooleanDeep(value, FROM_ME_KEY_SET)
  console.log("[whatsapp-ws] Is from me:", result)
  return result
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

function findBooleanDeep(value: unknown, keys: Set<string>): boolean {
  if (!value) {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((entry) => findBooleanDeep(entry, keys))
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (keys.has(key.toLowerCase())) {
        const direct = record[key]
        if (typeof direct === "boolean") {
          return direct
        }
        if (typeof direct === "string") {
          return direct.toLowerCase() === "true"
        }
        if (typeof direct === "number") {
          return direct === 1
        }
      }
    }

    return Object.values(record).some((nested) => findBooleanDeep(nested, keys))
  }

  return false
}

function isDuplicateMessage(messageId: string) {
  const state = getStateStore()
  const normalized = messageId.trim()
  if (!normalized) {
    return false
  }

  if (state.seenMessageIds.has(normalized)) {
    return true
  }

  state.seenMessageIds.add(normalized)
  if (state.seenMessageIds.size > 5000) {
    const first = state.seenMessageIds.values().next().value
    if (first) {
      state.seenMessageIds.delete(first)
    }
  }

  return false
}

function buildWsUrl(rawUrl?: string) {
  const base = rawUrl?.trim() || DEFAULT_WS_URL
  const url = new URL(base)
  if (!url.searchParams.get("device_id") && DEFAULT_DEVICE_ID) {
    url.searchParams.set("device_id", DEFAULT_DEVICE_ID)
  }
  return url.toString()
}

export function getRecentWsEvents() {
  const state = getStateStore()
  return state.recentEvents.slice(-100)
}
