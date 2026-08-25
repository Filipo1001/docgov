import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { ORIGEN_APP, HOSTS_REDIRIGIDOS, HOSTS_COMERCIALES, esRutaComercial } from '@/lib/dominio'
import { SITIO } from '@/lib/seo'
import { necesitaRenovacion } from '@/lib/jwt-cookie'

/**
 * Rutas que nunca deben aparecer en un buscador.
 *
 * `/verificar` es la que importa: es pública a propósito —un QR impreso tiene
 * que poder consultarse sin cuenta— pero muestra nombre completo, dependencia,
 * valor del contrato y supervisor de personas reales. La cabecera se suma al
 * `noindex` de la propia página porque actúa aunque el rastreador no llegue a
 * ejecutar la página, y cubre igualmente a los PDF y respuestas de API.
 */
const RUTAS_NO_INDEXABLES = ['/dashboard', '/verificar', '/auth', '/api', '/maintenance']

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const { pathname, search } = request.nextUrl

  /** Marca la respuesta como no indexable si la ruta lo requiere. */
  const conDirectivas = (res: NextResponse) => {
    if (RUTAS_NO_INDEXABLES.some(r => pathname === r || pathname.startsWith(`${r}/`))) {
      res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    }
    return res
  }

  // ── Host routing ──────────────────────────────────────────────
  // Two sites share one deployment:
  //
  //   contratistadigital.com  →  the commercial site (root only)
  //   app.contratistadigital.com  →  the application
  //
  // On the commercial hosts the root is rewritten to /inicio — the URL stays
  // on the apex, which is what a marketing page needs — and everything else
  // redirects to the app.
  //
  // 301 and not 302 on purpose: QR readers, SECOP II and search engines all
  // treat it as definitive, and the browser caches it so the hop only costs
  // the first visit.
  //
  // CRITICAL — /verificar/* must keep redirecting, forever. The QR codes
  // printed on the 240 documents issued before August 2026 have the apex URL
  // baked into the bitmap and cannot be rewritten. Anything that narrows this
  // redirect must keep /verificar/* out of the exception. See lib/dominio.ts.
  if ((HOSTS_COMERCIALES as readonly string[]).includes(host)) {
    // Una sola versión indexable. `www` y el dominio desnudo servían ambos un
    // 200 con contenido idéntico, que para un buscador son dos sitios
    // compitiendo entre sí. Se elige el desnudo porque es el que llevan
    // impreso los 240 QR y todos los documentos ya emitidos.
    if (host !== new URL(SITIO).host) {
      return NextResponse.redirect(SITIO + pathname + search, { status: 301 })
    }
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/inicio', request.url))
    }
    if (!esRutaComercial(pathname)) {
      return NextResponse.redirect(ORIGEN_APP + pathname + search, { status: 301 })
    }
    return conDirectivas(NextResponse.next({ request }))
  }

  if ((HOSTS_REDIRIGIDOS as readonly string[]).includes(host)) {
    return NextResponse.redirect(ORIGEN_APP + pathname + search, { status: 301 })
  }

  // La landing solo debe existir en el sitio comercial. Servida también desde
  // el subdominio de la aplicación serían dos URL con el mismo contenido, y
  // Google elegiría por su cuenta cuál mostrar.
  //
  // La condición se limita al host canónico a propósito. Aplicada a todo host
  // no comercial, alcanzaba también a las URL de preview de Vercel y dejaba la
  // landing imposible de revisar antes de publicarla — y ahí no hay nada que
  // proteger: los despliegues de preview no son indexables.
  if (pathname === '/inicio' && host === new URL(ORIGEN_APP).host) {
    return NextResponse.redirect(SITIO + search, { status: 301 })
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
    return conDirectivas(NextResponse.next({ request }))
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
    return conDirectivas(NextResponse.next({ request }))
  }

  // ── Atajo: no renovar lo que todavía no vence ────────────────
  //
  // Aquí vivía una creencia equivocada, y salía cara: el comentario anterior
  // decía que «para un token válido el JWT se valida localmente (sin llamada
  // de red); solo los tokens vencidos llegan al servidor de auth». No es así.
  // `getUser()` SIEMPRE va a la red — es justo lo que lo distingue de
  // `getSession()`—, de modo que este middleware disparaba una petición a
  // /auth/v1/user en cada navegación, cada Server Action y cada latido.
  //
  // Medido en producción: 28.956 llamadas a /auth/v1/user en 24 horas para
  // ~130 usuarios, MÁS que consultas de datos (ratio 1,3 a 1). A 350-540 ms
  // cada una, /dashboard acumulaba varios viajes en serie antes de pintar nada.
  //
  // El trabajo real de este bloque es renovar la cookie antes de que venza, no
  // validar: de validar se encargan `requireRole` y `getAuthContext`, que
  // verifican la firma de verdad. Si al token le quedan más de diez minutos no
  // hay nada que renovar, así que se sigue de largo. Si queda poco —o si no se
  // pudo leer el `exp`— se hace la llamada como siempre.
  if (!necesitaRenovacion(request.cookies.getAll())) {
    return conDirectivas(NextResponse.next({ request }))
  }

  // ── Supabase session refresh ──────────────────────────────────
  // The server-side Supabase client (in Server Components and Server Actions)
  // cannot refresh expired access tokens on its own because Server Components
  // cannot set cookies on the response.  Without this middleware step, tokens
  // expire after 1 h and the browser client loses its session.
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

  return conDirectivas(response)
}

export const config = {
  // Run on every route except static assets and Next internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
