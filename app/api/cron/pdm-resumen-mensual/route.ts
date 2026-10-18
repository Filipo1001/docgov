/**
 * GET /api/cron/pdm-resumen-mensual — «Tienes N reportes por validar», a cada secretaría.
 *
 * Corre el primer día de cada mes a las 7:00 de Bogotá (`vercel.json`). Solo escribe a las secretarías que tienen reportes
 * esperando su validación, del más antiguo al más reciente. Las cifras salen de la misma lectura y las mismas definiciones
 * que el tablero del módulo.
 *
 * `?ensayo=1` calcula todo y NO envía nada: devuelve a quién le tocaría y con qué cifras. `&ahora=<ISO>` mira otra fecha.
 *
 * Cierra por fuera como el resto del módulo: si el módulo no está abierto en este entorno, no hace nada.
 * Auth: ver `lib/pdm/correos/cron.ts`.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { ahoraDelCron, origenDelCron, rechazarSiNoEsElCron } from '@/lib/pdm/correos/cron'
import { enviarResumenMensual } from '@/lib/pdm/correos/enviar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const rechazo = rechazarSiNoEsElCron(req)
  if (rechazo) return rechazo
  const ensayo = req.nextUrl.searchParams.get('ensayo') === '1'
  try {
    const r = await enviarResumenMensual({ origen: origenDelCron(req), ensayo, ahora: ahoraDelCron(req, ensayo) })
    return NextResponse.json({ ensayo, ...r })
  } catch (e) {
    console.error('[pdm/correos] resumen-mensual no se pudo preparar:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No se pudo preparar el resumen' }, { status: 500 })
  }
}
