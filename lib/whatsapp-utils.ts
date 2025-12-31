export function normalizeWhatsAppJid(value?: string | null) {
  if (!value) {
    return undefined
  }

  const sanitized = value.replace(/[\u0000-\u0020\u007f-\u009f\u00a0\u00ad\ufeff\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
  let trimmed = sanitized.trim()
  const matches = sanitized.match(/[0-9a-zA-Z_.-]+@[0-9a-zA-Z_.-]+/g)
  if (matches && matches.length > 0) {
    trimmed = matches[matches.length - 1]
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
