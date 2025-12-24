import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth"

const PUBLIC_ROUTES = ["/login"]
const PUBLIC_API_PREFIXES = ["/api/login", "/api/logout", "/api/me"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublicPage = PUBLIC_ROUTES.includes(pathname)
  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  const isStaticAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon") ||
    /\.(?:svg|png)$/i.test(pathname)

  if (isStaticAsset) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  let isSessionValid = false
  if (token) {
    try {
      await verifySessionToken(token)
      isSessionValid = true
    } catch {
      // token tidak valid
    }
  }

  if (!isSessionValid && !isPublicPage && !isPublicApi) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ message: "Tidak diizinkan" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url))

    if (token) {
      response.cookies.delete(SESSION_COOKIE_NAME)
    }

    return response
  }

  if (isSessionValid && isPublicPage) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:png|svg)$).*)"],
}
