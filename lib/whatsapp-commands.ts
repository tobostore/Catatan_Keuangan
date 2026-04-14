import type { TransactionType } from "@/app/api/transactions/helpers"

export type ParsedCommand = {
  type: TransactionType
  category: string
  amount: number
  date: string
  description: string
  accountId?: number
  accountName?: string
}

export type CommandResult =
  | { ok: true; data: ParsedCommand }
  | { ok: false; error: string }

export type HistoryCommand = {
  type?: TransactionType
  accountName?: string
  limit: number
}

export type HistoryCommandResult =
  | { status: "none" }
  | { status: "error"; error: string }
  | { status: "ok"; data: HistoryCommand }

export function parseTransactionCommand(input: string): CommandResult {
  const trimmedInput = input.trim()
  if (!trimmedInput) {
    return { ok: false, error: "Pesan kosong" }
  }

  if (!trimmedInput.includes(";")) {
    const natural = parseNaturalCommand(trimmedInput)
    if (natural.ok) {
      return natural
    }
  }

  const segments = input
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  if (segments.length < 3) {
    return { ok: false, error: "Format pesan minimal TYPE;Kategori;Jumlah" }
  }

  const typeToken = segments[0]?.toLowerCase()
  const type = interpretType(typeToken)
  if (!type) {
    return { ok: false, error: "Gunakan tipe PENGELUARAN atau PEMASUKAN" }
  }

  const category = segments[1]
  if (!category) {
    return { ok: false, error: "Kategori tidak boleh kosong" }
  }

  const amount = interpretAmount(segments[2])
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Jumlah tidak valid" }
  }

  const remainder = segments.slice(3)
  let dateText: string | undefined
  let accountId: number | undefined
  let accountName: string | undefined
  const descriptionParts: string[] = []

  for (const segment of remainder) {
    if (!dateText) {
      const parsedDate = interpretDate(segment)
      if (parsedDate) {
        dateText = parsedDate
        continue
      }
    }

    const lower = segment.toLowerCase()
    if (lower.startsWith("acc=") || lower.startsWith("akun=") || lower.startsWith("account=")) {
      const value = segment.split("=")[1]?.trim()
      const parsedAcc = value ? Number(value) : Number.NaN
      if (!Number.isFinite(parsedAcc) || parsedAcc <= 0) {
        return { ok: false, error: "Account ID pada pesan tidak valid" }
      }
      accountId = parsedAcc
      continue
    }

    if (lower.startsWith("sumber=") || lower.startsWith("source=") || lower.startsWith("src=")) {
      const value = segment.split("=")[1]?.trim()
      if (value) {
        accountName = value
        continue
      }
    }

    descriptionParts.push(segment)
  }

  const date = dateText ?? formatDate(new Date())
  const description = descriptionParts.join("; ")

  return {
    ok: true,
    data: {
      type,
      category,
      amount,
      date,
      description,
      accountId,
      accountName,
    },
  }
}

function parseNaturalCommand(input: string): CommandResult {
  const normalized = input.replace(/\s+/g, " ").trim()
  const tokens = normalized.split(" ")
  if (tokens.length < 3) {
    return { ok: false, error: "Format pesan minimal TYPE;Kategori;Jumlah" }
  }

  const type = interpretType(tokens[0]?.toLowerCase())
  if (!type) {
    return { ok: false, error: "Gunakan tipe PENGELUARAN atau PEMASUKAN" }
  }

  const amount = interpretAmount(tokens[1] ?? "")
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Jumlah tidak valid" }
  }

  let dateText: string | undefined
  let accountName: string | undefined
  let accountId: number | undefined
  const words: string[] = []

  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) {
      continue
    }

    const maybeDate = interpretDate(token)
    if (!dateText && maybeDate) {
      dateText = maybeDate
      continue
    }

    const lower = token.toLowerCase()
    if (lower.startsWith("acc=") || lower.startsWith("akun=") || lower.startsWith("account=")) {
      const value = token.split("=")[1]?.trim()
      const parsedAcc = value ? Number(value) : Number.NaN
      if (!Number.isFinite(parsedAcc) || parsedAcc <= 0) {
        return { ok: false, error: "Account ID pada pesan tidak valid" }
      }
      accountId = parsedAcc
      continue
    }

    if (lower.startsWith("sumber=") || lower.startsWith("source=") || lower.startsWith("src=")) {
      const value = token.split("=")[1]?.trim()
      if (value) {
        accountName = value
        continue
      }
    }

    if (["sumber", "source", "src", "via", "pakai", "dari"].includes(lower) && tokens[i + 1]) {
      accountName = tokens[i + 1]
      i += 1
      continue
    }

    words.push(token)
  }

  const category = words[0]?.trim()
  if (!category) {
    return { ok: false, error: "Kategori tidak boleh kosong" }
  }

  const description = words.slice(1).join(" ")
  const date = dateText ?? formatDate(new Date())

  return {
    ok: true,
    data: {
      type,
      category,
      amount,
      date,
      description,
      accountId,
      accountName,
    },
  }
}

export function isBalanceCommand(input: string) {
  if (!input) {
    return false
  }

  const normalized = input.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  const cleaned = normalized.replace(/[?!.,]+$/g, "").trim()
  return cleaned === "saldo" || cleaned.startsWith("saldo ")
}

export function isFormatHelpCommand(input: string) {
  if (!input) {
    return false
  }

  const cleaned = input.trim().toLowerCase().replace(/[?!.,]+$/g, "")
  return cleaned === "format" || cleaned === "help" || cleaned === "bantuan"
}

export function parseHistoryCommand(input: string): HistoryCommandResult {
  const cleaned = input.trim().toLowerCase().replace(/[?!.,]+$/g, "")
  if (!cleaned) {
    return { status: "none" }
  }

  if (!(cleaned.startsWith("riwayat") || cleaned.startsWith("history") || cleaned.startsWith("histori"))) {
    return { status: "none" }
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean)
  let type: TransactionType | undefined
  let accountName: string | undefined
  let limit = 10

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]
    const lower = token.toLowerCase()

    if (["pengeluaran", "keluar", "expense"].includes(lower)) {
      type = "expense"
      continue
    }

    if (["pemasukan", "masuk", "income"].includes(lower)) {
      type = "income"
      continue
    }

    if (lower.startsWith("limit=") || lower.startsWith("last=")) {
      const raw = lower.split("=")[1]
      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { status: "error", error: "Nilai limit riwayat tidak valid" }
      }
      limit = clampLimit(parsed)
      continue
    }

    if (lower === "last" || lower === "limit") {
      const nextToken = tokens[i + 1]
      const parsed = Number(nextToken)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { status: "error", error: "Nilai limit riwayat tidak valid" }
      }
      limit = clampLimit(parsed)
      i += 1
      continue
    }

    if (lower.startsWith("sumber=") || lower.startsWith("source=") || lower.startsWith("akun=") || lower.startsWith("account=")) {
      const value = token.split("=")[1]?.trim()
      if (value) {
        accountName = value
      }
      continue
    }

    if (["sumber", "source", "akun", "account", "dari"].includes(lower) && tokens[i + 1]) {
      accountName = tokens[i + 1]
      i += 1
      continue
    }

    if (!accountName) {
      accountName = token
    }
  }

  return {
    status: "ok",
    data: {
      type,
      accountName,
      limit: clampLimit(limit),
    },
  }
}

export function buildFormatHelpMessage() {
  return [
    "Format cepat yang didukung:",
    "1) PENGELUARAN;Makan;20000;sumber=Cash;Makan malam",
    "2) keluar 20rb makan sumber cash makan malam",
    "3) riwayat pengeluaran krom",
    "4) riwayat pemasukan sumber bca last 5",
    "",
    "Keterangan:",
    "- TYPE: pengeluaran/keluar atau pemasukan/masuk",
    "- Jumlah: 20000, 20rb, 1jt",
    "- Tanggal opsional: YYYY-MM-DD",
    "- ketik SALDO untuk ringkasan saldo",
    "- ketik RIWAYAT PENGELUARAN <sumber> untuk histori akun",
  ].join("\n")
}

function clampLimit(value: number) {
  return Math.min(Math.max(Math.floor(value), 1), 20)
}

function interpretType(value?: string): TransactionType | null {
  if (!value) {
    return null
  }

  if (["expense", "pengeluaran", "keluar"].includes(value)) {
    return "expense"
  }

  if (["income", "pemasukan", "masuk"].includes(value)) {
    return "income"
  }

  return null
}

function interpretAmount(value: string) {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) {
    return Number.NaN
  }

  const compact = trimmed.replace(/\s+/g, "")
  const suffixMatch = compact.match(/^([0-9.,]+)(rb|k|ribu|jt|juta|m)$/)
  if (suffixMatch) {
    const base = parseLocalizedNumber(suffixMatch[1])
    const suffix = suffixMatch[2]
    const multiplier = ["rb", "k", "ribu"].includes(suffix) ? 1_000 : 1_000_000
    return Math.round(base * multiplier)
  }

  const plainNumber = parseLocalizedNumber(compact)
  if (Number.isFinite(plainNumber) && plainNumber > 0) {
    return Math.round(plainNumber)
  }

  const digitsOnly = compact.replace(/[^0-9]/g, "")
  return Number(digitsOnly)
}

function parseLocalizedNumber(value: string) {
  const normalized = value.replace(/[^0-9.,]/g, "")
  if (!normalized) {
    return Number.NaN
  }

  const commaIndex = normalized.lastIndexOf(",")
  const dotIndex = normalized.lastIndexOf(".")
  const decimalIndex = Math.max(commaIndex, dotIndex)

  if (decimalIndex <= 0) {
    return Number(normalized.replace(/[^0-9]/g, ""))
  }

  const intPart = normalized.slice(0, decimalIndex).replace(/[^0-9]/g, "")
  const fracPart = normalized.slice(decimalIndex + 1).replace(/[^0-9]/g, "")
  const combined = fracPart ? `${intPart}.${fracPart}` : intPart
  return Number(combined)
}

function interpretDate(value?: string) {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const altMatch = trimmed.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/)
  if (altMatch) {
    const [, day, month, year] = altMatch
    return `${year}-${month}-${day}`
  }

  const timestamp = Date.parse(trimmed)
  if (!Number.isNaN(timestamp)) {
    return formatDate(new Date(timestamp))
  }

  return undefined
}

export function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}
