import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const OLD_HOST = 'docgov-black.vercel.app'
const NEW_ORIGIN = 'https://contratistadigital.com'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''

  // ── Domain redirect ───────────────────────────────────────────
  if (host === OLD_HOST) {
    const destination = NEW_ORIGIN + request.nextUrl.pathname + request.nextUrl.search
    return NextResponse.redirect(destination, { status: 301 })
  }

  // ── Supabase session refresh ──────────────────────────────────
  // The server-side Supabase client (in Server Components and Server Actions)
  // cannot refresh expired access tokens on its own because Server Components
  // cannot set cookies on the response.  Without this middleware step, tokens
  // expire after 1 h and the browser client loses its session, causing:
  //  • cargarActividades() to return null (RLS blocks unauthenticated reads)
  //  • user-context.tsx to not load the user profile (sidebar stays in skeleton)
  //
  // This block validates and refreshes the session on EVERY request so the
  // auth cookie is always fresh.  For a valid non-expired token the JWT is
  // validated locally (no network call); only expired tokens hit the network.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write refreshed cookies back to both the request (so downstream
          // middleware/handlers see them) and the response (so the browser
          // receives the updated Set-Cookie headers).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() is the recommended way to validate and refresh the session.
  // Errors are intentionally ignored — an invalid/missing session just means
  // the page's own auth check (requireRole / requireContractAccess) will
  // redirect the user to /login as usual.
  await supabase.auth.getUser()

  return response
}

export const config = {
  // Run on every route except static assets and Next internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
