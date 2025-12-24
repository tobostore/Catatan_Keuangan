"use client"

import type { ReactNode } from "react"

import { AuthProvider } from "@/context/auth-context"

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
