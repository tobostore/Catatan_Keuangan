"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { MonthlySummary } from "@/types/ai"

type MonthlySummaryCardProps = {
  userId: string
}

function monthsOptions() {
  const list: string[] = []
  const cursor = new Date()
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() - 1)

  for (let i = 0; i < 12; i++) {
    list.push(cursor.toISOString().slice(0, 7))
    cursor.setMonth(cursor.getMonth() - 1)
  }

  return list
}

function scoreTone(score: number) {
  if (score >= 80) return "text-green border-green/40 bg-green-dim/50"
  if (score >= 60) return "text-yellow-300 border-yellow-300/40 bg-yellow-900/30"
  if (score >= 40) return "text-orange-300 border-orange-300/40 bg-orange-900/30"
  return "text-red border-red/40 bg-red-dim/50"
}

export default function MonthlySummaryCard({ userId }: MonthlySummaryCardProps) {
  const options = useMemo(() => monthsOptions(), [])
  const [monthIndex, setMonthIndex] = useState(0)
  const month = options[monthIndex] ?? ""
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!month) return
      try {
        const res = await fetch(`/api/ai/monthly-summary?month=${encodeURIComponent(month)}`, { cache: "no-store" })
        const json = (await res.json()) as { exists?: boolean; data?: MonthlySummary }
        if (!mounted) return
        setSummary(json.exists ? json.data ?? null : null)
      } catch (error) {
        console.error("Fetch monthly summary failed", error)
      }
    }

    void run()
    return () => {
      mounted = false
    }
  }, [month])

  const generate = async () => {
    if (!userId || !month) return
    setIsLoading(true)

    try {
      const res = await fetch("/api/ai/monthly-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, month }),
      })
      const json = (await res.json()) as { success?: boolean; data?: MonthlySummary }
      if (json.success && json.data) {
        setSummary(json.data)
      } else {
        alert("Gagal generate laporan AI")
      }
    } catch (error) {
      console.error("Generate monthly summary failed", error)
      alert("Terjadi gangguan saat generate laporan")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="kasflow-monthly-summary glass-card rounded-[14px] p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
        <h2 className="text-sm font-semibold text-primary">Laporan Bulanan Otomatis</h2>
        <div className="kasflow-month-selector-wrap flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center justify-center rounded-full border border-white/15 bg-white/5 p-1">
            <button
              type="button"
              className="h-8 w-8 rounded-full text-secondary hover:text-primary hover:bg-white/10 disabled:opacity-40"
              onClick={() => setMonthIndex((prev) => Math.min(options.length - 1, prev + 1))}
              disabled={monthIndex >= options.length - 1}
            >
              <ArrowLeft className="mx-auto h-4 w-4" />
            </button>
            <span className="min-w-[96px] text-center text-sm font-medium text-primary px-2">{month || "-"}</span>
            <button
              type="button"
              className="h-8 w-8 rounded-full text-secondary hover:text-primary hover:bg-white/10 disabled:opacity-40"
              onClick={() => setMonthIndex((prev) => Math.max(0, prev - 1))}
              disabled={monthIndex <= 0}
            >
              <ChevronRight className="mx-auto h-4 w-4" />
            </button>
          </div>
          <Button
            onClick={() => void generate()}
            disabled={isLoading}
            className="w-full sm:w-auto animate-shimmer border-0 bg-gradient-to-r from-[#00D4AA] to-[#4D9FFF] text-[#05131f] hover:opacity-90"
          >
            {isLoading ? "Memproses..." : "Generate Laporan AI"}
          </Button>
        </div>
      </div>

      {!summary ? (
        <p className="mt-4 text-sm text-secondary">Belum ada laporan AI untuk bulan ini.</p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-4 sm:gap-6">
            <div className={`flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full border-2 text-xl sm:text-2xl font-bold ${scoreTone(summary.skor_keuangan)}`}>
              {summary.skor_keuangan}
            </div>
            <div>
              <p className="text-xs text-secondary">Grade</p>
              <p className="text-3xl sm:text-4xl font-bold text-primary">{summary.grade}</p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-sm italic text-secondary">{summary.ringkasan}</p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-primary">Yang Baik</h3>
              <div className="mt-3 space-y-2">
                {summary.pencapaian.map((item, idx) => (
                  <p key={`good-${idx}`} className="flex items-start gap-2 text-xs text-secondary">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-green" />
                    <span>{item}</span>
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-primary">Perlu Diperbaiki</h3>
              <div className="mt-3 space-y-2">
                {summary.perlu_diperbaiki.map((item, idx) => (
                  <p key={`fix-${idx}`} className="flex items-start gap-2 text-xs text-secondary">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-yellow-300" />
                    <span>{item}</span>
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-primary">Target Bulan Depan</h3>
              <div className="mt-3 space-y-2">
                {summary.target_bulan_depan.map((item, idx) => (
                  <p key={`target-${idx}`} className="flex items-start gap-2 text-xs text-secondary">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-violet-300" />
                    <span>{item}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-base px-4 py-3 text-sm text-secondary">
            Kategori paling boros: <span className="font-semibold text-primary">{summary.kategori_boros}</span> - {summary.saran_kategori_boros}
          </div>
        </>
      )}
    </div>
  )
}
