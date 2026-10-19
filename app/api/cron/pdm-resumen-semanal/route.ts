/**
 * GET /api/cron/pdm-resumen-semanal — qué pasó en el Plan de Desarrollo esta semana, para el administrador.
 *
 * Corre cada lunes a las 7:00 de Bogotá (`vercel.json`) y cuenta los siete días anteriores: reportes enviados, aprobados,
 * devueltos y anulados, más lo que necesita atención hoy (reportes esperando validación, indicadores sin responsable,
 * personas con indicadores que no pueden entrar al módulo).
 *
 * `?ensayo=1` calcula todo y NO envía nada. `&ahora=<ISO>` mira otra fecha.
 * Cierra por fuera como el resto del módulo. Auth: ver `lib/pdm/correos/cron.ts`.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { ahoraDelCron, origenDelCron, rechazarSiNoEsElCron } from '@/lib/pdm/correos/cron'
import { enviarResumenSemanal } from '@/lib/pdm/correos/enviar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const rechazo = rechazarSiNoEsElCron(req)
  if (rechazo) return rechazo
  const ensayo = req.nextUrl.searchParams.get('ensayo') === '1'
  try {
    const r = await enviarResumenSemanal({ origen: origenDelCron(req), ensayo, ahora: ahoraDelCron(req, ensayo) })
    return NextResponse.json({ ensayo, ...r })
  } catch (e) {
    console.error('[pdm/correos] resumen-semanal no se pudo preparar:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No se pudo preparar el resumen' }, { status: 500 })
  }
}
