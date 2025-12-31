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

export function parseTransactionCommand(input: string): CommandResult {
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
  const digitsOnly = value.replace(/[^0-9]/g, "")
  return Number(digitsOnly)
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
