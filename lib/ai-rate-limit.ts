type WindowCounter = {
  count: number
  expiresAt: number
}

const windows = new Map<string, WindowCounter>()

export function hitRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const current = windows.get(key)

  if (!current || now > current.expiresAt) {
    windows.set(key, { count: 1, expiresAt: now + windowMs })
    return false
  }

  if (current.count >= max) {
    return true
  }

  current.count += 1
  windows.set(key, current)
  return false
}
