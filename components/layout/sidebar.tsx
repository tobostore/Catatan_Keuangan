"use client"

import { LogOut, BarChart3, TrendingUp, Wallet } from "lucide-react"

import { useAuth } from "@/context/auth-context"

interface SidebarProps {
  currentPage: "dashboard" | "transactions" | "reports"
  setCurrentPage: (page: "dashboard" | "transactions" | "reports") => void
}

export default function Sidebar({ currentPage, setCurrentPage }: SidebarProps) {
  const { user, logout } = useAuth()
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "transactions", label: "Transaksi", icon: TrendingUp },
    { id: "reports", label: "Laporan", icon: Wallet },
  ]

  return (
    <aside className="w-64 bg-card border-r border-border p-6 flex flex-col">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary">Finance Manager</h1>
        <p className="text-sm text-muted-foreground mt-1">Kelola keuangan Anda</p>
      </div>

      <nav className="flex-1 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-6 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">Masuk sebagai</p>
        <p className="text-foreground font-semibold">{user?.name || user?.email || "User"}</p>
        <button
          onClick={() => logout()}
          className="mt-3 flex items-center gap-2 text-sm text-destructive hover:text-destructive/80"
        >
          <LogOut className="w-4 h-4" /> Keluar
        </button>
      </div>
    </aside>
  )
}
