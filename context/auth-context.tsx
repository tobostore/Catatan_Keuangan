"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

interface AuthUser {
  id: string
  email: string
  name?: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/me", { cache: "no-store" })
      if (!response.ok) {
        setUser(null)
        return
      }
      const data = await response.json()
      setUser(data.user)
    } catch (error) {
      console.error("Gagal memuat sesi pengguna", error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await fetch("/api/logout", { method: "POST" })
    } finally {
      setUser(null)
      window.location.href = "/login"
    }
  }, [])

  return <AuthContext.Provider value={{ user, isLoading, refresh, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth harus digunakan di dalam AuthProvider")
  }
  return context
}
