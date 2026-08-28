/**
 * GET /api/cron/reporte-mensual — consolidado mensual para cada secretaría.
 *
 * Se envía el día 5 de cada mes (7:00 AM Bogotá) y resume el MES ANTERIOR:
 * para entonces el ciclo ya cerró —los informes se radican en los primeros
 * días— y el consolidado refleja el resultado real, no una foto a medias.
 *
 * Qué contiene y por qué:
 *  · Cumplimiento del mes: cuántos de sus contratos completaron el ciclo. Es
 *    el número que responde «¿cómo me fue?» de un vistazo.
 *  · Lo que quedó sin cerrar, con nombre y contrato. Un consolidado que solo
 *    felicita no sirve; lo accionable es la lista de lo que sigue abierto.
 *  · Comparación con el mes anterior, para ver la tendencia sin abrir el panel.
 *
 * Complementa, no duplica: el cron diario ya avisa de cuentas aprobadas sin
 * radicar (R5) y de contratos por vencer (R7). Aquí no se repite ninguna
 * alerta operativa — esto es el cierre del ciclo.
 *
 * Anti-duplicado: guard por (tipo, destinatario) en las últimas 48 h, así un
 * reintento del cron no manda dos consolidados. Se apoya en `notificaciones`,
 * igual que el cron diario.
 *
 * Auth: Vercel envía `Authorization: Bearer ${CRON_SECRET}`. Sin secret → 401.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { enviarNotificacion } from '@/lib/notifications'
import { MESES } from '@/lib/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Fecha actual en Bogotá (el server corre en UTC). */
function hoyBogota(): { anio: number; mesIdx: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [anio, mes] = partes.split('-').map(Number)
  return { anio, mesIdx: mes - 1 }
}

type ContratoRow = {
  id: string
  numero: string
  supervisor_id: string | null
  contratista: { nombre_completo: string } | null
}

type PeriodoRow = { contrato_id: string; estado: string; mes: string; anio: number }

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const hoy = hoyBogota()

  // Mes que se reporta: el anterior al actual. Y el previo a ese, para comparar.
  const idxReporte = (hoy.mesIdx + 11) % 12
  const anioReporte = hoy.mesIdx === 0 ? hoy.anio - 1 : hoy.anio
  const mesReporte = MESES[idxReporte]
  const idxPrevio = (idxReporte + 11) % 12
  const anioPrevio = idxReporte === 0 ? anioReporte - 1 : anioReporte
  const mesPrevio = MESES[idxPrevio]

  // 1. Contratos vigentes, agrupados por secretaría
  const hoyISO = new Date().toISOString().slice(0, 10)
  const { data: contratosRaw, error: eC } = await admin
    .from('contratos')
    .select('id, numero, supervisor_id, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)')
    .gte('fecha_fin', hoyISO)
  if (eC) return NextResponse.json({ error: eC.message }, { status: 500 })

  const contratos = (contratosRaw ?? []) as unknown as ContratoRow[]
  const porSupervisor = new Map<string, ContratoRow[]>()
  for (const c of contratos) {
    if (!c.supervisor_id) continue
    const lista = porSupervisor.get(c.supervisor_id) ?? []
    lista.push(c)
    porSupervisor.set(c.supervisor_id, lista)
  }
  if (porSupervisor.size === 0) {
    return NextResponse.json({ enviados: 0, motivo: 'sin supervisores con contratos vigentes' })
  }

  // 2. Periodos de los dos meses, en UNA consulta.
  //
  // Los dos .in() forman un producto cruzado: en el salto de año traería
  // también pares que no existen (p. ej. Diciembre-2027). No importa —
  // `estadoDe` empareja mes Y año exactos, así que las filas de más se
  // ignoran. Se prefiere esto a dos consultas o a un .or() encadenado, que
  // es más frágil de leer.
  const todosIds = contratos.map(c => c.id)
  const { data: periodosRaw, error: eP } = await admin
    .from('periodos')
    .select('contrato_id, estado, mes, anio')
    .in('contrato_id', todosIds)
    .eq('es_historico', false)
    .in('mes', [mesReporte, mesPrevio])
    .in('anio', [...new Set([anioReporte, anioPrevio])])
  if (eP) return NextResponse.json({ error: eP.message }, { status: 500 })
  const periodos = (periodosRaw ?? []) as PeriodoRow[]

  const estadoDe = (contratoId: string, mes: string, anio: number) =>
    periodos.find(p => p.contrato_id === contratoId && p.mes === mes && p.anio === anio)?.estado

  // 3. Guard anti-duplicado: 48 h por destinatario
  const hace48h = new Date(Date.now() - 48 * 3600_000).toISOString()
  const { data: yaEnviadas } = await admin
    .from('notificaciones')
    .select('usuario_id')
    .eq('tipo', 'reporte_mensual')
    .gte('created_at', hace48h)
  const yaRecibieron = new Set((yaEnviadas ?? []).map(n => n.usuario_id))

  const cerrado = (e?: string) => e === 'aprobado' || e === 'radicado'
  let enviados = 0
  let omitidos = 0

  for (const [supervisorId, sus] of porSupervisor) {
    if (yaRecibieron.has(supervisorId) || sus.length === 0) { omitidos++; continue }

    const total = sus.length
    const completados = sus.filter(c => cerrado(estadoDe(c.id, mesReporte, anioReporte))).length
    const pct = Math.round((completados / total) * 100)

    const previoCompletados = sus.filter(c => cerrado(estadoDe(c.id, mesPrevio, anioPrevio))).length
    const pctPrevio = Math.round((previoCompletados / total) * 100)

    const tendencia = pct === pctPrevio
      ? `igual que en ${mesPrevio}`
      : pct > pctPrevio
        ? `${pct - pctPrevio} puntos más que en ${mesPrevio}`
        : `${pctPrevio - pct} puntos menos que en ${mesPrevio}`

    // Lo que quedó abierto, con nombres — la parte accionable del consolidado.
    const abiertos = sus
      .map(c => ({ c, e: estadoDe(c.id, mesReporte, anioReporte) }))
      .filter(({ e }) => !cerrado(e))
      .map(({ c, e }) => {
        const etiqueta =
          !e || e === 'borrador' ? 'sin enviar'
          : e === 'rechazado' ? 'devuelto al contratista'
          : e === 'enviado' ? 'esperando tu aprobación'
          : e === 'revision' ? 'en revisión'
          : e
        return `${c.contratista?.nombre_completo ?? 'Sin nombre'} (contrato ${c.numero}) — ${etiqueta}`
      })

    const resumen = `${completados} de ${total} contratos completaron el ciclo (${pct}%), ${tendencia}.`

    const detalle = abiertos.length
      ? `Quedaron ${abiertos.length} sin cerrar: ` +
        abiertos.slice(0, 15).join(' · ') +
        (abiertos.length > 15 ? ` · y ${abiertos.length - 15} más` : '')
      : 'Todos los contratos a tu cargo completaron el ciclo.'

    await enviarNotificacion({
      destinatarioId: supervisorId,
      tipo: 'reporte_mensual',
      titulo: `Consolidado de ${mesReporte} ${anioReporte}`,
      mensaje: resumen,
      mes: mesReporte,
      anio: anioReporte,
      // `motivo` es el campo que la plantilla de correo sabe pintar; `mensaje`
      // solo alimenta la campana dentro de la aplicación.
      motivo: resumen,
      detalle,
    }).catch(() => {})
    enviados++
  }

  return NextResponse.json({
    mes: `${mesReporte} ${anioReporte}`,
    supervisores: porSupervisor.size,
    enviados,
    omitidos,
  })
}
