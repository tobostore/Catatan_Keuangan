"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { useFinance } from "@/context/finance-context"
import { getCategoryColor } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2, Plus, Pencil, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react"

type TransactionsProps = {
  focusedAccountId?: string
}

export default function Transactions({ focusedAccountId = "" }: TransactionsProps) {
  const {
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    isLoadingTransactions,
    accounts,
    isLoadingAccounts,
    getTotalIncome,
    getTotalExpense,
    getBalance,
  } = useFinance()
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [aiBadgeField, setAiBadgeField] = useState<{ kategori: boolean; tipe: boolean }>({
    kategori: false,
    tipe: false,
  })
  const [aiConfidence, setAiConfidence] = useState<number | null>(null)
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
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all")
  const [filterAccountId, setFilterAccountId] = useState("")
  const [filterQuery, setFilterQuery] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const totalIncome = getTotalIncome()
  const totalExpense = getTotalExpense()
  const balance = getBalance()

  const formatAmountDisplay = (value: string) => {
    if (!value) return ""
    const digits = value.replace(/\D/g, "")
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  }

  const handleAmountChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "")
    setFormData((prev) => ({ ...prev, amount: digitsOnly }))
  }

  const resolveCategoryFromDescription = async (description: string) => {
    const sanitizedDescription = description.trim()
    if (sanitizedDescription.length < 3) {
      return null
    }

    try {
      const res = await fetch("/api/ai/auto-kategori", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keterangan: sanitizedDescription }),
      })

      if (!res.ok) {
        return null
      }

      const json = (await res.json()) as { kategori?: string | null; confidence?: number }
      const inferredKategori = typeof json.kategori === "string" ? json.kategori.trim() : ""

      if (!inferredKategori) {
        return null
      }

      setAiConfidence(typeof json.confidence === "number" ? Math.max(0, Math.min(1, json.confidence)) : null)
      setAiBadgeField((prev) => ({ ...prev, kategori: true }))
      return inferredKategori
    } catch (error) {
      console.error("Resolve kategori on submit failed", error)
      return null
    }
  }

  const getAiBadgeToneClass = (confidence: number | null) => {
    if (confidence === null) return "bg-elevated text-secondary"
    if (confidence > 0.75) return "bg-green-dim text-green"
    if (confidence >= 0.45) return "bg-yellow-900/40 text-yellow-300"
    return "bg-elevated text-secondary"
  }

  const resetForm = () => {
    setFormData(createEmptyForm(accounts[0]?.id ? String(accounts[0].id) : ""))
    setEditingId(null)
    setAiBadgeField({ kategori: false, tipe: false })
    setAiConfidence(null)
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

  useEffect(() => {
    if (!focusedAccountId) {
      return
    }
    setShowForm(false)
    setFilterAccountId(String(focusedAccountId))
    setFilterType("all")
    setFilterQuery("")
    setFilterDateFrom("")
    setFilterDateTo("")
  }, [focusedAccountId])

  useEffect(() => {
    if (!showForm || editingId) return

    const description = formData.description.trim()
    const canAutoFillCategory = formData.category.trim().length === 0 || aiBadgeField.kategori

    if (description.length < 3 || !canAutoFillCategory) {
      setAiConfidence(null)
      setAiBadgeField({ kategori: false, tipe: false })
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/ai/auto-kategori", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keterangan: description }),
          signal: controller.signal,
        })

        if (!res.ok) {
          return
        }

        const json = (await res.json()) as {
          kategori?: string | null
          confidence?: number
          alasan?: string
        }

        setAiConfidence(typeof json.confidence === "number" ? Math.max(0, Math.min(1, json.confidence)) : null)
        setFormData((prev) => ({
          ...prev,
          category: typeof json.kategori === "string" ? json.kategori : prev.category,
        }))
        setAiBadgeField({ kategori: true, tipe: false })
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Auto kategori failed", error)
        }
      }
    }, 800)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [formData.description, formData.category, aiBadgeField.kategori, showForm, editingId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.amount || !formData.description) {
      alert("Jumlah dan deskripsi wajib diisi")
      return
    }

    if (!formData.accountId) {
      alert("Silakan pilih sumber dana")
      return
    }

    setIsSubmitting(true)
    try {
      let resolvedCategory = formData.category.trim()
      if (!resolvedCategory) {
        resolvedCategory = (await resolveCategoryFromDescription(formData.description)) ?? "Lainnya"
        setFormData((prev) => ({ ...prev, category: resolvedCategory }))
      }

      const payload = {
        type: formData.type,
        category: resolvedCategory,
        amount: Number.parseFloat(formData.amount),
        description: formData.description,
        date: formData.date,
        accountId: Number(formData.accountId),
      }

      const account = accounts.find(acc => String(acc.id) === String(payload.accountId));
      const accountName = account ? account.name : "";
      if (editingId) {
        await updateTransaction({ ...payload, id: editingId, accountName, accountId: String(payload.accountId) });
      } else {
        await addTransaction({ ...payload, id: "", accountName, accountId: String(payload.accountId) });
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
    setAiBadgeField({ kategori: false, tipe: false })
    setAiConfidence(null)
    setEditingId(transaction.id)
    setShowForm(true)
  }

  const handleCancelForm = () => {
    resetForm()
    setAiBadgeField({ kategori: false, tipe: false })
    setAiConfidence(null)
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

  const filteredTransactions = useMemo(() => {
    const query = filterQuery.trim().toLowerCase()
    return transactions.filter((transaction) => {
      if (filterType !== "all" && transaction.type !== filterType) {
        return false
      }
      if (filterAccountId && String(transaction.accountId) !== filterAccountId) {
        return false
      }
      if (filterDateFrom && transaction.date < filterDateFrom) {
        return false
      }
      if (filterDateTo && transaction.date > filterDateTo) {
        return false
      }
      if (query) {
        const haystack = `${transaction.description} ${transaction.category} ${transaction.accountName}`.toLowerCase()
        if (!haystack.includes(query)) {
          return false
        }
      }
      return true
    })
  }, [transactions, filterType, filterAccountId, filterDateFrom, filterDateTo, filterQuery])

  const hasActiveFilters =
    filterType !== "all" || Boolean(filterAccountId || filterQuery || filterDateFrom || filterDateTo)

  const resetFilters = () => {
    setFilterType("all")
    setFilterAccountId("")
    setFilterQuery("")
    setFilterDateFrom("")
    setFilterDateTo("")
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="kasflow-transactions space-y-6 sm:space-y-7 pb-24">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          <h1 className="kasflow-page-title text-2xl md:text-[28px] font-semibold text-primary mb-1">
            Transaksi
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            Kelola semua transaksi keuangan Anda
          </p>
        </div>
        <Button onClick={toggleForm} className="hidden sm:inline-flex gap-2 self-start bg-gradient-to-r from-[#00D4AA] to-[#4D9FFF] text-[#05131f] hover:opacity-90">
          <Plus className="w-4 h-4" />
          {showForm ? "Tutup Form" : "Tambah Transaksi"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card gradient-border-card p-4 sm:p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs uppercase tracking-[0.15em] text-muted font-semibold">Saldo Total</span>
            <Wallet className="h-4 w-4 text-[#4D9FFF]" />
          </div>
          <p className="text-2xl font-semibold text-primary">{formatCurrency(balance)}</p>
        </div>
        <div className="glass-card gradient-border-card p-4 sm:p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs uppercase tracking-[0.15em] text-muted font-semibold">Pemasukan</span>
            <ArrowDownRight className="h-4 w-4 text-green" />
          </div>
          <p className="text-2xl font-semibold text-green">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="glass-card gradient-border-card p-4 sm:p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs uppercase tracking-[0.15em] text-muted font-semibold">Pengeluaran</span>
            <ArrowUpRight className="h-4 w-4 text-red" />
          </div>
          <p className="text-2xl font-semibold text-red">{formatCurrency(totalExpense)}</p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="glass-card rounded-[14px] p-4 sm:p-6 animate-slide-in">
          <h2 className="text-sm font-semibold text-primary mb-6">{editingId ? "Edit Transaksi" : "Tambah Transaksi Baru"}</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Tipe</label>
                  {aiBadgeField.tipe ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAiBadgeToneClass(aiConfidence)}`}
                    >
                      AI
                    </span>
                  ) : null}
                </div>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    {
                      setAiBadgeField((prev) => ({ ...prev, tipe: false }))
                      setFormData({ ...formData, type: e.target.value as "income" | "expense", category: "" })
                    }
                  }
                  className="w-full px-3 py-2.5 border border-border rounded-lg bg-elevated text-foreground text-sm"
                >
                  <option value="expense">Pengeluaran</option>
                  <option value="income">Pemasukan</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Sumber Dana</label>
                <select
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-border rounded-lg bg-elevated text-foreground text-sm"
                  disabled={isLoadingAccounts || accounts.length === 0}
                >
                  <option value="">{isLoadingAccounts ? "Memuat akun..." : "Pilih sumber dana"}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Kategori</label>
                {aiBadgeField.kategori ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAiBadgeToneClass(aiConfidence)}`}
                  >
                    AI
                  </span>
                ) : null}
              </div>
              <Input
                type="text"
                placeholder="Masukkan kategori"
                value={formData.category}
                onChange={(e) => {
                  setAiBadgeField((prev) => ({ ...prev, kategori: false }))
                  setFormData({ ...formData, category: e.target.value })
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Jumlah (IDR)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="Masukkan jumlah"
                  value={formatAmountDisplay(formData.amount)}
                  onChange={(e) => handleAmountChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Tanggal</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Deskripsi</label>
              <Input
                type="text"
                placeholder="Deskripsi transaksi"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Transaksi"}
              </Button>
              <Button type="button" variant="outline" onClick={handleCancelForm} className="flex-1">
                Batal
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Transactions List */}
      <div className="glass-card rounded-[14px]">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10">
          <h2 className="text-sm font-semibold text-primary mb-1">Daftar Transaksi</h2>
          <p className="text-xs text-secondary">
            {isLoadingTransactions
              ? "Sedang memuat data..."
              : filteredTransactions.length === transactions.length
                ? `Total ${transactions.length} transaksi`
                : `${filteredTransactions.length} dari ${transactions.length} transaksi`}
          </p>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {/* Filters */}
          <div className="kasflow-filter-bar space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="kasflow-filter-grid grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Cari cepat</label>
                <Input
                  placeholder="Deskripsi, kategori..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className={filterQuery ? "rounded-full border-[#4D9FFF]/45 bg-[#4D9FFF]/10" : "rounded-full"}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Tipe</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                  className={`w-full px-3 py-2 border rounded-full text-foreground text-sm ${
                    filterType !== "all"
                      ? "border-[#00D4AA]/45 bg-[#00D4AA]/10"
                      : "border-white/10 bg-[rgba(255,255,255,0.03)]"
                  }`}
                >
                  <option value="all">Semua tipe</option>
                  <option value="expense">Pengeluaran</option>
                  <option value="income">Pemasukan</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Sumber</label>
                <select
                  value={filterAccountId}
                  onChange={(e) => setFilterAccountId(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-full text-foreground text-sm ${
                    filterAccountId
                      ? "border-[#4D9FFF]/45 bg-[#4D9FFF]/10"
                      : "border-white/10 bg-[rgba(255,255,255,0.03)]"
                  }`}
                  disabled={isLoadingAccounts || accounts.length === 0}
                >
                  <option value="">Semua sumber</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="kasflow-date-range-grid lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Dari</label>
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className={filterDateFrom ? "rounded-full border-[#4D9FFF]/45 bg-[#4D9FFF]/10" : "rounded-full"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase letter-spacing-0.5 text-muted font-semibold">Sampai</label>
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className={filterDateTo ? "rounded-full border-[#4D9FFF]/45 bg-[#4D9FFF]/10" : "rounded-full"}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
              <p className="text-xs text-secondary">
                {hasActiveFilters ? "Filter aktif diterapkan" : "Menampilkan semua transaksi"}
              </p>
              <Button type="button" variant="outline" onClick={resetFilters} disabled={!hasActiveFilters} className="sm:w-auto">
                Reset Filter
              </Button>
            </div>
          </div>

          {/* Transactions */}
          <div className="space-y-2 divide-y divide-border">
            {isLoadingTransactions ? (
              <p className="text-center text-secondary py-8">Memuat data transaksi...</p>
            ) : filteredTransactions.length === 0 ? (
              <p className="text-center text-secondary py-8">
                {transactions.length === 0 ? "Belum ada transaksi" : "Tidak ada transaksi sesuai filter"}
              </p>
            ) : (
              filteredTransactions.map((transaction, index) => (
                <div
                  key={transaction.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 transition-colors px-3 rounded-lg border-l-2 animate-slide-in"
                  style={{
                    borderLeftColor: getCategoryColor(transaction.category, transaction.type),
                    backgroundColor: index % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                  }}
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-sm text-primary flex-1 min-w-0 break-words">{transaction.description}</p>
                      <p
                        className={`font-semibold text-sm text-right whitespace-nowrap ${
                          transaction.type === "income" ? "text-green" : "text-red"
                        }`}
                      >
                        {transaction.type === "income" ? "+" : "-"} {formatCurrency(transaction.amount)}
                      </p>
                    </div>
                    <p className="text-[11px] text-secondary">
                      {transaction.category} • {transaction.date} • {transaction.accountName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(transaction)}
                      className="kasflow-icon-btn text-secondary hover:text-primary hover:bg-white/10 p-1.5 rounded-lg"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(transaction.id)}
                      className="kasflow-icon-btn text-red hover:text-red hover:bg-red-dim p-1.5 rounded-lg disabled:opacity-50"
                      disabled={deletingId === transaction.id}
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Button
        onClick={toggleForm}
        className="sm:hidden fixed bottom-5 right-4 z-30 rounded-full h-12 w-12 p-0 bg-gradient-to-r from-[#00D4AA] to-[#4D9FFF] text-[#061220] shadow-[0_0_20px_rgba(0,212,170,0.45)]"
      >
        <Plus className="h-5 w-5" />
        <span className="sr-only">Tambah Transaksi</span>
      </Button>
    </div>
  )
}
