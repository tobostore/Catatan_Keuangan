"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, X, XCircle } from "lucide-react"

import type { AIAlert } from "@/types/ai"

type AlertsPanelProps = {
  userId: string
}

export default function AlertsPanel({ userId }: AlertsPanelProps) {
  const [alerts, setAlerts] = useState<AIAlert[]>([])
  const [closingIds, setClosingIds] = useState<number[]>([])

  useEffect(() => {
    let isMounted = true

    const run = async () => {
      if (!userId) return
      try {
        const res = await fetch(`/api/ai/alerts?userId=${encodeURIComponent(userId)}`, { cache: "no-store" })
        const json = (await res.json()) as { success?: boolean; data?: AIAlert[] }
        if (!isMounted) return
        setAlerts(Array.isArray(json.data) ? json.data : [])
      } catch (error) {
        console.error("Fetch alerts failed", error)
      }
    }

    void run()

    return () => {
      isMounted = false
    }
  }, [userId])

  const visibleAlerts = useMemo(() => alerts.filter((item) => !closingIds.includes(item.id)), [alerts, closingIds])

  const handleClose = async (alertId: number) => {
    setClosingIds((prev) => [...prev, alertId])

    window.setTimeout(() => {
      setAlerts((prev) => prev.filter((item) => item.id !== alertId))
      setClosingIds((prev) => prev.filter((id) => id !== alertId))
    }, 240)

    try {
      await fetch("/api/ai/alerts/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      })
    } catch (error) {
      console.error("Mark alert read failed", error)
    }
  }

  if (!visibleAlerts.length) {
    return null
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const isClosing = closingIds.includes(alert.id)
        const isDanger = alert.level === "danger"

        return (
          <div
            key={alert.id}
            className={`w-full rounded-[12px] border px-4 py-3 transition-all duration-200 ${
              isDanger ? "border-red/50 bg-red-dim/40" : "border-yellow-400/40 bg-yellow-900/20"
            } ${isClosing ? "translate-y-[-10px] opacity-0" : "translate-y-0 opacity-100"}`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${isDanger ? "text-red" : "text-yellow-300"}`}>
                {isDanger ? <XCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">{alert.judul}</p>
                <p className="mt-1 text-sm text-secondary">{alert.pesan}</p>
                <p className="mt-1 text-xs italic text-muted">Saran: {alert.aksi}</p>
              </div>

              <button
                onClick={() => void handleClose(alert.id)}
                className="rounded-lg p-1 text-secondary transition-colors hover:bg-elevated hover:text-primary"
                aria-label="Tutup peringatan"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
