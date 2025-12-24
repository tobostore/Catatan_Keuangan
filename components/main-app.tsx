"use client"

import { useState } from "react"
import { Menu } from "lucide-react"

import Sidebar from "@/components/layout/sidebar"
import Dashboard from "@/components/pages/dashboard"
import Transactions from "@/components/pages/transactions"
import Reports from "@/components/pages/reports"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

export default function MainApp() {
  const [currentPage, setCurrentPage] = useState<"dashboard" | "transactions" | "reports">("dashboard")
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const handleNavigate = (page: "dashboard" | "transactions" | "reports") => {
    setCurrentPage(page)
    setIsMobileNavOpen(false)
  }

  return (
    <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
      <div className="flex min-h-screen bg-background md:flex-row flex-col">
        <div className="hidden md:flex h-full">
          <Sidebar currentPage={currentPage} setCurrentPage={handleNavigate} />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="md:hidden flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <p className="text-xs text-muted-foreground">Menu</p>
              <p className="text-lg font-semibold text-foreground">Finance Manager</p>
            </div>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Buka menu navigasi</span>
              </Button>
            </SheetTrigger>
          </div>

          <div className="p-6">
            {currentPage === "dashboard" && <Dashboard />}
            {currentPage === "transactions" && <Transactions />}
            {currentPage === "reports" && <Reports />}
          </div>
        </main>
      </div>

      <SheetContent side="left" className="p-0 w-72 md:hidden">
        <Sidebar currentPage={currentPage} setCurrentPage={handleNavigate} />
      </SheetContent>
    </Sheet>
  )
}
