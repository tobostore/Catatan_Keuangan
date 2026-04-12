"use client"

import { useMemo, useState, useEffect } from "react"
import { useFinance } from "@/context/finance-context"
import { getCategoryColor } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { TrendingUp, Wallet, CreditCard, Banknote, ArrowUpRight, ArrowDownLeft } from "lucide-react"

export default function Dashboard() {
  const { transactions, accounts } = useFinance()

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

  // Responsive helper: detect small screen to adjust chart labels
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
    left: 32,
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
    // Use category color if defined in utils, otherwise pick a stable color
    // from the fallback palette by hashing the category name so the same
    // category always gets the same color across renders.
    const fallbackPalette = [
      '#ef4444', // red
      '#f97316', // orange
      '#f59e0b', // amber
      '#eab308', // yellow
      '#10b981', // green
      '#06b6d4', // cyan
      '#3b82f6', // blue
      '#6366f1', // indigo
      '#8b5cf6', // violet
      '#ec4899', // pink
      '#94a3b8', // cool gray
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
        return <CreditCard className="h-5 w-5" />
      case "cash":
        return <Banknote className="h-5 w-5" />
      default:
        return <Wallet className="h-5 w-5" />
    }
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Header Section */}
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground">
          Dashboard Keuangan
        </h1>
      </div>

      {/* Summary Stats */}
      {accountBalances.length > 0 && (
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Balance Card */}
            <Card className="border shadow-sm bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Saldo</CardTitle>
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{formatCurrency(totalBalance)}</div>
                <p className="text-xs text-muted-foreground mt-2">Dari {accountBalances.length} rekening</p>
              </CardContent>
            </Card>

            {/* Total Income Card */}
            <Card className="border shadow-sm bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Pemasukan</CardTitle>
                  <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-600">{formatCurrency(totalIncome)}</div>
                <p className="text-xs text-muted-foreground mt-2">Bulan ini</p>
              </CardContent>
            </Card>

            {/* Total Expense Card */}
            <Card className="border shadow-sm bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Pengeluaran</CardTitle>
                  <ArrowUpRight className="h-5 w-5 text-rose-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-rose-600">{formatCurrency(totalExpense)}</div>
                <p className="text-xs text-muted-foreground mt-2">Bulan ini</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Accounts Grid */}
      {accountBalances.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-primary" />
              Akun-akun Anda
            </h2>
            <p className="text-muted-foreground text-sm mt-1">Kelola semua rekening dan dompet digital</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {accountBalances.map((account) => (
              <Card key={account.id} className="border shadow-sm bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-foreground">{account.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">{account.institution || account.type}</CardDescription>
                    </div>
                    <div className="p-2 rounded-lg bg-muted text-primary">
                      {getAccountIcon(account.type)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3">
                    <div className="flex items-center justify-between">
                      <dt className="text-xs text-muted-foreground font-medium">Pemasukan</dt>
                      <dd className="text-sm font-semibold text-emerald-600">{formatCurrency(account.totalIncome)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-xs text-muted-foreground font-medium">Pengeluaran</dt>
                      <dd className="text-sm font-semibold text-rose-600">{formatCurrency(account.totalExpense)}</dd>
                    </div>
                    <div className="pt-3 border-t border-border">
                      <div className="flex items-center justify-between">
                        <dt className="text-sm font-semibold text-foreground">Saldo</dt>
                        <dd className={`text-lg font-bold ${account.balance >= 0 ? "text-primary" : "text-rose-600"}`}>
                          {formatCurrency(account.balance)}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart */}
        <Card className="lg:col-span-2 border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-xl">Tren Pemasukan & Pengeluaran per Sumber</CardTitle>
                <CardDescription>Perbandingan pemasukan & pengeluaran untuk setiap akun</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  interval={0}
                  height={isMobile ? 56 : 36}
                  angle={isMobile ? -30 : 0}
                  textAnchor={isMobile ? "end" : "middle"}
                  tickMargin={10}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  tickFormatter={(value) =>
                    isMobile && typeof value === "string" && value.length > 10
                      ? `${value.slice(0, 10)}...`
                      : value
                  }
                />
                <YAxis stroke="var(--color-muted-foreground)" tickFormatter={(value) => formatCurrency(value as number)} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "8px",
                    color: "var(--color-foreground)",
                  }}
                  itemStyle={{ color: "var(--color-foreground)" }}
                  formatter={(value) => formatCurrency(value as number)}
                />
                <Bar dataKey="income" name="Pemasukan" fill="var(--color-chart-1)" radius={[8, 8, 0, 0]}>
                  {!isMobile && (
                    <LabelList dataKey="income" position="top" formatter={(value: number) => formatCurrency(value)} />
                  )}
                </Bar>
                <Bar dataKey="expense" name="Pengeluaran" fill="var(--color-chart-3)" radius={[8, 8, 0, 0]}>
                  {!isMobile && (
                    <LabelList dataKey="expense" position="top" formatter={(value: number) => formatCurrency(value)} />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Komposisi Pengeluaran</CardTitle>
            <CardDescription className="text-xs">Breakdown per kategori</CardDescription>
          </CardHeader>
          <CardContent>
            {expenseByCategory.length > 0 ? (
              <>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    // ensure very small categories get a visible arc
                    minAngle={5}
                    // add a white stroke so adjacent thin slices are separated visually
                    stroke="#ffffff"
                    strokeWidth={1}
                    dataKey="value"
                  >
                    {expenseByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={expenseSliceColors[index]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "8px",
                      color: "var(--color-foreground)",
                    }}
                    itemStyle={{ color: "var(--color-foreground)" }}
                    formatter={(value) => formatCurrency(value as number)}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend for small slices: shows color swatch, name and formatted value */}
              <div className="mt-4 flex flex-wrap gap-3">
                {expenseByCategory.map((entry, idx) => (
                  <div key={entry.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: expenseSliceColors[idx], boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)' }}
                    />
                    <span className="font-medium text-foreground">{entry.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{formatCurrency(entry.value)}</span>
                  </div>
                ))}
              </div>
              </>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
                Belum ada data pengeluaran
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="border shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-xl">Transaksi Terbaru</CardTitle>
              <CardDescription>
                {transactions.length > 5 ? "5 transaksi terakhir" : `${transactions.length} transaksi`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <div className="space-y-1">
              {transactions.slice(0, 5).map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors duration-200"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-foreground text-sm md:text-base">{transaction.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {transaction.category} • {transaction.accountName} • {transaction.date}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-bold text-sm md:text-base ${
                        transaction.type === "income" ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {transaction.type === "income" ? "+ " : "- "} {formatCurrency(transaction.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center text-muted-foreground">Belum ada transaksi</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
