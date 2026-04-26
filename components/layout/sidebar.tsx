"use client"

import { LogOut, BarChart3, TrendingUp, Wallet, Settings, User, Sparkles } from "lucide-react"
import { useAuth } from "@/context/auth-context"
import { useEffect, useState } from "react"

interface SidebarProps {
  currentPage: "dashboard" | "transactions" | "reports"
  setCurrentPage: (page: "dashboard" | "transactions" | "reports") => void
  mobile?: boolean
}

export default function Sidebar({ currentPage, setCurrentPage, mobile = false }: SidebarProps) {
  const { user, logout } = useAuth()
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    if (mobile) {
      setIsCompact(false)
      return
    }

    const checkCompact = () => setIsCompact(window.innerWidth < 1280)
    checkCompact()
    window.addEventListener("resize", checkCompact)

    return () => window.removeEventListener("resize", checkCompact)
  }, [mobile])

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "transactions", label: "Transaksi", icon: TrendingUp },
    { id: "reports", label: "Laporan", icon: Wallet },
  ]

  const bottomMenuItems = [
    { id: "settings", label: "Pengaturan", icon: Settings },
    { id: "profile", label: "Profil", icon: User },
  ]

  return (
    <aside
      className={`h-screen flex flex-col border-r border-white/10 bg-[rgba(17,24,39,0.82)] backdrop-blur-xl overflow-y-auto ${
        isCompact ? "w-[88px]" : "w-[240px]"
      }`}
    >
      <div className="px-4 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00D4AA] to-[#4D9FFF] flex items-center justify-center shadow-[0_0_16px_rgba(0,212,170,0.24)]">
            <Sparkles className="h-4 w-4 text-[#0D1117]" />
          </div>
          <div className={`${isCompact ? "hidden" : "block"}`}>
            <p className="text-xs tracking-[0.2em] uppercase text-muted font-semibold">KasFlow</p>
            <p className="text-sm text-primary font-semibold">Personal Finance</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id as any)}
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 ${
                isActive
                  ? "bg-accent-dim border-[#00D4AA]/40 text-[#00D4AA] shadow-[0_0_14px_rgba(0,212,170,0.2)]"
                  : "text-secondary border-transparent hover:text-primary hover:border-[#00D4AA]/30 hover:bg-white/5 hover:shadow-[0_0_12px_rgba(0,212,170,0.2)]"
              }`}
              title={isCompact ? item.label : undefined}
            >
              <span
                className={`absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r-full transition-all ${
                  isActive ? "bg-[#00D4AA] shadow-[0_0_12px_rgba(0,212,170,0.85)]" : "opacity-0"
                }`}
              />
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className={`${isCompact ? "hidden" : "inline"}`}>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 space-y-3">
        <div className={`px-3 py-3 rounded-xl bg-white/5 border border-white/10 ${isCompact ? "flex justify-center" : ""}`}>
          <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-[#4D9FFF] to-[#00D4AA] text-[#0D1117] font-semibold flex items-center justify-center">
            {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
            <span className="absolute right-0.5 bottom-0.5 h-2.5 w-2.5 rounded-full bg-[#00D4AA] border border-[#0F1623]" />
          </div>
          <div className={`${isCompact ? "hidden" : "ml-3 min-w-0"}`}>
            <p className="text-xs text-muted uppercase tracking-[0.2em]">Akun</p>
            <p className="text-sm text-primary font-medium mt-1 truncate">{user?.name || user?.email || "User"}</p>
            <p className="text-xs text-secondary truncate">Online</p>
          </div>
        </div>

        <div className="space-y-1">
          {bottomMenuItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent text-sm font-medium text-secondary hover:text-primary hover:bg-white/5 hover:border-[#00D4AA]/25"
                title={isCompact ? item.label : undefined}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className={`${isCompact ? "hidden" : "inline"}`}>{item.label}</span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent text-sm font-medium text-red hover:bg-red-dim hover:border-red/50"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className={`${isCompact ? "hidden" : "inline"}`}>Keluar</span>
        </button>
      </div>
    </aside>
  )
}
