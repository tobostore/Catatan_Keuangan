import { NextResponse } from "next/server"

import {
  getWhatsAppWsStatus,
  startWhatsAppWsClient,
  stopWhatsAppWsClient,
  getRecentWsEvents,
} from "@/lib/whatsapp-ws"

const CONTROL_SECRET =
  process.env.WHATSAPP_WS_CONTROL_SECRET?.trim() ||
  process.env.WHATSAPP_POLL_SECRET?.trim() ||
  process.env.WHATSAPP_WEBHOOK_SECRET?.trim()

export async function GET(request: Request) {
  const showEvents = new URL(request.url).searchParams.get("events") === "true"
  
  if (showEvents) {
    return NextResponse.json({
      message: "Recent WebSocket events",
      events: getRecentWsEvents(),
    })
  }

  return NextResponse.json({
    message: "Status koneksi WhatsApp WebSocket",
    data: getWhatsAppWsStatus(),
  })
}

export async function POST(request: Request) {
  if (CONTROL_SECRET) {
    const provided = request.headers.get("x-ws-secret") ?? new URL(request.url).searchParams.get("secret")
    if (provided !== CONTROL_SECRET) {
      return NextResponse.json({ message: "Token kontrol WebSocket tidak valid" }, { status: 401 })
    }
  }

  let body: Record<string, unknown> = {}
  try {
    const parsed = await request.json().catch(() => ({}))
    if (parsed && typeof parsed === "object") {
      body = parsed as Record<string, unknown>
    }
  } catch {
    body = {}
  }

  const action = String(body.action ?? "start").toLowerCase()
  if (action === "stop") {
    return NextResponse.json({
      message: "Koneksi WhatsApp WebSocket dihentikan",
      data: stopWhatsAppWsClient(),
    })
  }

  if (action === "debug") {
    const testData = body.event ?? { message: "PENGELUARAN;Debug;10000;2026-04-12;sumber=Cash;Debug test" }
    const debugResult = await debugIncomingEvent(testData)
    return NextResponse.json({
      message: "Debug event parsing",
      action: "debug",
      result: debugResult,
    })
  }

  if (action === "test") {
    console.log("[whatsapp-ws-route] Test event received:", JSON.stringify(body)?.slice(0, 500))
    const testData = body.event ?? { message: "PENGELUARAN;Test;10000;2026-04-12;sumber=Cash;Test WS" }
    console.log("[whatsapp-ws-route] Processing test data:", JSON.stringify(testData))
    await handleIncomingFromTest(testData)
    return NextResponse.json({
      message: "Event test diproses",
      action: "test",
      debug: {
        rawEvent: testData,
        timestamp: new Date().toISOString(),
      },
    })
  }

  const url = typeof body.url === "string" ? body.url : undefined
  return NextResponse.json({
    message: "Koneksi WhatsApp WebSocket dijalankan",
    data: startWhatsAppWsClient({ url }),
  })
}

async function handleIncomingFromTest(payload: unknown) {
  const { handleIncomingForDebug } = await import("@/lib/whatsapp-ws")
  await handleIncomingForDebug(payload)
}

async function debugIncomingEvent(payload: unknown) {
  const { parseTransactionCommand } = await import("@/lib/whatsapp-commands")
  const { normalizeWhatsAppJid } = await import("@/lib/whatsapp-utils")
  
  // Simple extraction like in handleIncoming
  let text: string | undefined
  let sender: string | undefined
  
  if (typeof payload === "string") {
    text = payload
  } else if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>
    // Try common message keys
    for (const key of ["message", "text", "body", "content"]) {
      if (typeof record[key] === "string") {
        text = record[key]
        break
      }
    }
    // Try common sender keys
    for (const key of ["from", "sender", "phone", "jid", "number"]) {
      if (typeof record[key] === "string") {
        sender = normalizeWhatsAppJid(record[key])
        if (sender) break  
      }
    }
  }

  const parseResult = text ? parseTransactionCommand(text) : { ok: false, error: "No message text found" }

  return {
    raw: payload,
    extracted: { text, sender },
    parseResult,
  }
}
