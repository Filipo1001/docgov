'use server'

/**
 * Reenvío de avisos de correo que quedaron sin salir.
 *
 * Origen: los envíos masivos disparaban todos los correos en paralelo y Resend
 * (2 por segundo) rechazaba la mayoría con 429. El rechazo se descartaba en
 * silencio, así que la notificación de la campana quedaba grabada y el correo
 * no salía. La radicación rápida fue donde se notó, pero el patrón afectaba a
 * cinco flujos. La causa está corregida en lib/resend.ts; esto repara lo ya
 * ocurrido.
 *
 * Dos principios:
 *
 * 1. NADA SE ENVÍA SIN CONFIRMACIÓN. `listarPendientes` solo consulta y
 *    devuelve a quién le falta el aviso; `reenviar` exige la lista explícita
 *    de periodos. Son destinatarios reales y un correo no se puede deshacer.
 *
 * 2. IDEMPOTENTE. Al reenviar se marca `email_estado='enviado'` en la fila de
 *    notificación existente, y la consulta de pendientes excluye lo marcado.
 *    Ejecutarlo dos veces no vuelve a escribir a nadie. No se crean filas de
 *    notificación nuevas: la campana ya las tiene y duplicarlas sería otro
 *    error visible para el contratista.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { enviarCorreo } from '@/lib/resend'
import { EMAIL_TEMPLATES } from '@/lib/emails/templates'
import { capitalizarNombre } from '@/lib/format'

export interface AvisoPendiente {
  notificacionId: string
  periodoId: string
  usuarioId: string
  nombre: string
  email: string
  mes: string
  anio: number
  contrato: string
  numeroRadicado: string | null
  radicadoEl: string
  via: 'rapida' | 'individual'
}

async function soloAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesión no disponible')
  const { data: yo } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  if (yo?.rol !== 'admin') throw new Error('Solo un administrador puede reenviar avisos')
  return user.id
}

/**
 * Avisos de radicado cuya fila de notificación existe pero cuyo correo NO
 * consta como enviado.
 *
 * `email_estado is null` son las anteriores al registro de envío (migración
 * 043): de esas no sabemos nada, y por eso se acotan a las radicadas por vía
 * rápida, que es donde el fallo ocurría. Las individuales salían de una en
 * una, sin ráfaga, así que no se tocan: reenviarles sería escribir a ~186
 * personas que ya recibieron su aviso.
 */
export async function listarPendientes(): Promise<{ data?: AvisoPendiente[]; error?: string }> {
  try {
    await soloAdmin()
    const admin = createAdminSupabaseClient()

    // Periodos radicados por vía rápida — el historial lo marca en el comentario.
    const { data: hist, error: eh } = await admin
      .from('historial_periodos')
      .select('periodo_id, created_at, comentario')
      .eq('estado_nuevo', 'radicado')
    if (eh) return { error: eh.message }

    const viaPorPeriodo = new Map<string, { via: 'rapida' | 'individual'; cuando: string }>()
    for (const h of (hist ?? []) as Array<{ periodo_id: string; created_at: string; comentario: string | null }>) {
      const c = (h.comentario ?? '').toLowerCase()
      const via = c.includes('radicación rápida') || c.includes('radicacion rapida') ? 'rapida' : 'individual'
      // Si un periodo tiene varias entradas, manda la más reciente.
      const previo = viaPorPeriodo.get(h.periodo_id)
      if (!previo || previo.cuando < h.created_at) viaPorPeriodo.set(h.periodo_id, { via, cuando: h.created_at })
    }
    const idsRapidos = [...viaPorPeriodo.entries()].filter(([, v]) => v.via === 'rapida').map(([id]) => id)
    if (!idsRapidos.length) return { data: [] }

    // Notificaciones de radicado sin correo confirmado.
    const { data: notifs, error: en } = await admin
      .from('notificaciones')
      .select('id, usuario_id, periodo_id, email_estado')
      .eq('tipo', 'radicado')
      .in('periodo_id', idsRapidos)
      .is('email_estado', null)
    if (en) return { error: en.message }
    if (!notifs?.length) return { data: [] }

    const periodoIds = [...new Set(notifs.map(n => n.periodo_id).filter(Boolean))] as string[]
    const { data: periodos } = await admin
      .from('periodos')
      .select('id, mes, anio, numero_radicado, contrato:contratos(numero)')
      .in('id', periodoIds)
    const periodoPorId = new Map(
      ((periodos ?? []) as unknown as Array<{
        id: string; mes: string; anio: number; numero_radicado: string | null
        contrato: { numero: string } | null
      }>).map(p => [p.id, p]),
    )

    const usuarioIds = [...new Set(notifs.map(n => n.usuario_id))]
    const { data: usuarios } = await admin
      .from('usuarios')
      .select('id, nombre_completo, email')
      .in('id', usuarioIds)
    const usuarioPorId = new Map(
      ((usuarios ?? []) as Array<{ id: string; nombre_completo: string; email: string | null }>).map(u => [u.id, u]),
    )

    const pendientes: AvisoPendiente[] = []
    for (const n of notifs) {
      const p = n.periodo_id ? periodoPorId.get(n.periodo_id) : undefined
      const u = usuarioPorId.get(n.usuario_id)
      // Sin correo real no hay nada que reenviar: se deja fuera de la lista
      // para que el recuento refleje envíos posibles, no expectativas.
      if (!p || !u?.email || u.email.endsWith('@pendiente.local')) continue
      pendientes.push({
        notificacionId: n.id,
        periodoId: p.id,
        usuarioId: u.id,
        nombre: u.nombre_completo,
        email: u.email,
        mes: p.mes,
        anio: p.anio,
        contrato: p.contrato?.numero ?? '',
        numeroRadicado: p.numero_radicado,
        radicadoEl: viaPorPeriodo.get(p.id)?.cuando ?? '',
        via: 'rapida',
      })
    }
    pendientes.sort((a, b) => a.radicadoEl.localeCompare(b.radicadoEl))
    return { data: pendientes }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Reenvía los avisos indicados. Solo actúa sobre periodos que sigan saliendo
 * en `listarPendientes`: si otro proceso ya los marcó, se omiten en vez de
 * escribir dos veces.
 */
export async function reenviarAvisos(
  periodoIds: string[],
): Promise<{ data?: { enviados: number; omitidos: number; fallidos: { periodoId: string; error: string }[] }; error?: string }> {
  try {
    await soloAdmin()
    if (!periodoIds.length) return { error: 'No se indicó ningún aviso para reenviar' }

    const { data: pendientes, error } = await listarPendientes()
    if (error) return { error }

    const porPeriodo = new Map((pendientes ?? []).map(p => [p.periodoId, p]))
    const admin = createAdminSupabaseClient()
    const plantilla = EMAIL_TEMPLATES['radicado']
    if (!plantilla) return { error: 'No existe plantilla de correo para "radicado"' }

    let enviados = 0
    let omitidos = 0
    const fallidos: { periodoId: string; error: string }[] = []

    // En serie a propósito: enviarCorreo ya espacia los envíos, y así el
    // recuento refleja el orden real por si hay que interrumpir.
    for (const periodoId of periodoIds) {
      const aviso = porPeriodo.get(periodoId)
      if (!aviso) { omitidos++; continue }   // ya marcado, o sin correo real

      const { subject, html } = plantilla({
        nombreDestinatario: capitalizarNombre(aviso.nombre?.split(' ')[0]) || 'Usuario',
        mes: aviso.mes,
        anio: aviso.anio,
        contrato: aviso.contrato,
        numeroRadicado: aviso.numeroRadicado ?? undefined,
        email: aviso.email,
      })

      const res = await enviarCorreo({ to: aviso.email, subject, html })
      if (res.ok) {
        enviados++
        await admin
          .from('notificaciones')
          .update({
            email_estado: 'enviado',
            email_id: res.id ?? null,
            email_error: 'reenvío de aviso pendiente',
            email_at: new Date().toISOString(),
          })
          .eq('id', aviso.notificacionId)
      } else {
        fallidos.push({ periodoId, error: res.error ?? 'error desconocido' })
      }
    }

    return { data: { enviados, omitidos, fallidos } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
