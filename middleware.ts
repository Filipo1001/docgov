import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { ORIGEN_APP, HOSTS_REDIRIGIDOS } from '@/lib/dominio'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''

  // ── Domain redirect ───────────────────────────────────────────
  // Every legacy host lands on the canonical origin, path and query intact.
  //
  // 301 and not 302 on purpose: QR readers, SECOP II and search engines all
  // treat it as definitive, and the browser caches it so the hop only costs
  // the first visit.
  //
  // CRITICAL — /verificar/* must survive this redirect forever. The QR codes
  // printed on the 240 documents issued before August 2026 have the apex URL
  // baked into the bitmap and cannot be rewritten. See lib/dominio.ts.
  if ((HOSTS_REDIRIGIDOS as readonly string[]).includes(host)) {
    const destination = ORIGEN_APP + request.nextUrl.pathname + request.nextUrl.search
    return NextResponse.redirect(destination, { status: 301 })
  }

  // ── Maintenance mode ──────────────────────────────────────────
  // Activated by setting MAINTENANCE_MODE=1 in Vercel env vars.
  // Takes effect in ~30 s without a redeploy.
  // Redirects ALL routes to /maintenance except the page itself.
  if (process.env.MAINTENANCE_MODE === '1') {
    if (!request.nextUrl.pathname.startsWith('/maintenance')) {
      const url = request.nextUrl.clone()
      url.pathname = '/maintenance'
      return NextResponse.redirect(url)
    }
    return NextResponse.next({ request })
  }

  // ── Fast path: skip auth for Next.js prefetch requests ──────────────────────
  // When a <Link> enters the viewport Next.js fires a prefetch request with the
  // header "Next-Router-Prefetch: 1".  With 20+ contract links visible on the
  // dashboard this creates a burst of 20+ simultaneous middleware invocations,
  // each calling getUser() which ALWAYS hits the Supabase Auth network endpoint.
  // Prefetches don't need token refresh — the real navigation re-runs middleware
  // if the token is actually expired.  Skipping here reduces Auth server load by
  // ~95% and eliminates the "exhausting resources" burst pattern in the logs.
  if (request.headers.get('Next-Router-Prefetch') === '1') {
    return NextResponse.next({ request })
  }

  // ── Fast path: skip auth refresh when there is no session ────
  // getUser() calls the Supabase auth server to validate / refresh the token.
  // When there is no session cookie at all the user is unauthenticated and
  // getUser() returns null anyway, so calling it is pure overhead that hammers
  // the auth server with every Edge Function invocation (login page, public
  // routes, prefetch requests, etc.).  Skip it early and let the page's own
  // auth guard (requireRole / requireContractAccess) redirect to /login.
  const hasSessionCookie = request.cookies.getAll().some(
    c => c.name.includes('-auth-token')
  )
  if (!hasSessionCookie) {
    return NextResponse.next({ request })
  }

  // ── Supabase session refresh ──────────────────────────────────
  // The server-side Supabase client (in Server Components and Server Actions)
  // cannot refresh expired access tokens on its own because Server Components
  // cannot set cookies on the response.  Without this middleware step, tokens
  // expire after 1 h and the browser client loses its session.
  //
  // For a valid non-expired token the JWT is validated locally (no network
  // call); only expired tokens hit the auth server.  We already confirmed a
  // session cookie exists above, so this call is always meaningful.
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
