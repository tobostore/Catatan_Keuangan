"use client"

import { useState } from "react"
import { useEffect } from "react"
import { Menu, X } from "lucide-react"

import Sidebar from "@/components/layout/sidebar"
import Dashboard from "@/components/pages/dashboard"
import Transactions from "@/components/pages/transactions"
import Reports from "@/components/pages/reports"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet"

export default function MainApp() {
  const [currentPage, setCurrentPage] = useState<"dashboard" | "transactions" | "reports">("dashboard")
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [focusedAccountId, setFocusedAccountId] = useState("")

  const handleNavigate = (page: "dashboard" | "transactions" | "reports") => {
    setCurrentPage(page)
    setIsMobileNavOpen(false)
    if (page !== "transactions") {
      setFocusedAccountId("")
    }
  }

  useEffect(() => {
    const handleOpenTransactions = (event: Event) => {
      const custom = event as CustomEvent<{ accountId?: string }>
      const accountId = String(custom.detail?.accountId ?? "")
      setFocusedAccountId(accountId)
      setCurrentPage("transactions")
      setIsMobileNavOpen(false)
    }

    window.addEventListener("kasflow:open-transactions", handleOpenTransactions as EventListener)
    return () => {
      window.removeEventListener("kasflow:open-transactions", handleOpenTransactions as EventListener)
    }
  }, [])

  return (
    <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
      <div className="kasflow-root flex min-h-screen bg-background">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex fixed inset-y-0 left-0 z-50">
          <Sidebar currentPage={currentPage} setCurrentPage={handleNavigate} />
        </div>

        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="kasflow-mobile-hamburger md:hidden fixed left-3 top-3 z-50 text-secondary hover:text-primary hover:bg-elevated"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Buka menu navigasi</span>
          </Button>
        </SheetTrigger>

        {/* Main Content */}
        <main className="flex-1 flex flex-col md:ml-[88px] xl:ml-[240px]">
          {/* Page Content */}
          <div className="kasflow-main-scroll flex-1 overflow-y-auto bg-base">
            <div className="p-6 md:p-7">
              <div key={currentPage} className="page-enter">
                {currentPage === "dashboard" && <Dashboard />}
                {currentPage === "transactions" && <Transactions focusedAccountId={focusedAccountId} />}
                {currentPage === "reports" && <Reports />}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Sidebar */}
      <SheetContent side="left" className="p-0 w-64 md:hidden">
        <div className="relative h-full">
          <SheetClose asChild>
            <button
              type="button"
              className="absolute right-3 top-3 z-10 rounded-lg border border-white/10 bg-white/10 text-primary p-2"
              aria-label="Tutup menu"
            >
              <X className="h-4 w-4" />
            </button>
          </SheetClose>
          <Sidebar currentPage={currentPage} setCurrentPage={handleNavigate} mobile />
        </div>
      </SheetContent>
    </Sheet>
  )
}
