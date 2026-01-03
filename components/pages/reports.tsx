"use client"

import { useFinance } from "@/context/finance-context"
import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { getCategoryColor } from "@/lib/utils"

export default function Reports() {
  const { transactions, getTotalIncome, getTotalExpense, getBalance, accounts } = useFinance()

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Laporan Analisis</h1>
        <p className="text-muted-foreground mt-1">Analisis detail keuangan Anda</p>
      </div>

      

      {/* Summary Per Sumber (akun) */}
      {sourceSummaries.length > 0 && (
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sourceSummaries.map((s) => (
              <Card key={s.id} className="p-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold">{s.name}</CardTitle>
                  <CardDescription className="text-sm">{s.count} transaksi</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Pemasukan</div>
                      <div className="text-2xl font-bold text-emerald-500">{formatCurrency(s.income)}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Pengeluaran</div>
                      <div className="text-2xl font-bold text-rose-500">{formatCurrency(s.expense)}</div>
                    </div>
                    <div className="space-y-1 sm:text-right">
                      <div className="text-sm text-muted-foreground">Rasio Saving</div>
                      <div className="text-xl font-bold text-blue-400">
                        {s.income === 0 ? '0%' : `${calculatePercentage(s.income - s.expense, s.income)}%`}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {incomeByCategory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pemasukan per Kategori</CardTitle>
              <CardDescription>Komposisi sumber pemasukan</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={incomeByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    minAngle={5}
                    stroke="var(--color-card)"
                    strokeWidth={1}
                    dataKey="value"
                  >
                    {incomeByCategory.map((entry, index) => (
                      <Cell key={`cell-income-${index}`} fill={incomeCategoryColors[index]} />
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
              <div className="mt-4 flex flex-wrap gap-2">
                {incomeByCategory.map((entry, idx) => (
                  <div
                    key={`income-legend-${entry.name}`}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-foreground"
                  >
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: incomeCategoryColors[idx], boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)" }}
                    />
                    <span className="font-medium">{entry.name}</span>
                    <span className="text-xs opacity-80">{formatCurrency(entry.value)}</span>
                    <span className="text-xs opacity-80">({calculatePercentage(entry.value, income)}%)</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {expenseByCategory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pengeluaran per Kategori</CardTitle>
              <CardDescription>Komposisi pengeluaran Anda</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    minAngle={5}
                    stroke="var(--color-card)"
                    strokeWidth={1}
                    dataKey="value"
                  >
                    {expenseByCategory.map((entry, index) => (
                      <Cell key={`cell-expense-${index}`} fill={expenseCategoryColors[index]} />
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
              <div className="mt-4 flex flex-wrap gap-2">
                {expenseByCategory.map((entry, idx) => (
                  <div
                    key={`expense-legend-${entry.name}`}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-foreground"
                  >
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: expenseCategoryColors[idx], boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)" }}
                    />
                    <span className="font-medium">{entry.name}</span>
                    <span className="text-xs opacity-80">{formatCurrency(entry.value)}</span>
                    <span className="text-xs opacity-80">({calculatePercentage(entry.value, expense)}%)</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Kategori</CardTitle>
          <CardDescription>Detil pengeluaran dan pemasukan per kategori</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {expenseByCategory.length > 0 && (
              <div>
                <h3 className="font-semibold text-foreground mb-3">Pengeluaran</h3>
                <div className="space-y-2">
                  {expenseByCategory.map((item) => (
                    <div key={item.name} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <span className="text-foreground font-medium">{item.name}</span>
                      <div className="text-right">
                        <p className="font-semibold text-red-500">{formatCurrency(item.value)}</p>
                        <p className="text-xs text-muted-foreground">
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
                <h3 className="font-semibold text-foreground mb-3">Pemasukan</h3>
                <div className="space-y-2">
                  {incomeByCategory.map((item) => (
                    <div key={item.name} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <span className="text-foreground font-medium">{item.name}</span>
                      <div className="text-right">
                        <p className="font-semibold text-green-500">{formatCurrency(item.value)}</p>
                        <p className="text-xs text-muted-foreground">
                          {calculatePercentage(item.value, income)}% dari total
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
