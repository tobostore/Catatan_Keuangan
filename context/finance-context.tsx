"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, useCallback } from "react"

export interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  type: "income" | "expense"
  category: string
  accountId: string
  accountName: string
}

// Pindahkan ke dalam function FinanceProvider
export interface Account {
  id: string
  name: string
  institution?: string
  type: string
  openingBalance?: number
}

interface FinanceContextType {
  transactions: Transaction[]
  accounts: Account[]
  getTotalIncome: () => number
  getTotalExpense: () => number
  getBalance: () => number
  addTransaction: (t: Transaction) => Promise<void>
  updateTransaction: (t: Transaction) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  isLoadingTransactions: boolean
  isLoadingAccounts: boolean
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined)





export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)




  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)

  // Fetch transaksi dari API saat mount
  useEffect(() => {
    setIsLoadingTransactions(true)
    fetch("/api/transactions")
      .then((res) => res.json())
      .then((data) => setTransactions(data))
      .finally(() => setIsLoadingTransactions(false))
  }, [])
  
  // Fetch akun dari API saat mount
  useEffect(() => {
    setIsLoadingAccounts(true)
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setAccounts(data))
      .finally(() => setIsLoadingAccounts(false))
  }, [])

  // Tambah transaksi
  const addTransaction = useCallback(async (t: Omit<Transaction, "id">) => {
    setIsLoadingTransactions(true)
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    })
    if (res.ok) {
      const newTrx = await res.json()
      setTransactions((prev) => [newTrx, ...prev])
    }
    setIsLoadingTransactions(false)
  }, [])

  // Update transaksi
  const updateTransaction = useCallback(async (t: Transaction) => {
    setIsLoadingTransactions(true)
    const res = await fetch(`/api/transactions/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    })
    if (res.ok) {
      const updated = await res.json()
      setTransactions((prev) => prev.map((trx) => (trx.id === t.id ? updated : trx)))
    }
    setIsLoadingTransactions(false)
  }, [])

  // Hapus transaksi
  const deleteTransaction = useCallback(async (id: string) => {
    setIsLoadingTransactions(true)
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" })
    if (res.ok) {
      setTransactions((prev) => prev.filter((trx) => trx.id !== id))
    }
    setIsLoadingTransactions(false)
  }, [])

  // Hitung total income, expense, saldo dari state
  const getTotalIncome = () => transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0)
  const getTotalExpense = () => transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0)
  const getBalance = () => getTotalIncome() - getTotalExpense()


  const value: FinanceContextType = {
    accounts,
    transactions,
    getTotalIncome,
    getTotalExpense,
    getBalance,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    isLoadingTransactions,
    isLoadingAccounts,
  }

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}

export function useFinance() {
  const context = useContext(FinanceContext)
  if (context === undefined) {
    throw new Error("useFinance must be used within a FinanceProvider")
  }
  return context
}
