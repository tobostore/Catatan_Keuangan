"use client"

import { useFinance } from "@/context/finance-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { getCategoryColor } from "@/lib/utils"

export default function Reports() {
  const { transactions, getTotalIncome, getTotalExpense, getBalance } = useFinance()

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

  const incomeCategoryColors = incomeByCategory.map((entry) => getCategoryColor(entry.name, "income"))
  const expenseCategoryColors = expenseByCategory.map((entry) => getCategoryColor(entry.name, "expense"))

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value)
  }

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

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Pemasukan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{formatCurrency(income)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {transactions.filter((t) => t.type === "income").length} transaksi
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Pengeluaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{formatCurrency(expense)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {transactions.filter((t) => t.type === "expense").length} transaksi
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rasio Saving</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {income === 0 ? "0" : calculatePercentage(balance, income)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Dari total pemasukan</p>
          </CardContent>
        </Card>
      </div>

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
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {incomeByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={incomeCategoryColors[index]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                    }}
                    formatter={(value) => formatCurrency(value as number)}
                  />
                </PieChart>
              </ResponsiveContainer>
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
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {expenseByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={expenseCategoryColors[index]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                    }}
                    formatter={(value) => formatCurrency(value as number)}
                  />
                </PieChart>
              </ResponsiveContainer>
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
