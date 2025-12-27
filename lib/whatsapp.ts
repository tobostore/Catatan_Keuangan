const WHATSAPP_SEND_PATH = process.env.WHATSAPP_SEND_PATH ?? "/send/message"

export type WhatsAppConfig = {
	baseUrl: string
	defaultTargets: string[]
	username: string
	password: string
	deviceId?: string
}

type SendTextOptions = {
	message: string
	recipients?: string[]
}

type SendPayload = {
	message: string
	phone: string
	device_id?: string
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
	const baseUrl = process.env.WHATSAPP_API_BASE_URL?.trim()
	if (!baseUrl) {
		console.warn("WhatsApp API base URL is not configured; skipping notification send")
		return null
	}

	const username = process.env.WHATSAPP_API_USER?.trim()
	const password = process.env.WHATSAPP_API_PASS?.trim()
	if (!username || !password) {
		console.warn("WhatsApp API credentials are missing; skipping notification send")
		return null
	}

	const defaultTargets = process.env.WHATSAPP_TARGETS?.split(",").map((target) => target.trim()).filter(Boolean) ?? []

	return {
		baseUrl,
		defaultTargets,
		username,
		password,
		deviceId: process.env.WHATSAPP_DEVICE_ID?.trim() || undefined,
	}
}

async function callWhatsAppApi(config: WhatsAppConfig, payload: SendPayload) {
	const url = new URL(WHATSAPP_SEND_PATH, config.baseUrl)

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	}

	if (config.deviceId) {
		headers["X-Device-Id"] = config.deviceId
	}

	const authToken = Buffer.from(`${config.username}:${config.password}`).toString("base64")
	headers.Authorization = `Basic ${authToken}`

	const response = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
	})

	if (!response.ok) {
		const errorText = await response.text().catch(() => "")
		throw new Error(`WhatsApp API error ${response.status}: ${errorText}`)
	}

	return response
}

export async function sendWhatsAppText({ message, recipients }: SendTextOptions) {
	const config = getWhatsAppConfig()
	if (!config) {
		return
	}

	const targets = recipients?.length ? recipients : config.defaultTargets
	if (targets.length === 0) {
		console.warn("WhatsApp notification skipped; no recipients configured")
		return
	}

	const sendPromises = targets.map(async (target) => {
		const payload: SendPayload = {
			phone: target,
			message,
		}

		if (config.deviceId) {
			payload.device_id = config.deviceId
		}

		await callWhatsAppApi(config, payload)
	})

	const results = await Promise.allSettled(sendPromises)
	const failures = results.filter((result) => result.status === "rejected")
	if (failures.length > 0) {
		throw failures[0].reason
	}
}

export function formatTransactionMessage({
	type,
	category,
	amount,
	description,
	date,
	accountName,
}: {
	type: "income" | "expense"
	category: string
	amount: number
	description: string
	date: string
	accountName: string
}) {
	const amountText = new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
	}).format(amount)

	const parsedDate = new Date(date)
	const dateText = Number.isNaN(parsedDate.getTime())
		? date
		: new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(parsedDate)

	const typeLabel = type === "income" ? "Pemasukan" : "Pengeluaran"
	const note = description?.trim() ? description.trim() : "-"

	return [
		`Catatan ${typeLabel}`,
		`Kategori : ${category}`,
		`Jumlah   : ${amountText}`,
		`Tanggal  : ${dateText}`,
		`Sumber   : ${accountName}`,
		`Catatan  : ${note}`,
	].join("\n")
}

export async function sendTransactionNotification(transaction: {
	type: "income" | "expense"
	category: string
	amount: number
	description: string
	date: string
	accountName: string
}) {
	const message = formatTransactionMessage(transaction)
	try {
		await sendWhatsAppText({ message })
	} catch (error) {
		console.error("Failed to send WhatsApp notification", error)
	}
}
