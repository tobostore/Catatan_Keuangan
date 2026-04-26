"use client"

import { useMemo, useState, useEffect } from "react"
import { useFinance } from "@/context/finance-context"
import { getCategoryColor } from "@/lib/utils"
import {
  Area,
  AreaChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts"
import { Wallet, Landmark, Banknote, ArrowUpRight, ArrowDownLeft, Plus, ArrowRight, BadgeDollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import AlertsPanel from "@/components/AlertsPanel"
import BudgetAnalysisCard from "@/components/BudgetAnalysisCard"

function AnimatedCounter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const duration = 800
    const startedAt = performance.now()

    let raf = 0
    const run = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1)
      setDisplayValue(value * (1 - (1 - progress) * (1 - progress)))
      if (progress < 1) {
        raf = requestAnimationFrame(run)
      }
    }

    raf = requestAnimationFrame(run)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return (
    <span>
      {new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
      }).format(displayValue)}
    </span>
  )
}

function SparklineCard({ data, color }: { data: Array<{ value: number }>; color: string }) {
  return (
    <div className="h-12 mt-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.45} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip cursor={false} content={() => null} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={`url(#spark-${color.replace("#", "")})`}
            strokeWidth={2}
            isAnimationActive
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border border-white/15 bg-[rgba(12,18,30,0.75)] px-3 py-2 backdrop-blur-xl">
      {label ? <p className="text-xs text-muted mb-1">{String(label)}</p> : null}
      {payload.map((item) => (
        <p key={item.name} className="text-xs text-primary flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          {item.name}: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(item.value || 0))}
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { transactions, accounts } = useFinance()
  const [userId, setUserId] = useState("")
  const [month, setMonth] = useState("")

  useEffect(() => {
    const currentMonth = new Date().toISOString().slice(0, 7)
    setMonth(currentMonth)

    let isMounted = true
    const loadMe = async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" })
        const json = (await res.json()) as { user?: { id?: string } }
        if (isMounted) {
          setUserId(String(json.user?.id ?? ""))
        }
      } catch (error) {
        console.error("Load profile for AI cards failed", error)
      }
    }

    void loadMe()

    return () => {
      isMounted = false
    }
  }, [])

  const accountBalances = useMemo(() => {
    return accounts.map((account) => {
      let incomeTotal = account.openingBalance ?? 0
      let expenseTotal = 0

      transactions.forEach((transaction) => {
        if (transaction.accountId !== account.id) {
          return
        }
        if (transaction.type === "income") {
          incomeTotal += transaction.amount
        } else {
          expenseTotal += transaction.amount
        }
      })

      return {
        id: account.id,
        name: account.name,
        institution: account.institution,
        type: account.type,
        totalIncome: incomeTotal,
        totalExpense: expenseTotal,
        balance: incomeTotal - expenseTotal,
      }
    })
  }, [accounts, transactions])

  const chartData = useMemo(() => {
    return accountBalances.map((account) => ({
      name: account.name,
      income: account.totalIncome,
      expense: account.totalExpense,
    }))
  }, [accountBalances])

  const monthlyTrendData = useMemo(() => {
    const now = new Date()
    const labels: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      labels.push(d.toISOString().slice(0, 7))
    }

    return labels.map((monthKey) => {
      const monthTransactions = transactions.filter((item) => item.date.startsWith(monthKey))
      const income = monthTransactions
        .filter((item) => item.type === "income")
        .reduce((sum, item) => sum + item.amount, 0)
      const expense = monthTransactions
        .filter((item) => item.type === "expense")
        .reduce((sum, item) => sum + item.amount, 0)

      return {
        label: new Date(`${monthKey}-01`).toLocaleDateString("id-ID", { month: "short" }),
        income,
        expense,
      }
    })
  }, [transactions])

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const chartMargin = {
    top: 16,
    right: 24,
    left: 8,
    bottom: isMobile ? 56 : 16,
  }

  const expenseByCategory = useMemo(() => {
    const grouped = transactions
      .filter((t) => t.type === "expense")
      .reduce((map, transaction) => {
        map.set(transaction.category, (map.get(transaction.category) || 0) + transaction.amount)
        return map
      }, new Map<string, number>())

    return Array.from(grouped.entries()).map(([name, value]) => ({ name, value }))
  }, [transactions])

  const expenseSliceColors = useMemo(() => {
    const fallbackPalette = [
      '#6ee7b7', // green
      '#c4b5fd', // accent
      '#f87171', // red
      '#93c5fd', // blue
      '#fca5a5', // pink
      '#fed7aa', // amber
    ]

    const paletteLen = fallbackPalette.length

    const hashToIndex = (s: string) => {
      let h = 0
      for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i)
        h |= 0
      }
      return Math.abs(h) % paletteLen
    }

    const colorFor = (category: string) => {
      const color = getCategoryColor(category, 'expense')
      if (color && color !== '#6b7280') return color
      return fallbackPalette[hashToIndex(category)]
    }

    return expenseByCategory.map((entry) => colorFor(entry.name))
  }, [expenseByCategory])

  const totalBalance = useMemo(() => {
    return accountBalances.reduce((sum, account) => sum + account.balance, 0)
  }, [accountBalances])

  const totalIncome = useMemo(() => {
    return accountBalances.reduce((sum, account) => sum + account.totalIncome, 0)
  }, [accountBalances])

  const totalExpense = useMemo(() => {
    return accountBalances.reduce((sum, account) => sum + account.totalExpense, 0)
  }, [accountBalances])

  const monthChange = useMemo(() => {
    const now = new Date()
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 7)
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7)

    const sumByType = (month: string, type: "income" | "expense") =>
      transactions
        .filter((item) => item.date.startsWith(month) && item.type === type)
        .reduce((sum, item) => sum + item.amount, 0)

    const currentIncome = sumByType(currentMonth, "income")
    const previousIncome = sumByType(previousMonth, "income")
    const currentExpense = sumByType(currentMonth, "expense")
    const previousExpense = sumByType(previousMonth, "expense")

    const calcPct = (current: number, previous: number) => {
      if (!previous && !current) return 0
      if (!previous) return 100
      return ((current - previous) / previous) * 100
    }

    return {
      income: calcPct(currentIncome, previousIncome),
      expense: calcPct(currentExpense, previousExpense),
    }
  }, [transactions])

  const sparkIncome = useMemo(
    () => monthlyTrendData.map((item) => ({ value: item.income })),
    [monthlyTrendData],
  )

  const sparkExpense = useMemo(
    () => monthlyTrendData.map((item) => ({ value: item.expense })),
    [monthlyTrendData],
  )

  const totalExpenseForPie = useMemo(
    () => expenseByCategory.reduce((sum, item) => sum + item.value, 0),
    [expenseByCategory],
  )

  const [activePieIndex, setActivePieIndex] = useState<number | null>(null)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value)
  }

  const getAccountIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "bank":
        return <Landmark className="h-5 w-5" />
      case "cash":
        return <Banknote className="h-5 w-5" />
      case "e-wallet":
      case "ewallet":
        return <BadgeDollarSign className="h-5 w-5" />
      default:
        return <Wallet className="h-5 w-5" />
    }
  }

  const getAccountAccent = (type: string) => {
    switch (type.toLowerCase()) {
      case "bank":
        return "#4D9FFF"
      case "cash":
        return "#00D4AA"
      case "e-wallet":
      case "ewallet":
        return "#FF5C7C"
      default:
        return "#7dd3fc"
    }
  }

  const goToTransactionsForAccount = (accountId: string) => {
    window.dispatchEvent(
      new CustomEvent("kasflow:open-transactions", {
        detail: { accountId },
      }),
    )
  }

  return (
    <div className="kasflow-dashboard space-y-6 sm:space-y-7 pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="kasflow-page-title text-2xl md:text-[28px] font-semibold text-primary mb-1">
            Dashboard
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            Kelola keuangan pribadi Anda
          </p>
        </div>
        <Button className="hidden sm:inline-flex bg-gradient-to-r from-[#00D4AA] to-[#4D9FFF] hover:opacity-90 text-[#061220] font-semibold rounded-xl gap-2 shadow-[0_0_20px_rgba(0,212,170,0.25)]">
          <Plus className="h-4 w-4" />
          <span>Tambah Transaksi</span>
        </Button>
      </div>

      {accountBalances.length > 0 && (
        <section className="kasflow-summary-cards grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="gradient-border-card glass-card p-4 sm:p-5 animate-slide-in">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs uppercase tracking-[0.15em] text-muted font-semibold">Saldo Total</span>
              <Wallet className="h-4 w-4 text-[#4D9FFF]" />
            </div>
            <div className="text-2xl font-bold text-primary mb-1">
              <AnimatedCounter value={totalBalance} />
            </div>
            <p className="text-xs text-secondary">Dari {accountBalances.length} rekening</p>
          </div>

          <div className="gradient-border-card glass-card p-4 sm:p-5 animate-slide-in" style={{ animationDelay: "60ms" }}>
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs uppercase tracking-[0.15em] text-muted font-semibold">Pemasukan</span>
              <ArrowDownLeft className="h-4 w-4 text-green" />
            </div>
            <div className="text-2xl font-bold text-green mb-1">
              <AnimatedCounter value={totalIncome} />
            </div>
            <div className="inline-flex items-center rounded-full border border-[#00D4AA]/35 bg-[#00D4AA]/14 px-2.5 py-1 text-[11px] text-green font-semibold">
              {monthChange.income >= 0 ? "↑" : "↓"} {Math.abs(monthChange.income).toFixed(0)}%
            </div>
            <SparklineCard data={sparkIncome} color="#00D4AA" />
          </div>

          <div className="gradient-border-card glass-card p-4 sm:p-5 animate-slide-in" style={{ animationDelay: "110ms" }}>
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs uppercase tracking-[0.15em] text-muted font-semibold">Pengeluaran</span>
              <ArrowUpRight className="h-4 w-4 text-red" />
            </div>
            <div className="text-2xl font-bold text-red mb-1">
              <AnimatedCounter value={totalExpense} />
            </div>
            <div className="inline-flex items-center rounded-full border border-[#FF5C7C]/35 bg-[#FF5C7C]/14 px-2.5 py-1 text-[11px] text-red font-semibold">
              {monthChange.expense >= 0 ? "↑" : "↓"} {Math.abs(monthChange.expense).toFixed(0)}%
            </div>
            <SparklineCard data={sparkExpense} color="#FF5C7C" />
          </div>
        </section>
      )}

      {userId ? <AlertsPanel userId={userId} /> : null}
      {userId && month ? <BudgetAnalysisCard userId={userId} month={month} /> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="kasflow-trend-chart lg:col-span-2 glass-card rounded-[14px]">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10">
            <h2 className="text-sm font-semibold text-primary mb-1">Tren Pemasukan & Pengeluaran</h2>
            <p className="text-xs text-secondary">Perbandingan per akun</p>
          </div>
          <div className="p-4 sm:p-6">
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 280}>
              <AreaChart data={chartData} margin={chartMargin}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00D4AA" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#00D4AA" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF5C7C" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#FF5C7C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="name"
                  stroke="var(--text-muted)"
                  interval={isMobile ? 1 : 0}
                  height={isMobile ? 56 : 36}
                  angle={isMobile ? -30 : 0}
                  textAnchor={isMobile ? "end" : "middle"}
                  tickMargin={10}
                  tick={{ fontSize: 11, fontFamily: 'DM Sans' }}
                  tickFormatter={(value) =>
                    isMobile && typeof value === "string" && value.length > 10
                      ? `${value.slice(0, 10)}...`
                      : value
                  }
                />
                <YAxis
                  stroke="var(--text-muted)" 
                  tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
                  tickCount={isMobile ? 4 : 6}
                  tick={{ fontSize: 11, fontFamily: 'DM Mono' }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" />
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Pemasukan"
                  stroke="#00D4AA"
                  fill="url(#incomeFill)"
                  strokeWidth={2.5}
                  isAnimationActive
                  animationDuration={900}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="Pengeluaran"
                  stroke="#FF5C7C"
                  fill="url(#expenseFill)"
                  strokeWidth={2.5}
                  isAnimationActive
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="kasflow-composition-chart glass-card rounded-[14px]">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10">
            <h2 className="text-sm font-semibold text-primary mb-1">Komposisi Pengeluaran</h2>
            <p className="text-xs text-secondary">Breakdown per kategori</p>
          </div>
          <div className="p-4 sm:p-6">
            {expenseByCategory.length > 0 ? (
              <>
                <div className="relative h-[200px] sm:h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseByCategory}
                        cx="50%"
                        cy="50%"
                        innerRadius={isMobile ? 42 : 50}
                        outerRadius={isMobile ? 74 : 85}
                        paddingAngle={2}
                        minAngle={5}
                        dataKey="value"
                        onMouseEnter={(_, idx) => setActivePieIndex(idx)}
                        onMouseLeave={() => setActivePieIndex(null)}
                      >
                        {expenseByCategory.map((_entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={expenseSliceColors[index]}
                            stroke={activePieIndex === index ? "#ffffff" : "transparent"}
                            strokeWidth={activePieIndex === index ? 1.2 : 0}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center text-center pointer-events-none px-6">
                    <div>
                    <p className="text-xs text-muted">Total</p>
                    <p className="text-sm font-semibold text-primary">{formatCurrency(totalExpenseForPie)}</p>
                    {activePieIndex !== null ? (
                      <p className="text-[11px] text-secondary mt-1">
                        {expenseByCategory[activePieIndex]?.name}: {((expenseByCategory[activePieIndex]?.value ?? 0) / Math.max(1, totalExpenseForPie) * 100).toFixed(1)}%
                      </p>
                    ) : null}
                    </div>
                  </div>
                </div>
                <div className="kasflow-donut-legend mt-3 grid grid-cols-1 sm:grid-cols-1 gap-2">
                  {expenseByCategory.map((entry, idx) => (
                    <div key={`legend-${entry.name}`} className="flex items-center gap-2 text-xs text-secondary rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: expenseSliceColors[idx] }} />
                      <span className="truncate flex-1">{entry.name}</span>
                      <span>{((entry.value / Math.max(1, totalExpenseForPie)) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-[240px] items-center justify-center text-muted">
                Belum ada data
              </div>
            )}
          </div>
        </div>
      </div>

      {accountBalances.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-primary">Akun-akun Anda</h2>
          <div className="kasflow-account-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {accountBalances.map((account) => (
              <div
                key={account.id}
                className="kasflow-account-card group glass-card rounded-[14px] p-4 sm:p-5 border-l-4 transition-all hover:-translate-y-1"
                style={{ borderLeftColor: getAccountAccent(account.type) }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-primary">{account.name}</p>
                    <p className="text-xs text-secondary mt-1">{account.institution || account.type}</p>
                    <div className="kasflow-mobile-account-balance mt-2 hidden items-center justify-between gap-3">
                      <span className="text-xs text-muted">Saldo</span>
                      <span className={`text-sm font-semibold ${account.balance >= 0 ? "text-green" : "text-red"}`}>
                        {formatCurrency(account.balance)}
                      </span>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-accent">
                    {getAccountIcon(account.type)}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Pemasukan</span>
                    <span className="text-sm font-semibold text-green">{formatCurrency(account.totalIncome)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Pengeluaran</span>
                    <span className="text-sm font-semibold text-red">{formatCurrency(account.totalExpense)}</span>
                  </div>
                  <div className="kasflow-account-balance-row border-t border-border pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-primary">Saldo</span>
                      <span className={`text-lg font-semibold ${account.balance >= 0 ? "text-green" : "text-red"}`}>
                        {formatCurrency(account.balance)}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => goToTransactionsForAccount(String(account.id))}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#4D9FFF]/35 bg-[#4D9FFF]/10 px-3 py-1 text-[11px] text-[#87BCFF] opacity-100 sm:opacity-0 sm:translate-y-2 sm:group-hover:opacity-100 sm:group-hover:translate-y-0"
                >
                  Lihat Transaksi <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="glass-card rounded-[14px]">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10">
          <h2 className="text-sm font-semibold text-primary mb-1">Transaksi Terbaru</h2>
          <p className="text-xs text-secondary">
            {transactions.length > 10 ? "10 transaksi terakhir" : `${transactions.length} transaksi`}
          </p>
        </div>
        <div className="divide-y divide-white/5">
          {transactions.length > 0 ? (
            transactions.slice(0, 10).map((transaction, index) => (
              <div
                key={transaction.id}
                className={`px-4 sm:px-6 py-4 transition-colors duration-200 flex items-center justify-between border-l-2 animate-slide-in ${
                  index % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent"
                } hover:bg-white/[0.04]`}
                style={{
                  borderLeftColor: getCategoryColor(transaction.category, transaction.type),
                  animationDelay: `${index * 45}ms`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">{transaction.description}</p>
                  <p className="text-xs text-secondary mt-1">
                    {transaction.category} • {transaction.accountName} • {transaction.date}
                  </p>
                </div>
                <div className="ml-4 text-right">
                  <p
                    className={`text-sm font-semibold ${
                      transaction.type === "income" ? "text-green" : "text-red"
                    }`}
                  >
                    {transaction.type === "income" ? "+ " : "- "} {formatCurrency(transaction.amount)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-12 flex items-center justify-center text-muted">
              Belum ada transaksi
            </div>
          )}
        </div>
      </div>

      <Button className="sm:hidden fixed bottom-5 right-4 z-30 rounded-full h-12 w-12 p-0 bg-gradient-to-r from-[#00D4AA] to-[#4D9FFF] text-[#061220] shadow-[0_0_20px_rgba(0,212,170,0.45)] hover:scale-[1.02]">
        <Plus className="h-5 w-5" />
        <span className="sr-only">Tambah Transaksi</span>
      </Button>
    </div>
  )
}
