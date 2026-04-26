"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  RefreshCcw,
  Rocket,
  Scissors,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useFinance } from "@/context/finance-context"
import type { BudgetAnalysis } from "@/types/ai"

type BudgetAnalysisCardProps = {
  userId: string
  month: string
}

type AllocationRuleInput = {
  id?: number
  name: string
  percentage?: number
}

function normalizeKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

function getAllocationKeywords(allocationName: string) {
  const key = normalizeKey(allocationName)
  const keywords = new Set(key.split(" ").filter((item) => item.length > 2))

  if (/kebutuhan|pokok/i.test(key)) {
    ;["kebutuhan", "pokok", "makan", "tagihan", "listrik", "air", "transport", "sembako", "cicilan"].forEach((item) =>
      keywords.add(item),
    )
  }

  if (/keinginan|jajan|hiburan|lifestyle|gaya hidup/i.test(key)) {
    ;["keinginan", "jajan", "hiburan", "nongkrong", "belanja", "rekreasi"].forEach((item) => keywords.add(item))
  }

  if (/tabungan|darurat|investasi|saving/i.test(key)) {
    ;["tabungan", "darurat", "investasi", "saving", "deposito"].forEach((item) => keywords.add(item))
  }

  return Array.from(keywords)
}

function toCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value)
}

export default function BudgetAnalysisCard({ userId, month }: BudgetAnalysisCardProps) {
  const { transactions } = useFinance()
  const [analysis, setAnalysis] = useState<BudgetAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showAllKategori, setShowAllKategori] = useState(false)
  const [analyzedAt, setAnalyzedAt] = useState<string>("")
  const [isEditingAllocation, setIsEditingAllocation] = useState(false)
  const [allocationRules, setAllocationRules] = useState<AllocationRuleInput[]>([])
  const [isSavingAllocation, setIsSavingAllocation] = useState(false)

  useEffect(() => {
    let isMounted = true

    const checkExisting = async () => {
      if (!userId || !month) return
      try {
        const res = await fetch(`/api/ai/budget/${encodeURIComponent(month)}`, { cache: "no-store" })
        const json = (await res.json()) as {
          exists?: boolean
          data?: BudgetAnalysis | null
          meta?: { updatedAt?: string }
        }

        if (!isMounted) return

        if (json.exists && json.data) {
          setAnalysis(json.data)
          setAnalyzedAt(json.meta?.updatedAt ?? new Date().toISOString())
        } else {
          setAnalysis(null)
        }
      } catch (error) {
        console.error("Check budget analysis failed", error)
      }
    }

    void checkExisting()

    return () => {
      isMounted = false
    }
  }, [userId, month])

  useEffect(() => {
    let isMounted = true

    const loadAllocationRules = async () => {
      try {
        const res = await fetch("/api/ai/budget-allocation", { cache: "no-store" })
        const json = (await res.json()) as {
          success?: boolean
          data?: Array<{ id?: number; name?: string; percentage?: number }>
        }

        if (!isMounted || !json.success || !Array.isArray(json.data)) return

        setAllocationRules(
          json.data.map((item) => ({
            id: item.id,
            name: String(item.name ?? ""),
            percentage: Number(item.percentage ?? 0),
          })),
        )
      } catch (error) {
        console.error("Load allocation rules failed", error)
      }
    }

    void loadAllocationRules()

    return () => {
      isMounted = false
    }
  }, [])

  const submitAnalysis = async () => {
    if (!userId || !month) return

    setIsLoading(true)

    try {
      const res = await fetch("/api/ai/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, month }),
      })
      const json = (await res.json()) as { success?: boolean; data?: BudgetAnalysis; message?: string }

      if (json.success && json.data) {
        setAnalysis(json.data)
        setAnalyzedAt(new Date().toISOString())
      } else {
        alert(json.message ?? "Analisis gagal dibuat. Pastikan transaksi kategori Gaji bulan ini sudah ada.")
      }
    } catch (error) {
      console.error("Analyze budget failed", error)
      alert("Terjadi gangguan saat memproses analisis")
    } finally {
      setIsLoading(false)
    }
  }

  const visibleKategori = useMemo(() => {
    if (!analysis) return []
    return showAllKategori ? analysis.saran_budget : analysis.saran_budget.slice(0, 5)
  }, [analysis, showAllKategori])

  const allocationItems = useMemo(() => {
    if (!analysis) return []

    if (Array.isArray(analysis.alokasi_ideal_items) && analysis.alokasi_ideal_items.length > 0) {
      return analysis.alokasi_ideal_items
    }

    return [
      {
        name: "Kebutuhan Pokok",
        percentage: 0,
        amount: analysis.alokasi_ideal.kebutuhan_pokok,
      },
      {
        name: "Keinginan",
        percentage: 0,
        amount: analysis.alokasi_ideal.keinginan,
      },
      {
        name: "Tabungan",
        percentage: 0,
        amount: analysis.alokasi_ideal.tabungan,
      },
    ]
  }, [analysis])

  const allocationTotal = useMemo(
    () => allocationRules.reduce((sum, item) => sum + Number(item.percentage || 0), 0),
    [allocationRules],
  )

  const categoryUsageMap = useMemo(() => {
    const usage = new Map<string, number>()
    const normalize = (value: string) => normalizeKey(value)
    const toTokens = (value: string) =>
      normalize(value)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length > 2)

    const monthExpenses = transactions.filter((item) => item.type === "expense" && item.date.startsWith(month))
    for (const item of monthExpenses) {
      const key = normalize(item.category)
      usage.set(key, (usage.get(key) ?? 0) + Math.max(0, Number(item.amount ?? 0)))
    }

    const usageFromAnalysis = new Map<string, number>()
    for (const item of analysis?.saran_budget ?? []) {
      const key = normalize(item.kategori)
      usageFromAnalysis.set(key, Math.max(0, Number(item.pengeluaran_sekarang ?? 0)))
    }

    for (const [analysisKey, analysisAmount] of usageFromAnalysis.entries()) {
      if ((usage.get(analysisKey) ?? 0) > 0) {
        continue
      }

      const analysisTokens = toTokens(analysisKey)
      for (const [usageKey, existing] of usage.entries()) {
        const usageTokens = toTokens(usageKey)
        const overlap = analysisTokens.some((token) => usageTokens.includes(token))
        if (overlap) {
          usage.set(usageKey, Math.max(existing, analysisAmount))
        }
      }

      if (!usage.has(analysisKey)) {
        usage.set(analysisKey, analysisAmount)
      }
    }

    return usage
  }, [analysis, transactions, month])

  const saveAllocationRules = async () => {
    if (allocationRules.length === 0) {
      alert("Minimal harus ada 1 pos alokasi")
      return
    }

    const hasInvalidName = allocationRules.some((item) => !item.name.trim())
    if (hasInvalidName) {
      alert("Nama pos alokasi tidak boleh kosong")
      return
    }

    setIsSavingAllocation(true)
    try {
      const res = await fetch("/api/ai/budget-allocation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoAllocate: true,
          rules: allocationRules.map((item) => ({ id: item.id, name: item.name })),
        }),
      })

      const json = (await res.json()) as {
        success?: boolean
        message?: string
        data?: Array<{ id?: number; name?: string; percentage?: number }>
      }

      if (!json.success) {
        alert(json.message ?? "Gagal menyimpan alokasi")
        return
      }

      if (Array.isArray(json.data)) {
        setAllocationRules(
          json.data.map((item) => ({
            id: item.id,
            name: String(item.name ?? ""),
            percentage: Number(item.percentage ?? 0),
          })),
        )
      }

      setIsEditingAllocation(false)
      if (analysis) {
        await submitAnalysis()
      }
    } catch (error) {
      console.error("Save allocation rules failed", error)
      alert("Gagal menyimpan alokasi")
    } finally {
      setIsSavingAllocation(false)
    }
  }

  if (!analysis) {
    return (
      <div className="glass-card rounded-[14px] p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-primary">Analisis Budget Bulan Ini</h2>
        <p className="mt-1 text-xs text-secondary">AI akan otomatis mengambil nominal gaji dari transaksi kategori Gaji di bulan ini.</p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => void submitAnalysis()} disabled={isLoading}>
            {isLoading ? "Menganalisis..." : "Analisis Sekarang"}
          </Button>
        </div>

        {isLoading && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-secondary">
            AI sedang menganalisis keuangan kamu...
          </div>
        )}
      </div>
    )
  }

  const statusTone =
    analysis.status_keuangan === "sehat"
      ? {
          bg: "bg-green-dim/50",
          text: "text-green",
          icon: <CheckCircle2 className="h-5 w-5" />,
          label: "Sehat",
        }
      : analysis.status_keuangan === "perhatian"
        ? {
            bg: "bg-yellow-900/30",
            text: "text-yellow-300",
            icon: <AlertTriangle className="h-5 w-5" />,
            label: "Perhatian",
          }
        : {
            bg: "bg-red-dim/50",
            text: "text-red",
            icon: <XCircle className="h-5 w-5" />,
            label: "Kritis",
          }

  const expenseRatio = Math.max(0, Math.min(100, Number(analysis.persentase_pengeluaran || 0)))
  const radius = 56
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - (expenseRatio / 100) * circumference
  const tipIcons = [
    { Icon: Lightbulb, color: "#00D4AA" },
    { Icon: Scissors, color: "#FF9B5A" },
    { Icon: Rocket, color: "#4D9FFF" },
  ]

  return (
    <div className="kasflow-budget glass-card rounded-[14px] p-4 sm:p-6">
      <div className="rounded-2xl border border-white/10 bg-[linear-gradient(140deg,rgba(0,212,170,0.08),rgba(77,159,255,0.08))] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${statusTone.bg} ${statusTone.text}`}>
            {statusTone.icon}
            Status: {statusTone.label}
          </div>
          <p className="text-xs text-secondary">Pengeluaran: {analysis.persentase_pengeluaran}% dari pemasukan</p>
        </div>

        <p className="mt-3 text-sm italic text-muted">{analysis.pesan_utama}</p>

        <div className="kasflow-budget-layout mt-5 grid gap-6 lg:grid-cols-[220px_1fr] items-center">
          <div className="kasflow-budget-ring mx-auto relative h-[132px] w-[132px] sm:h-[150px] sm:w-[150px]">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 140 140" role="img" aria-label="Rasio pengeluaran">
              <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke="url(#expenseRingGradient)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeOffset}
                style={{ transition: "stroke-dashoffset 0.8s ease" }}
              />
              <defs>
                <linearGradient id="expenseRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00D4AA" />
                  <stop offset="100%" stopColor="#4D9FFF" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Expense Ratio</p>
              <p className="text-2xl font-bold text-primary">{expenseRatio.toFixed(0)}%</p>
            </div>
          </div>

          <div className="kasflow-budget-allocation space-y-3">
            {allocationItems.map((item, idx) => {
              const kategoriKey = normalizeKey(item.name)
              const directSpent = Math.max(0, Number(categoryUsageMap.get(kategoriKey) ?? 0))
              const fallbackSpent = Array.from(categoryUsageMap.entries()).reduce((sum, [categoryKey, value]) => {
                const keywords = getAllocationKeywords(item.name)
                const isMatched = keywords.some((keyword) => categoryKey.includes(keyword) || keyword.includes(categoryKey))
                return isMatched ? sum + Math.max(0, Number(value ?? 0)) : sum
              }, 0)
              const spentAmount = directSpent > 0 ? directSpent : fallbackSpent
              const maxAmount = Math.max(0, Number(item.amount ?? 0))
              const usagePercent = maxAmount > 0 ? Math.min(100, (spentAmount / maxAmount) * 100) : 0
              const state = usagePercent <= 85 ? "aman" : usagePercent <= 100 ? "berlebih" : "kritis"
              const barColor = idx % 3 === 0 ? "#00D4AA" : idx % 3 === 1 ? "#4D9FFF" : "#FF9B5A"

              return (
                <div key={`${item.name}-${idx}`}>
                  <div className="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between text-xs">
                    <span className="text-secondary">{item.name}</span>
                      <span className="text-secondary text-[11px] sm:text-xs">
                      {toCurrency(spentAmount)} / {toCurrency(maxAmount)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${state === "aman" ? "animate-soft-pulse" : ""} ${
                        state === "kritis" ? "animate-warn-shake" : ""
                      }`}
                      style={{
                        width: `${Math.min(100, usagePercent)}%`,
                        background: `linear-gradient(90deg, ${barColor}, ${state === "kritis" ? "#FF5C7C" : "#8acbff"})`,
                        boxShadow: `0 0 14px ${barColor}55`,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-right text-muted font-medium uppercase">
                    {state} {item.percentage > 0 ? `• ${item.percentage.toFixed(1)}%` : ""}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4 rounded-[10px] border border-white/10 bg-white/5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-primary">Alokasi Ideal (Custom User)</h3>
          {!isEditingAllocation ? (
            <button
              type="button"
              className="text-xs text-accent"
              onClick={() => setIsEditingAllocation(true)}
            >
              Atur Pos Alokasi
            </button>
          ) : null}
        </div>

        {isEditingAllocation ? (
          <div className="space-y-3 rounded-lg border border-border bg-base p-3">
            <div className="space-y-2">
              {allocationRules.map((item, index) => (
                <div key={`allocation-rule-${index}-${item.id ?? "new"}`} className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
                  <Input
                    value={item.name}
                    placeholder="Nama pos (contoh: Investasi)"
                    onChange={(event) =>
                      setAllocationRules((prev) =>
                        prev.map((row, rowIndex) =>
                          rowIndex === index
                            ? {
                                ...row,
                                name: event.target.value,
                              }
                            : row,
                        ),
                      )
                    }
                  />
                  <div className="flex items-center rounded-md border border-border bg-surface px-3 text-xs text-secondary">
                    {typeof item.percentage === "number" ? `${item.percentage.toFixed(2)}%` : "AI otomatis"}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setAllocationRules((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
                    }
                    disabled={allocationRules.length <= 1}
                  >
                    Hapus
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs text-accent"
                onClick={() =>
                  setAllocationRules((prev) => [...prev, { name: "" }])
                }
              >
                + Tambah Pos
              </button>
              <p className="text-xs text-secondary">
                AI akan hitung persentase otomatis saat simpan.
                {allocationTotal > 0 ? ` (Saat ini ${allocationTotal.toFixed(2)}%)` : ""}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setIsEditingAllocation(false)}>
                Batal
              </Button>
              <Button type="button" size="sm" onClick={() => void saveAllocationRules()} disabled={isSavingAllocation}>
                {isSavingAllocation ? "Menyimpan..." : "Simpan Alokasi"}
              </Button>
            </div>
          </div>
        ) : null}

      </div>

      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-semibold text-primary">Saran Per Kategori</h3>
        <div className="space-y-2">
          {visibleKategori.map((item) => {
            const tone =
              item.status === "aman"
                ? { icon: "✓", text: "text-green" }
                : item.status === "berlebih"
                  ? { icon: "⚠", text: "text-yellow-300" }
                  : { icon: "✕", text: "text-red" }

            return (
              <div key={`${item.kategori}-${item.status}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={tone.text}>{tone.icon}</span>
                  <span className="font-medium text-primary">{item.kategori}</span>
                  <span className="text-[11px] sm:text-xs text-secondary">{toCurrency(item.pengeluaran_sekarang)} → ideal {toCurrency(item.batas_saran)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{item.saran}</p>
              </div>
            )
          })}
        </div>

        {analysis.saran_budget.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAllKategori((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs text-accent"
          >
            {showAllKategori ? "Tutup" : "Lihat semua"}
            {showAllKategori ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-primary">Tips Bulan Ini</h3>
        <div className="kasflow-tips-list mt-3 flex gap-3 overflow-x-auto pb-2">
          {analysis.tips_bulan_ini.slice(0, 3).map((tip, idx) => (
            <div
              key={`tip-${idx}`}
              className="kasflow-tip-card min-w-[220px] sm:min-w-[250px] rounded-xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 hover:-translate-y-1"
              style={{
                borderTop: `2px solid ${tipIcons[idx % tipIcons.length]?.color || "#00D4AA"}`,
              }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-secondary">{String(idx + 1).padStart(2, "0")}</p>
                {(() => {
                  const IconComp = tipIcons[idx % tipIcons.length]?.Icon ?? Lightbulb
                  const iconColor = tipIcons[idx % tipIcons.length]?.color || "#00D4AA"
                  return <IconComp className="h-5 w-5" style={{ color: iconColor }} />
                })()}
              </div>
              <p className="mt-2 text-xs text-secondary">{tip}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-secondary">
          Target tabungan: {toCurrency(analysis.target_tabungan_bulan_ini)} | Estimasi aktual: {toCurrency(analysis.estimasi_tabungan_aktual)}
        </p>

        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void submitAnalysis()}
          disabled={isLoading}
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          {isLoading ? "Memperbarui..." : "Perbarui Analisis"}
        </Button>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        Dianalisis oleh AI · {analyzedAt ? new Date(analyzedAt).toLocaleString("id-ID") : "baru saja"}
      </p>
    </div>
  )
}
