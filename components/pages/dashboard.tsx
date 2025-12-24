"use client"

import { useMemo } from "react"

import { useFinance } from "@/context/finance-context"
import { getCategoryColor } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { PiggyBank } from "lucide-react"

export default function Dashboard() {
  const { transactions, accounts } = useFinance()

  const monthlyRange = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date()
      date.setMonth(date.getMonth() - (5 - index))
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      const label = date.toLocaleString("id-ID", { month: "short" })
      return { name: label, key: monthKey }
    })
  }, [])

  const monthlyTotals = useMemo(() => {
    return transactions.reduce((map, transaction) => {
      const monthKey = transaction.date.slice(0, 7)
      if (!map.has(monthKey)) {
        map.set(monthKey, { income: 0, expense: 0 })
      }
      const entry = map.get(monthKey)!
      if (transaction.type === "income") {
        entry.income += transaction.amount
      } else {
        entry.expense += transaction.amount
      }
      return map
    }, new Map<string, { income: number; expense: number }>())
  }, [transactions])

  const monthlyData = monthlyRange.map(({ name, key }) => {
    const entry = monthlyTotals.get(key)
    return {
      name,
      income: entry?.income ?? 0,
      expense: entry?.expense ?? 0,
    }
  })


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
    return expenseByCategory.map((entry) => getCategoryColor(entry.name, "expense"))
  }, [expenseByCategory])

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Ringkasan keuangan Anda</p>
      </div>

      {accountBalances.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <PiggyBank className="h-5 w-5 text-primary" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accountBalances.map((account) => (
              <Card key={account.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-foreground">{account.name}</CardTitle>
                  <CardDescription>{account.institution || account.type}</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Total pemasukan</dt>
                    <dd className="text-right font-semibold text-foreground">
                      {formatCurrency(account.totalIncome)}
                    </dd>
                    <dt className="text-muted-foreground">Total pengeluaran</dt>
                    <dd className="text-right font-semibold text-red-500">
                      {formatCurrency(account.totalExpense)}
                    </dd>
                    <dt className="text-muted-foreground">Saldo</dt>
                    <dd className={`text-right font-semibold ${account.balance >= 0 ? "text-foreground" : "text-red-500"}`}>
                      {formatCurrency(account.balance)}
                    </dd>
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tren Bulanan</CardTitle>
            <CardDescription>Perbandingan pemasukan dan pengeluaran</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData} margin={{ top: 16, right: 24, left: 32, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                  }}
                  formatter={(value) => formatCurrency(value as number)}
                />
                <Bar dataKey="income" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
                <Bar dataKey="expense" fill="var(--chart-2)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pengeluaran per Kategori</CardTitle>
            <CardDescription>Komposisi pengeluaran</CardDescription>
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
      <Card>
        <CardHeader>
          <CardTitle>Transaksi Terbaru</CardTitle>
          <CardDescription>5 transaksi terakhir Anda</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {transactions.slice(0, 5).map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between pb-4 border-b border-border last:border-0"
              >
                <div>
                  <p className="font-medium text-foreground">{transaction.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {transaction.category} • {transaction.accountName}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${transaction.type === "income" ? "text-green-500" : "text-red-500"}`}>
                    {transaction.type === "income" ? "+" : "-"} {formatCurrency(transaction.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">{transaction.date}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
