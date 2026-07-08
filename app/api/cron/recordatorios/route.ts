/**
 * GET /api/cron/recordatorios — cron diario de alertas automáticas.
 *
 * Invocado por Vercel Cron (vercel.json) todos los días a las 12:00 UTC
 * (7:00 AM Bogotá). Evalúa tres reglas y dispara solo las que aplican hoy:
 *
 *  R1 — Contratistas con informe en borrador (escalonado por día del mes):
 *       día 25: recordatorio suave · día 28: urgente · día 2: venció (mes anterior)
 *  R5 — Secretaria/admin: cuentas aprobadas hace ≥5 días sin radicar
 *       (agrupado: UNA notificación por destinatario, no una por cuenta)
 *  R7 — Admin + supervisor del contrato: contratos que vencen en 60 o 30 días
 *
 * Anti-spam:
 *  - R1: guard de 20 h por (tipo, periodo) — un retry del cron no duplica
 *  - R5: máximo una alerta cada 4 días por destinatario
 *  - R7: dedup natural (solo dispara el día exacto de -60/-30)
 *
 * Auth: Vercel envía `Authorization: Bearer ${CRON_SECRET}` automáticamente
 * cuando la env var existe. Sin secret válido → 401.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { enviarNotificacion } from '@/lib/notifications'
import { MESES } from '@/lib/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Fecha actual en Bogotá (el server corre en UTC). */
function hoyBogota(): { anio: number; mesIdx: number; dia: number; iso: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()) // "YYYY-MM-DD"
  const [anio, mes, dia] = parts.split('-').map(Number)
  return { anio, mesIdx: mes - 1, dia, iso: parts }
}

/** ISO date (YYYY-MM-DD) a N días de hoy Bogotá. */
function fechaMasDias(isoHoy: string, dias: number): string {
  const d = new Date(isoHoy + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

type PeriodoBorrador = {
  id: string; mes: string; anio: number
  contrato: { numero: string; contratista_id: string | null } | null
}

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const { anio, mesIdx, dia, iso } = hoyBogota()
  const resumen: Record<string, number> = { r1_recordatorios: 0, r5_radicacion: 0, r7_vencimientos: 0 }

  // ══ R1 — Informes en borrador (días 25, 28 y 2) ═══════════════
  if (dia === 25 || dia === 28 || dia === 2) {
    // Día 2 → el mes VENCIDO es el anterior; días 25/28 → el mes en curso
    const esVencido = dia === 2
    const mesObjetivoIdx = esVencido ? (mesIdx === 0 ? 11 : mesIdx - 1) : mesIdx
    const anioObjetivo = esVencido && mesIdx === 0 ? anio - 1 : anio
    const mesNombre = MESES[mesObjetivoIdx]

    const tipo = esVencido ? 'recordatorio_vencido' : dia === 28 ? 'recordatorio_urgente' : 'recordatorio'
    const { data: borradores } = await admin
      .from('periodos')
      .select('id, mes, anio, contrato:contratos(numero, contratista_id)')
      .eq('mes', mesNombre)
      .eq('anio', anioObjetivo)
      .eq('estado', 'borrador')
      .eq('es_historico', false)
      .eq('habilitado_tardio', false)

    const candidatos = ((borradores ?? []) as unknown as PeriodoBorrador[])
      .filter(p => p.contrato?.contratista_id)

    // Guard anti-duplicado: mismo tipo+periodo en las últimas 20 h (retry del cron)
    const enviadas = new Set<string>()
    if (candidatos.length) {
      const hace20h = new Date(Date.now() - 20 * 3600_000).toISOString()
      const { data: yaEnviadas } = await admin
        .from('notificaciones')
        .select('periodo_id')
        .eq('tipo', tipo)
        .gte('created_at', hace20h)
        .in('periodo_id', candidatos.map(p => p.id))
      for (const n of yaEnviadas ?? []) enviadas.add(n.periodo_id as string)
    }

    await Promise.allSettled(
      candidatos.filter(p => !enviadas.has(p.id)).map(async (p) => {
        const titulo = esVencido
          ? `Tu informe de ${p.mes} ${p.anio} venció`
          : dia === 28
            ? `Quedan pocos días — informe de ${p.mes}`
            : `Recuerda enviar tu informe de ${p.mes}`
        const mensaje = esVencido
          ? `El plazo para enviar tu informe de ${p.mes} ${p.anio} ya venció. Contacta a tu supervisor para habilitar el envío tardío.`
          : `Aún no has enviado tu informe de ${p.mes} ${p.anio} del contrato ${p.contrato!.numero}. Ingresa a Contratista Digital para completarlo.`
        await enviarNotificacion({
          destinatarioId: p.contrato!.contratista_id!,
          tipo, titulo, mensaje,
          periodoId: p.id,
          mes: p.mes, anio: p.anio,
          contrato: p.contrato!.numero,
        })
        resumen.r1_recordatorios++
      }),
    )
  }

  // ══ R5 — Aprobadas sin radicar hace ≥5 días ═══════════════════
  {
    const { data: aprobados } = await admin
      .from('periodos')
      .select('id, mes, anio, contrato:contratos(numero, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo))')
      .eq('estado', 'aprobado')
      .eq('es_historico', false)

    type Aprobado = {
      id: string; mes: string; anio: number
      contrato: { numero: string; contratista: { nombre_completo: string } | null } | null
    }
    const rows = ((aprobados ?? []) as unknown as Aprobado[])

    if (rows.length) {
      // Fecha de aprobación = última transición → 'aprobado' en el historial
      const { data: hist } = await admin
        .from('historial_periodos')
        .select('periodo_id, created_at')
        .eq('estado_nuevo', 'aprobado')
        .in('periodo_id', rows.map(r => r.id))
        .order('created_at', { ascending: false })
      const aprobadoEn = new Map<string, string>()
      for (const h of hist ?? []) {
        if (!aprobadoEn.has(h.periodo_id)) aprobadoEn.set(h.periodo_id, h.created_at)
      }

      const hace5d = Date.now() - 5 * 24 * 3600_000
      const estancados = rows.filter(r => {
        const f = aprobadoEn.get(r.id)
        return f && new Date(f).getTime() <= hace5d
      })

      if (estancados.length) {
        const nombres = estancados
          .slice(0, 5)
          .map(r => `${r.contrato?.contratista?.nombre_completo ?? '?'} (${r.mes})`)
          .join(', ')
        const detalle = `Hay ${estancados.length} cuenta${estancados.length === 1 ? '' : 's'} aprobada${estancados.length === 1 ? '' : 's'} hace 5 o más días sin radicar: ${nombres}${estancados.length > 5 ? ` y ${estancados.length - 5} más` : ''}.`

        const { data: receptores } = await admin
          .from('usuarios')
          .select('id')
          .in('rol', ['supervisor', 'admin'])

        // Anti-spam: máximo una alerta de este tipo cada 4 días por destinatario
        const hace4d = new Date(Date.now() - 4 * 24 * 3600_000).toISOString()
        const { data: recientes } = await admin
          .from('notificaciones')
          .select('usuario_id')
          .eq('tipo', 'radicacion_pendiente')
          .gte('created_at', hace4d)
        const yaAvisados = new Set((recientes ?? []).map(n => n.usuario_id))

        await Promise.allSettled(
          (receptores ?? []).filter(u => !yaAvisados.has(u.id)).map(async (u) => {
            await enviarNotificacion({
              destinatarioId: u.id,
              tipo: 'radicacion_pendiente',
              titulo: `${estancados.length} cuenta(s) esperando radicación`,
              mensaje: detalle,
              detalle,
            })
            resumen.r5_radicacion++
          }),
        )
      }
    }
  }

  // ══ R7 — Contratos que vencen en 60 o 30 días ═════════════════
  {
    const en60 = fechaMasDias(iso, 60)
    const en30 = fechaMasDias(iso, 30)
    const { data: porVencer } = await admin
      .from('contratos')
      .select('id, numero, fecha_fin, supervisor_id, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)')
      .in('fecha_fin', [en60, en30])

    type ContratoVence = {
      id: string; numero: string; fecha_fin: string; supervisor_id: string | null
      contratista: { nombre_completo: string } | null
    }
    const contratos = ((porVencer ?? []) as unknown as ContratoVence[])

    if (contratos.length) {
      // Admin + Contratación (esta última tramita las prórrogas/otrosíes)
      const { data: admins } = await admin.from('usuarios').select('id').in('rol', ['admin', 'contratacion'])
      const adminIds = (admins ?? []).map(a => a.id)

      await Promise.allSettled(
        contratos.map(async (c) => {
          const dias = c.fecha_fin === en30 ? 30 : 60
          const detalle = `El contrato ${c.numero} de ${c.contratista?.nombre_completo ?? '?'} vence el ${c.fecha_fin} (en ${dias} días). Si continuará, es momento de tramitar la prórroga u otrosí.`
          // Admin(s) + supervisor del contrato, sin duplicar
          const destinatarios = [...new Set([...adminIds, ...(c.supervisor_id ? [c.supervisor_id] : [])])]
          await Promise.allSettled(
            destinatarios.map(id => enviarNotificacion({
              destinatarioId: id,
              tipo: 'contrato_vencimiento',
              titulo: `Contrato ${c.numero} vence en ${dias} días`,
              mensaje: detalle,
              contrato: c.numero,
              detalle,
            })),
          )
          resumen.r7_vencimientos += destinatarios.length
        }),
      )
    }
  }

  return NextResponse.json({ ok: true, fecha: iso, dia, ...resumen })
}
