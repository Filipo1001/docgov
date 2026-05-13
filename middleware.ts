import { NextRequest, NextResponse } from 'next/server'

const OLD_HOST = 'docgov-black.vercel.app'
const NEW_ORIGIN = 'https://contratistadigital.com'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''

  if (host === OLD_HOST) {
    const destination = NEW_ORIGIN + request.nextUrl.pathname + request.nextUrl.search
    return NextResponse.redirect(destination, { status: 301 })
  }

  return NextResponse.next()
}

export const config = {
  // Run on every route except static assets and Next internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
