import { type NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  // Protect /dashboard — check for Supabase session cookie without any network call.
  // Client-side checkAuth in DashboardClient.tsx performs full validation.
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const hasSession = request.cookies.getAll().some(
      (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
    )
    if (!hasSession) {
      return NextResponse.redirect(new URL('/auth', request.url))
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
