"use client"

import { useFinance } from "@/context/finance-context"
import { useMemo, useState, useEffect } from "react"
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { getCategoryColor } from "@/lib/utils"
import MonthlySummaryCard from "@/components/MonthlySummaryCard"

export default function Reports() {
  const { transactions, getTotalIncome, getTotalExpense, getBalance, accounts } = useFinance()
  const [userId, setUserId] = useState("")

  const income = getTotalIncome()
  const expense = getTotalExpense()
  const balance = getBalance()

  // Group transactions by category
  const incomeByCategory = Array.from(
    transactions
      .filter((t) => t.type === "income")
      .reduce((map, t) => {
        map.set(t.category, (map.get(t.category) || 0) + t.amount)
        return map
      }, new Map<string, number>()),
  ).map(([name, value]) => ({ name, value }))

  const expenseByCategory = Array.from(
    transactions
      .filter((t) => t.type === "expense")
      .reduce((map, t) => {
        map.set(t.category, (map.get(t.category) || 0) + t.amount)
        return map
      }, new Map<string, number>()),
  ).map(([name, value]) => ({ name, value }))

  const incomeCategoryColors = useMemo(() => {
    const fallbackPalette = ['#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#ef4444', '#f59e0b', '#eab308', '#94a3b8']
    const used = new Set<string>()
    let idx = 0
    return incomeByCategory.map((entry) => {
      const color = getCategoryColor(entry.name, 'income')
      if (!color || color === '#6b7280' || used.has(color)) {
        let pick = fallbackPalette[idx % fallbackPalette.length]
        while (used.has(pick)) {
          idx++
          pick = fallbackPalette[idx % fallbackPalette.length]
        }
        used.add(pick)
        idx++
        return pick
      }
      used.add(color)
      return color
    })
  }, [incomeByCategory])

  const expenseCategoryColors = useMemo(() => {
    const fallbackPalette = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#94a3b8']
    const used = new Set<string>()
    let idx = 0
    return expenseByCategory.map((entry) => {
      const color = getCategoryColor(entry.name, 'expense')
      if (!color || color === '#6b7280' || used.has(color)) {
        let pick = fallbackPalette[idx % fallbackPalette.length]
        while (used.has(pick)) {
          idx++
          pick = fallbackPalette[idx % fallbackPalette.length]
        }
        used.add(pick)
        idx++
        return pick
      }
      used.add(color)
      return color
    })
  }, [expenseByCategory])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value)
  }

  const [chartHeight, setChartHeight] = useState<number>(300)

  useEffect(() => {
    let mounted = true

    const run = async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" })
        const json = (await res.json()) as { user?: { id?: string } }
        if (mounted) {
          setUserId(String(json.user?.id ?? ""))
        }
      } catch (error) {
        console.error("Load profile for monthly summary failed", error)
      }
    }

    void run()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    function update() {
      const w = typeof window !== "undefined" ? window.innerWidth : 1024
      // if width < 640 (sm) use smaller chart height
      setChartHeight(w < 640 ? 220 : 300)
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const sourceSummaries = useMemo(() => {
    // Summarize income & expense per account (sumber)
    return accounts.map((account) => {
      const income = transactions
        .filter((t) => t.accountId === account.id && t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0)

      const expense = transactions
        .filter((t) => t.accountId === account.id && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0)

      const count = transactions.filter((t) => t.accountId === account.id).length

      return {
        id: account.id,
        name: account.name,
        income,
        expense,
        count,
      }
    })
  }, [accounts, transactions])

  const calculatePercentage = (value: number, total: number) => {
    if (total === 0) return 0
    return ((value / total) * 100).toFixed(1)
  }

  return (
    <div className="kasflow-reports space-y-6 sm:space-y-7 pb-8">
      <div>
        <h1 className="kasflow-page-title text-2xl md:text-[28px] font-semibold text-primary mb-1">Laporan Analisis</h1>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Analisis detail keuangan Anda</p>
      </div>

      {userId ? <MonthlySummaryCard userId={userId} /> : null}

      {/* Summary Per Sumber (akun) */}
      {sourceSummaries.length > 0 && (
        <section>
          <div className="kasflow-reports-summary-grid grid grid-cols-1 sm:grid-cols-2 gap-5">
            {sourceSummaries.map((s) => (
              <div key={s.id} className="glass-card rounded-[14px] p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-primary mb-1">{s.name}</h3>
                <p className="text-xs text-secondary mb-4">{s.count} transaksi</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <span className="text-xs text-muted">Pemasukan</span>
                    <p className="text-sm font-semibold text-green">{formatCurrency(s.income)}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted">Pengeluaran</span>
                    <p className="text-sm font-semibold text-red">{formatCurrency(s.expense)}</p>
                  </div>
                  <div className="space-y-1 sm:text-right">
                    <span className="text-xs text-muted">Rasio</span>
                    <p className="text-sm font-semibold text-[#4D9FFF]">
                      {s.income === 0 ? '0%' : `${calculatePercentage(s.income - s.expense, s.income)}%`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {incomeByCategory.length > 0 && (
          <div className="glass-card rounded-[14px]">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10">
              <h2 className="text-sm font-semibold text-primary mb-1">Pemasukan per Kategori</h2>
              <p className="text-xs text-secondary">Komposisi sumber pemasukan</p>
            </div>
            <div className="p-4 sm:p-6">
              <ResponsiveContainer width="100%" height={chartHeight}>
                <PieChart>
                  <Pie
                    data={incomeByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    minAngle={5}
                    stroke="var(--bg-surface)"
                    strokeWidth={1}
                    dataKey="value"
                  >
                    {incomeByCategory.map((entry, index) => (
                      <Cell key={`cell-income-${index}`} fill={incomeCategoryColors[index]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(12,18,30,0.75)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "12px",
                      color: "var(--text-primary)",
                      backdropFilter: "blur(10px)",
                    }}
                    formatter={(value) => formatCurrency(value as number)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 flex flex-col gap-2">
                {incomeByCategory.map((entry, idx) => (
                  <div
                    key={`income-legend-${entry.name}`}
                    className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-secondary hover:text-primary hover:border-[#4D9FFF]/45 bg-white/5"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: incomeCategoryColors[idx] }}
                    />
                    <span className="font-medium flex-1 truncate">{entry.name}</span>
                    <span className="text-xs text-muted whitespace-nowrap">{calculatePercentage(entry.value, income)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {expenseByCategory.length > 0 && (
          <div className="glass-card rounded-[14px]">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10">
              <h2 className="text-sm font-semibold text-primary mb-1">Pengeluaran per Kategori</h2>
              <p className="text-xs text-secondary">Komposisi pengeluaran Anda</p>
            </div>
            <div className="p-4 sm:p-6">
              <ResponsiveContainer width="100%" height={chartHeight}>
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    minAngle={5}
                    stroke="var(--bg-surface)"
                    strokeWidth={1}
                    dataKey="value"
                  >
                    {expenseByCategory.map((entry, index) => (
                      <Cell key={`cell-expense-${index}`} fill={expenseCategoryColors[index]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(12,18,30,0.75)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "12px",
                      color: "var(--text-primary)",
                      backdropFilter: "blur(10px)",
                    }}
                    formatter={(value) => formatCurrency(value as number)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 flex flex-col gap-2">
                {expenseByCategory.map((entry, idx) => (
                  <div
                    key={`expense-legend-${entry.name}`}
                    className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-secondary hover:text-primary hover:border-[#FF5C7C]/45 bg-white/5"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: expenseCategoryColors[idx] }}
                    />
                    <span className="font-medium flex-1 truncate">{entry.name}</span>
                    <span className="text-xs text-muted whitespace-nowrap">{calculatePercentage(entry.value, expense)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Table */}
      <div className="glass-card rounded-[14px]">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10">
          <h2 className="text-sm font-semibold text-primary mb-1">Ringkasan Kategori</h2>
          <p className="text-xs text-secondary">Detil pengeluaran dan pemasukan per kategori</p>
        </div>
        <div className="p-4 sm:p-6 space-y-6">
          {expenseByCategory.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-primary mb-4">Pengeluaran</h3>
              <div className="space-y-2 divide-y divide-border">
                {expenseByCategory.map((item) => (
                  <div key={item.name} className="kasflow-breakdown-row flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 first:pt-0 last:pb-0 hover:bg-elevated px-2 rounded-lg transition-colors">
                    <span className="text-sm text-secondary font-medium">{item.name}</span>
                    <div className="sm:text-right">
                      <p className="text-sm font-semibold text-red">{formatCurrency(item.value)}</p>
                      <p className="text-xs text-muted">
                        {calculatePercentage(item.value, expense)}% dari total
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {incomeByCategory.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-primary mb-4">Pemasukan</h3>
              <div className="space-y-2 divide-y divide-border">
                {incomeByCategory.map((item) => (
                  <div key={item.name} className="kasflow-breakdown-row flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 first:pt-0 last:pb-0 hover:bg-elevated px-2 rounded-lg transition-colors">
                    <span className="text-sm text-secondary font-medium">{item.name}</span>
                    <div className="sm:text-right">
                      <p className="text-sm font-semibold text-green">{formatCurrency(item.value)}</p>
                      <p className="text-xs text-muted">
                        {calculatePercentage(item.value, income)}% dari total
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
