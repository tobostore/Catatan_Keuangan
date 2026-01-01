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
    bottom: isMobile ? 48 : 0,
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
    // Try to use category colors from getCategoryColor, but if many categories are
    // missing mapping or produce duplicates, fall back to a vibrant palette.
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

    const used = new Set<string>()
    let fallbackIndex = 0

    return expenseByCategory.map((entry) => {
      const color = getCategoryColor(entry.name, 'expense')
      // default gray in utils is '#6b7280'
      if (!color || color === '#6b7280' || used.has(color)) {
        // pick next unused color from palette
        let pick = fallbackPalette[fallbackIndex % fallbackPalette.length]
        while (used.has(pick)) {
          fallbackIndex++
          pick = fallbackPalette[fallbackIndex % fallbackPalette.length]
        }
        used.add(pick)
        fallbackIndex++
        return pick
      }

      used.add(color)
      return color
    })
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
    <div className="space-y-8 pb-8">
      {/* Header Section */}
      <div className="animate-slide-up">
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Dashboard Keuangan
        </h1>
      </div>

      {/* Summary Stats */}
      {accountBalances.length > 0 && (
        <section className="animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Balance Card */}
            <Card className="relative overflow-hidden border-0 shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10" />
              <CardHeader className="pb-2 relative z-10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Saldo</CardTitle>
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-bold text-foreground">{formatCurrency(totalBalance)}</div>
                <p className="text-xs text-muted-foreground mt-2">Dari {accountBalances.length} rekening</p>
              </CardContent>
            </Card>

            {/* Total Income Card */}
            <Card className="relative overflow-hidden border-0 shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-100/20 to-emerald-50/10" />
              <CardHeader className="pb-2 relative z-10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Pemasukan</CardTitle>
                  <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-bold text-emerald-600">{formatCurrency(totalIncome)}</div>
                <p className="text-xs text-muted-foreground mt-2">Bulan ini</p>
              </CardContent>
            </Card>

            {/* Total Expense Card */}
            <Card className="relative overflow-hidden border-0 shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-100/20 to-rose-50/10" />
              <CardHeader className="pb-2 relative z-10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Pengeluaran</CardTitle>
                  <ArrowUpRight className="h-5 w-5 text-rose-600" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-bold text-rose-600">{formatCurrency(totalExpense)}</div>
                <p className="text-xs text-muted-foreground mt-2">Bulan ini</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Accounts Grid */}
      {accountBalances.length > 0 && (
        <section className="space-y-4 animate-slide-up">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-primary" />
              Akun-akun Anda
            </h2>
            <p className="text-muted-foreground text-sm mt-1">Kelola semua rekening dan dompet digital</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {accountBalances.map((account, idx) => (
              <Card
                key={account.id}
                className="relative overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105"
                style={{
                  animation: `slideUp 0.5s ease-out ${idx * 0.1}s both`,
                }}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${
                    idx % 3 === 0
                      ? "from-blue-50/40 to-cyan-50/40"
                      : idx % 3 === 1
                        ? "from-emerald-50/40 to-teal-50/40"
                        : "from-indigo-50/40 to-purple-50/40"
                  }`}
                />
                <CardHeader className="pb-3 relative z-10">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-foreground">{account.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">{account.institution || account.type}</CardDescription>
                    </div>
                    <div
                      className={`p-2 rounded-lg ${
                        idx % 3 === 0
                          ? "bg-blue-100/60 text-blue-600"
                          : idx % 3 === 1
                            ? "bg-emerald-100/60 text-emerald-600"
                            : "bg-indigo-100/60 text-indigo-600"
                      }`}
                    >
                      {getAccountIcon(account.type)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
        {/* Bar Chart */}
        <Card className="lg:col-span-2 border-0 shadow-lg">
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
                  tick={{ fontSize: isMobile ? 10 : 12, transform: isMobile ? 'rotate(-30)' : undefined, textAnchor: isMobile ? 'end' : 'middle' }}
                  tickFormatter={(value) => (isMobile && typeof value === 'string' && value.length > 10 ? `${value.slice(0, 10)}...` : value)}
                />
                <YAxis stroke="var(--color-muted-foreground)" tickFormatter={(value) => formatCurrency(value as number)} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
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
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Komposisi Pengeluaran</CardTitle>
            <CardDescription className="text-xs">Breakdown per kategori</CardDescription>
          </CardHeader>
          <CardContent>
            {expenseByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {expenseByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={expenseSliceColors[index]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => formatCurrency(value as number)}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
                Belum ada data pengeluaran
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="border-0 shadow-lg animate-fade-in">
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
              {transactions.slice(0, 5).map((transaction, idx) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors duration-200"
                  style={{
                    animation: `slideUp 0.4s ease-out ${idx * 0.05}s both`,
                  }}
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
