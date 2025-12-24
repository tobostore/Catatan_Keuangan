"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useFinance } from "@/context/finance-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Trash2, Plus, Pencil } from "lucide-react"

export default function Transactions() {
  const {
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    isLoadingTransactions,
    accounts,
    isLoadingAccounts,
  } = useFinance()
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const createEmptyForm = (accountId = "") => ({
    type: "expense" as "income" | "expense",
    accountId,
    category: "",
    amount: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
  })
  const defaultAccountId = accounts[0]?.id ? String(accounts[0].id) : ""
  const [formData, setFormData] = useState(() => createEmptyForm(defaultAccountId))

  const formatAmountDisplay = (value: string) => {
    if (!value) return ""
    const digits = value.replace(/\D/g, "")
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  }

  const handleAmountChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "")
    setFormData((prev) => ({ ...prev, amount: digitsOnly }))
  }

  const resetForm = () => {
    setFormData(createEmptyForm(accounts[0]?.id ? String(accounts[0].id) : ""))
    setEditingId(null)
  }

  const toggleForm = () => {
    if (showForm) {
      resetForm()
      setShowForm(false)
    } else {
      resetForm()
      setShowForm(true)
    }
  }

  useEffect(() => {
    if (!accounts.length) {
      return
    }
    setFormData((prev) => {
      if (prev.accountId) {
        return prev
      }
      return { ...prev, accountId: String(accounts[0].id) }
    })
  }, [accounts])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.category || !formData.amount || !formData.description) {
      alert("Silakan isi semua field")
      return
    }

    if (!formData.accountId) {
      alert("Silakan pilih sumber dana")
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        type: formData.type,
        category: formData.category,
        amount: Number.parseFloat(formData.amount),
        description: formData.description,
        date: formData.date,
        accountId: Number(formData.accountId),
      }

      if (editingId) {
        await updateTransaction(editingId, payload)
      } else {
        await addTransaction(payload)
      }

      resetForm()
      setShowForm(false)
    } catch (error) {
      console.error("Failed to save transaction", error)
      alert("Gagal menyimpan transaksi")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (transaction: (typeof transactions)[number]) => {
    setFormData({
      type: transaction.type,
      accountId: transaction.accountId.toString(),
      category: transaction.category,
      amount: transaction.amount.toString(),
      description: transaction.description,
      date: transaction.date,
    })
    setEditingId(transaction.id)
    setShowForm(true)
  }

  const handleCancelForm = () => {
    resetForm()
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteTransaction(id)
    } catch (error) {
      console.error("Failed to delete transaction", error)
      alert("Gagal menghapus transaksi")
    } finally {
      setDeletingId(null)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Transaksi</h1>
          <p className="text-muted-foreground mt-1">Kelola semua transaksi Anda</p>
        </div>
        <Button onClick={toggleForm} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          {showForm ? "Tutup Form" : "Tambah Transaksi"}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit Transaksi" : "Tambah Transaksi Baru"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipe</label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value as "income" | "expense", category: "" })
                    }
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                  >
                    <option value="expense">Pengeluaran</option>
                    <option value="income">Pemasukan</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Sumber Dana</label>
                  <select
                    value={formData.accountId}
                    onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                    disabled={isLoadingAccounts || accounts.length === 0}
                  >
                    <option value="">{isLoadingAccounts ? "Memuat akun..." : "Pilih sumber dana"}</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  {!isLoadingAccounts && accounts.length === 0 && (
                    <p className="text-xs text-destructive">Tambah akun terlebih dahulu di database Anda.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Kategori</label>
                <Input
                  type="text"
                  placeholder="Masukkan kategori"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Jumlah (IDR)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="Masukkan jumlah"
                  value={formatAmountDisplay(formData.amount)}
                  onChange={(e) => handleAmountChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Deskripsi</label>
                <Input
                  type="text"
                  placeholder="Deskripsi transaksi"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tanggal</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Transaksi"}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancelForm} className="flex-1">
                  Batal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Transactions List */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Transaksi</CardTitle>
          <CardDescription>
            {isLoadingTransactions ? "Sedang memuat data..." : `Total ${transactions.length} transaksi`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {isLoadingTransactions ? (
              <p className="text-center text-muted-foreground py-8">Memuat data transaksi...</p>
            ) : transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Belum ada transaksi</p>
            ) : (
              transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between p-4 border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{transaction.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.category} • {transaction.accountName} • {transaction.date}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 justify-between md:justify-end flex-wrap">
                    <p
                      className={`font-semibold text-lg text-right ${
                        transaction.type === "income" ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {transaction.type === "income" ? "+" : "-"} {formatCurrency(transaction.amount)}
                    </p>
                    <button
                      onClick={() => handleEdit(transaction)}
                      className="text-muted-foreground hover:bg-muted p-2 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(transaction.id)}
                      className="text-destructive hover:bg-destructive/10 p-2 rounded-lg transition-colors disabled:opacity-50"
                      disabled={deletingId === transaction.id}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
