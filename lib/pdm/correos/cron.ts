import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { ORIGEN_APP } from '@/lib/dominio'
import { origenSeguro } from './enlaces'

/**
 * Lo común de las rutas de cron del módulo Plan de Desarrollo (los resúmenes por correo).
 *
 * Vercel llama a cada ruta con `Authorization: Bearer ${CRON_SECRET}`. Sin secreto configurado, o con uno distinto, la
 * ruta no responde nada útil: las cifras del ensayo llevan nombres de personas.
 */

/** `null` si la llamada está autorizada; si no, la respuesta que hay que devolver. */
export function rechazarSiNoEsElCron(req: NextRequest): NextResponse | null {
  const secreto = process.env.CRON_SECRET
  if (!secreto) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secreto}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return null
}

/**
 * A dónde lleva el botón del correo. En producción, SIEMPRE la dirección de la aplicación: el cron entra por la dirección
 * interna del despliegue (`*.vercel.app`), que está detrás de la protección de Vercel y no es la que conoce la gente.
 * Fuera de producción, la de la petición si se reconoce (ver `enlaces.ts`).
 */
export function origenDelCron(req: NextRequest): string {
  if (process.env.VERCEL_ENV === 'production') return ORIGEN_APP
  return origenSeguro(req.headers.get('x-forwarded-host') ?? req.headers.get('host'), req.headers.get('x-forwarded-proto'), process.env.VERCEL_BRANCH_URL)
}

/**
 * El instante que se usa como «ahora». En un ensayo se puede pedir otro (`?ahora=2026-11-01T12:00:00Z`) para ver el correo
 * de una fecha concreta; en un envío real, siempre el reloj del servidor.
 */
export function ahoraDelCron(req: NextRequest, ensayo: boolean): Date {
  const pedido = ensayo ? req.nextUrl.searchParams.get('ahora') : null
  const t = pedido ? Date.parse(pedido) : NaN
  return Number.isFinite(t) ? new Date(t) : new Date()
}
