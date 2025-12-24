"use client"

import type React from "react"
import { createContext, useContext, useState, useCallback, useEffect } from "react"

export interface Transaction {
  id: string
  type: "income" | "expense"
  category: string
  amount: number
  description: string
  date: string
  accountId: number
  accountName: string
}

export interface Account {
  id: number
  name: string
  type: string
  institution?: string | null
  accountNumber?: string | null
  openingBalance: number
}

type TransactionPayload = {
  type: Transaction["type"]
  accountId: number
  category: string
  amount: number
  description: string
  date: string
}

interface FinanceContextType {
  transactions: Transaction[]
  accounts: Account[]
  addTransaction: (transaction: TransactionPayload) => Promise<void>
  updateTransaction: (id: string, transaction: TransactionPayload) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  getTotalIncome: () => number
  getTotalExpense: () => number
  getBalance: () => number
  getTransactionsByMonth: (month: string) => Transaction[]
  isLoadingTransactions: boolean
  isLoadingAccounts: boolean
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined)

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)

  useEffect(() => {
    let isMounted = true

    const fetchTransactions = async () => {
      try {
        const response = await fetch("/api/transactions")
        if (!response.ok) {
          throw new Error("Failed to fetch transactions")
        }
        const data: Transaction[] = await response.json()
        if (isMounted) {
          setTransactions(data)
        }
      } catch (error) {
        console.error("Error fetching transactions", error)
      } finally {
        if (isMounted) {
          setIsLoadingTransactions(false)
        }
      }
    }

    fetchTransactions()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchAccounts = async () => {
      try {
        const response = await fetch("/api/accounts")
        if (!response.ok) {
          throw new Error("Failed to fetch accounts")
        }
        const data: Account[] = await response.json()
        if (isMounted) {
          setAccounts(data)
        }
      } catch (error) {
        console.error("Error fetching accounts", error)
      } finally {
        if (isMounted) {
          setIsLoadingAccounts(false)
        }
      }
    }

    fetchAccounts()

    return () => {
      isMounted = false
    }
  }, [])

  const addTransaction = useCallback(async (transaction: TransactionPayload) => {
    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transaction),
    })

    if (!response.ok) {
      throw new Error("Failed to save transaction")
    }

    const created: Transaction = await response.json()
    setTransactions((prev) => [created, ...prev])
  }, [])

  const updateTransaction = useCallback(async (id: string, transaction: TransactionPayload) => {
    const response = await fetch(`/api/transactions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transaction),
    })

    if (!response.ok) {
      throw new Error("Failed to update transaction")
    }

    const updated: Transaction = await response.json()
    setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)))
  }, [])

  const deleteTransaction = useCallback(async (id: string) => {
    const response = await fetch(`/api/transactions/${id}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      throw new Error("Failed to delete transaction")
    }

    setTransactions((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const getTotalIncome = useCallback(() => {
    return transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0)
  }, [transactions])

  const getTotalExpense = useCallback(() => {
    return transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0)
  }, [transactions])

  const getBalance = useCallback(() => {
    const base = accounts.reduce((sum, account) => sum + (account.openingBalance || 0), 0)
    const net = transactions.reduce((sum, transaction) => {
      return sum + (transaction.type === "income" ? transaction.amount : -transaction.amount)
    }, 0)
    return base + net
  }, [accounts, transactions])

  const getTransactionsByMonth = useCallback(
    (month: string) => {
      return transactions.filter((t) => t.date.startsWith(month))
    },
    [transactions],
  )

  return (
    <FinanceContext.Provider
      value={{
        transactions,
        accounts,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        getTotalIncome,
        getTotalExpense,
        getBalance,
        getTransactionsByMonth,
        isLoadingTransactions,
        isLoadingAccounts,
      }}
    >
      {children}
    </FinanceContext.Provider>
  )
}

export function useFinance() {
  const context = useContext(FinanceContext)
  if (context === undefined) {
    throw new Error("useFinance must be used within FinanceProvider")
  }
  return context
}
