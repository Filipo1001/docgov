/**
 * GET /api/cron/reporte-mensual — el cierre del mes, segmentado.
 *
 * Corre el día 6 a las 7:00 de Bogotá y reporta el MES ANTERIOR: para entonces
 * el ciclo ya cerró —los informes se radican en los primeros días— y la foto
 * es el resultado real, no una a medias.
 *
 * ── Dos correos distintos, y la diferencia es la regla del sistema ───────
 *
 *   · A cada SECRETARÍA (su supervisor y sus asesores): sus cifras, sus
 *     contratos abiertos CON NOMBRE, y el reparto agregado del municipio para
 *     situarse. Nombres, solo los suyos.
 *   · A quien responde por el MUNICIPIO (alcalde, admin, contratación): las
 *     cuatro secretarías comparadas, sin un solo nombre propio. Quien necesite
 *     saber a quién llamar lo tiene en el correo de su secretaría.
 *
 * Esa línea —cifras agregadas se comparten, nombres no salen de su
 * dependencia— es lo que faltaba. La alerta de cuentas sin radicar mandaba la
 * MISMA lista de tres nombres a los cuatro secretarios; para Desarrollo
 * Territorial y Bienestar Social no había nada suyo dentro. El reparto ya no
 * se escribe a mano en cada regla: sale de `lib/alcance.ts`.
 *
 * El cálculo vive en `lib/reportes/consolidado.ts`, aparte, para poder correr
 * un mes real y mirarlo antes de mandárselo a nadie. Ahí están documentados
 * los tres errores de la versión anterior (denominador con la fecha de hoy,
 * comparación que ignoraba `es_historico`, y «pagado» donde el sistema solo
 * sabe «radicado»).
 *
 * Anti-duplicado: guard por (tipo, destinatario) en 48 h, así un reintento del
 * cron no manda dos consolidados.
 *
 * Auth: Vercel envía `Authorization: Bearer ${CRON_SECRET}`. Sin secret → 401.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { enviarNotificacion } from '@/lib/notifications'
import { destinatariosDe, usuariosTransversales } from '@/lib/alcance'
import { calcularConsolidado } from '@/lib/reportes/consolidado'
import { urlTorta } from '@/lib/graficos/torta'
import type {
  DatosConsolidadoDependencia,
  DatosConsolidadoMunicipio,
} from '@/lib/emails/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Por debajo de esto la secretaría sale nombrada en el aviso del municipio. */
const UMBRAL_REZAGO = 70

function hoyBogota(): { anio: number; mesIdx: number; iso: string } {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [anio, mes] = iso.split('-').map(Number)
  return { anio, mesIdx: mes - 1, iso }
}

const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const hoy = hoyBogota()

  // El mes que se reporta es el anterior al de hoy.
  const mesIdx = (hoy.mesIdx + 11) % 12
  const anio = hoy.mesIdx === 0 ? hoy.anio - 1 : hoy.anio

  const c = await calcularConsolidado(admin, mesIdx, anio, hoy.iso)

  if (c.dependencias.length === 0) {
    return NextResponse.json({ mes: `${c.mes} ${anio}`, enviados: 0, motivo: 'ningún contrato vigente ese mes' })
  }

  // ── Guard anti-duplicado: 48 h por destinatario y tipo ─────────────────
  const hace48h = new Date(Date.now() - 48 * 3600_000).toISOString()
  const { data: yaEnviadas } = await admin
    .from('notificaciones')
    .select('usuario_id, tipo')
    .in('tipo', ['reporte_mensual', 'consolidado_municipio'])
    .gte('created_at', hace48h)
  const yaRecibieron = new Set((yaEnviadas ?? []).map(n => `${n.tipo}:${n.usuario_id}`))

  let enviados = 0
  let omitidos = 0
  const sinDestinatario: string[] = []

  // ══ Consolidado de cada secretaría ═══════════════════════════════════
  for (const b of c.dependencias) {
    const destinatarios = destinatariosDe(b.ambito)
    if (destinatarios.length === 0) {
      // Hacienda, Bienestar Social y Desarrollo Territorial no tienen asesor:
      // si además faltara el supervisor, el consolidado no tiene a quién ir y
      // conviene que se vea en la respuesta del cron, no que desaparezca.
      sinDestinatario.push(b.ambito.nombre)
      continue
    }

    const datos: DatosConsolidadoDependencia = {
      mes: c.mes,
      anio: c.anio,
      mesPrevio: c.mesPrevio,
      dependencia: b.ambito.nombre,
      dependenciaId: b.ambito.dependenciaId,
      fila: {
        contratos: b.fila.contratos,
        cerrados: b.fila.cerrados,
        pct: b.fila.pct,
        contratistas: b.fila.contratistas,
        valor: b.fila.valor,
        enviados: b.fila.enviados,
      },
      urlTorta: urlTorta({ enviados: b.fila.enviados, total: b.fila.contratos }),
      previo: b.previo,
      notaPrevio: b.notaPrevio,
      cambioPoblacion: b.cambioPoblacion,
      tramiteDias: b.tramiteDias,
      sinPlanilla: b.sinPlanilla,
      reparos: b.reparos,
      // El reparto del municipio solo viaja a quien tiene competencia sobre el
      // presupuesto entero. Para el resto va `null` y el bloque no se pinta.
      municipio: b.ambito.veMunicipio
        ? {
            valor: c.municipio.valor,
            informes: c.municipio.informes,
            filas: c.municipio.filas.map(f => ({
              dependenciaId: f.dependenciaId,
              nombre: f.nombre,
              valor: f.valor,
              cerrados: f.cerrados,
              contratos: f.contratos,
            })),
          }
        : null,
    }

    // La campana guarda texto plano: tiene que leerse sola, sin el correo.
    const mensaje =
      `${b.fila.cerrados} de ${b.fila.contratos} contratos cerraron el ciclo de ${c.mes}. ` +
      `${b.fila.enviados} de ${b.fila.contratos} enviaron su informe. ` +
      `${b.fila.contratistas} contratistas, ${cop(b.fila.valor)} radicados.`

    for (const destinatarioId of destinatarios) {
      if (yaRecibieron.has(`reporte_mensual:${destinatarioId}`)) { omitidos++; continue }
      await enviarNotificacion({
        destinatarioId,
        tipo: 'reporte_mensual',
        titulo: `Consolidado de ${c.mes} ${c.anio}`,
        mensaje,
        mes: c.mes,
        anio: c.anio,
        datos,
      }).catch(() => {})
      enviados++
    }
  }

  // ══ Consolidado del municipio ════════════════════════════════════════
  const transversales = await usuariosTransversales(admin)
  if (transversales.length) {
    const filas = c.dependencias.map(b => ({
      nombre: b.ambito.nombre,
      valor: b.fila.valor,
      cerrados: b.fila.cerrados,
      contratos: b.fila.contratos,
      pct: b.fila.pct,
      contratistas: b.fila.contratistas,
    }))

    const datos: DatosConsolidadoMunicipio = {
      mes: c.mes,
      anio: c.anio,
      informes: c.municipio.informes,
      contratistas: c.municipio.contratistas,
      valor: c.municipio.valor,
      filas,
      rezagadas: filas
        .filter(f => f.pct < UMBRAL_REZAGO)
        .map(f => ({ nombre: f.nombre, cerrados: f.cerrados, contratos: f.contratos })),
    }

    const mensaje =
      `${c.municipio.informes} informes cerraron el ciclo de ${c.mes} en ${filas.length} secretarías. ` +
      `${c.municipio.contratistas} contratistas, ${cop(c.municipio.valor)} radicados.`

    for (const destinatarioId of transversales) {
      if (yaRecibieron.has(`consolidado_municipio:${destinatarioId}`)) { omitidos++; continue }
      await enviarNotificacion({
        destinatarioId,
        tipo: 'consolidado_municipio',
        titulo: `Consolidado del municipio — ${c.mes} ${c.anio}`,
        mensaje,
        mes: c.mes,
        anio: c.anio,
        datos,
      }).catch(() => {})
      enviados++
    }
  }

  return NextResponse.json({
    ok: true,
    mes: `${c.mes} ${c.anio}`,
    dependencias: c.dependencias.length,
    informes: c.municipio.informes,
    valor: c.municipio.valor,
    enviados,
    omitidos,
    ...(sinDestinatario.length ? { sinDestinatario } : {}),
  })
}
