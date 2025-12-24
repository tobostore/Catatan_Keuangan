"use client"

import MainApp from "@/components/main-app"
import { FinanceProvider } from "@/context/finance-context"

export default function Home() {
  return (
    <FinanceProvider>
      <MainApp />
    </FinanceProvider>
  )
}
