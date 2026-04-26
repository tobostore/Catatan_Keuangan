import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { AuthSessionProvider } from "@/components/auth-session-provider"
import { ThemeProvider } from "@/components/theme-provider"

export const metadata: Metadata = {
  title: "KasFlow - Kelola Keuangan Anda",
  description: "Aplikasi pengelola keuangan personal dengan AI insights dan pelaporan otomatis",
  icons: {
    icon: [
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem forcedTheme="dark">
          <AuthSessionProvider>
            {children}
            <Analytics />
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
