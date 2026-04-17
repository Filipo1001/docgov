'use server'

/**
 * Server Actions: Period workflow
 *
 * State transitions:
 *   borrador/rechazado → enviado       (contratista submits)
 *   enviado/rechazado → revision        (asesor marks as reviewed — optional step)
 *   revision → enviado                 (asesor revokes their review)
 *   enviado/revision → rechazado       (asesor rejects to contratista)
 *   enviado/revision → aprobado        (secretary approves — always valid, asesor step is optional)
 *   enviado/revision → enviado         (secretary rejects back for asesor review)
 *   aprobado → radicado                (asesor registers physical filing)
 *
 * Every state change logs into historial_periodos and sends notifications.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { ESTADOS_EDITABLES } from '@/lib/constants'
import { invalidarCachePDF } from '@/lib/pdf/cache'
import type { EstadoPeriodo, Rol, ActionResult } from '@/lib/types'
import { revalidatePath } from 'next/cache'
import { enviarNotificacion, enviarNotificacionMultiple } from '@/lib/notifications'

// ─── Internal helpers ────────────────────────────────────────

async function getAuthContext() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('No autorizado: sesión inválida')
  }

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, rol, nombre_completo, dependencia_id')
    .eq('id', user.id)
    .single()

  if (error || !usuario) {
    throw new Error('No autorizado: perfil de usuario no encontrado')
  }

  return { supabase, usuario: usuario as { id: string; rol: Rol; nombre_completo: string; dependencia_id: string | null } }
}

async function getPeriodo(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, periodoId: string) {
  const { data, error } = await supabase
    .from('periodos')
    .select('id, estado, contrato_id, mes, anio, es_historico')
    .eq('id', periodoId)
    .single()

  if (error || !data) return null
  return data as { id: string; estado: EstadoPeriodo; contrato_id: string; mes: string; anio: number; es_historico: boolean }
}

// ── Past-month lock ───────────────────────────────────────────
const MES_INDEX: Record<string, number> = {
  ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3,
  MAYO: 4, JUNIO: 5, JULIO: 6, AGOSTO: 7,
  SEPTIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
}

function isPeriodoVencido(periodo: { mes: string; anio: number; estado: EstadoPeriodo }): boolean {
  // rechazado periods must always remain editable
  if (periodo.estado === 'rechazado') return false
  const now = new Date()
  const mesIdx = MES_INDEX[periodo.mes.toUpperCase()] ?? -1
  if (periodo.anio < now.getFullYear()) return true
  if (periodo.anio === now.getFullYear() && mesIdx < now.getMonth()) return true
  return false
}

async function getContratoIds(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contratoId: string) {
  const { data } = await supabase
    .from('contratos')
    .select('numero, supervisor_id, contratista_id, dependencia_id')
    .eq('id', contratoId)
    .single()
  return data
}

function revalidar(contratoId?: string, periodoId?: string) {
  if (contratoId && periodoId) {
    revalidatePath(`/dashboard/contratos/${contratoId}/periodo/${periodoId}`)
    revalidatePath(`/dashboard/contratos/${contratoId}`)
  }
  revalidatePath('/dashboard/informes')
  revalidatePath('/dashboard/contratistas')
  revalidatePath('/dashboard/colaboradores')
  revalidatePath('/dashboard')
}

/** Insert into historial_periodos using regular client (authenticated user). */
async function insertHistorial(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  periodoId: string,
  estadoAnterior: EstadoPeriodo | null,
  estadoNuevo: EstadoPeriodo | null,
  usuarioId: string,
  comentario?: string
) {
  await supabase.from('historial_periodos').insert({
    periodo_id: periodoId,
    estado_anterior: estadoAnterior,
    estado_nuevo: estadoNuevo,
    usuario_id: usuarioId,
    comentario: comentario ?? null,
  })
}


// ─── Contratista Actions ────────────────────────────────────

/**
 * Contratista submits a period for review.
 */
export async function enviarPeriodo(periodoId: string): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'contratista' && usuario.rol !== 'admin') {
      return { error: 'Solo el contratista puede enviar periodos a revisión' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }

    if (periodo.es_historico) {
      return { error: 'No se puede modificar un periodo histórico' }
    }

    if (!ESTADOS_EDITABLES.includes(periodo.estado)) {
      return { error: `No se puede enviar un periodo en estado "${periodo.estado}"` }
    }

    // Verify ownership
    if (usuario.rol === 'contratista') {
      const contrato = await getContratoIds(supabase, periodo.contrato_id)
      if (contrato?.contratista_id !== usuario.id) {
        return { error: 'No tienes permiso para enviar este periodo' }
      }
      // Block submission of past-month borrador periods
      if (isPeriodoVencido(periodo)) {
        return { error: 'El plazo para enviar este periodo ya venció. Solo puedes enviar el informe del mes actual.' }
      }
    }

    // Must have at least one activity
    const { count } = await supabase
      .from('actividades')
      .select('*', { count: 'exact', head: true })
      .eq('periodo_id', periodoId)

    if (!count || count === 0) {
      return { error: 'Debes registrar al menos una actividad antes de enviar' }
    }

    // Planilla de seguridad social obligatoria
    const { data: planillaData } = await supabase
      .from('periodos')
      .select('planilla_ss_url, numero_planilla')
      .eq('id', periodoId)
      .single()

    if (!planillaData?.planilla_ss_url || !planillaData?.numero_planilla?.trim()) {
      return { error: 'Para enviar el informe de actividades, debes adjuntar la planilla de seguridad social valida' }
    }

    const estadoAnterior = periodo.estado
    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'enviado', fecha_envio: new Date().toISOString(), motivo_rechazo: null })
      .eq('id', periodoId)

    if (error) return { error: `Error al enviar: ${error.message}` }

    await insertHistorial(supabase, periodoId, estadoAnterior, 'enviado', usuario.id)

    // Notify asesor(es) and supervisor about the submission
    const contrato = await getContratoIds(supabase, periodo.contrato_id)
    if (contrato) {
      const titulo = `Nuevo informe enviado — ${periodo.mes} ${periodo.anio}`
      const mensaje = `${usuario.nombre_completo} envió su informe de ${periodo.mes} ${periodo.anio} para revisión.`

      const notifBase = {
        tipo: 'enviado',
        titulo,
        mensaje,
        periodoId,
        mes: periodo.mes,
        anio: periodo.anio,
        contrato: contrato.numero || '',
        nombreRemitente: usuario.nombre_completo,
      }

      // Notify supervisor
      if (contrato.supervisor_id) {
        await enviarNotificacion({ ...notifBase, destinatarioId: contrato.supervisor_id })
      }

      // Notify asesores in the same dependencia
      if (contrato.dependencia_id) {
        const adminClient = createAdminSupabaseClient()
        const { data: asesores } = await adminClient
          .from('usuarios')
          .select('id')
          .eq('rol', 'asesor')
          .eq('dependencia_id', contrato.dependencia_id)
        if (asesores) {
          await enviarNotificacionMultiple(
            asesores.map(a => a.id),
            notifBase
          )
        }
      }
    }

    invalidarCachePDF(createAdminSupabaseClient(), periodoId).catch(() => {})
    revalidar(periodo.contrato_id, periodoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Asesor Actions ─────────────────────────────────────────

/**
 * Asesor marks a period as reviewed (enviado or rechazado → revision).
 * This is an optional step — secretary can approve directly from enviado.
 */
export async function aprobarComoAsesor(periodoId: string): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'asesor' && usuario.rol !== 'admin') {
      return { error: 'Solo los asesores pueden aprobar informes' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }
    if (periodo.es_historico) return { error: 'No se puede modificar un periodo histórico' }

    if (periodo.estado !== 'enviado' && periodo.estado !== 'rechazado') {
      return { error: 'Solo se pueden aprobar periodos en estado "enviado" o "rechazado"' }
    }

    const estadoAnterior = periodo.estado
    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'revision', motivo_rechazo: null })
      .eq('id', periodoId)

    if (error) return { error: `Error al aprobar: ${error.message}` }

    await insertHistorial(supabase, periodoId, estadoAnterior, 'revision', usuario.id)

    // Notify contratista
    const contrato = await getContratoIds(supabase, periodo.contrato_id)
    if (contrato?.contratista_id) {
      await enviarNotificacion({
        destinatarioId: contrato.contratista_id,
        tipo: 'revision',
        titulo: 'Tu informe está en revisión',
        mensaje: `Tu informe de ${periodo.mes} ${periodo.anio} fue revisado por el asesor y está en revisión por la secretaria.`,
        periodoId,
        mes: periodo.mes,
        anio: periodo.anio,
        contrato: contrato.numero || '',
        nombreRemitente: usuario.nombre_completo,
      })
    }

    invalidarCachePDF(createAdminSupabaseClient(), periodoId).catch(() => {})
    revalidar(periodo.contrato_id, periodoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Asesor rejects a period → rechazado (back to contratista).
 * Also allows revoking revision state.
 */
export async function rechazarComoAsesor(
  periodoId: string,
  motivo: string
): Promise<ActionResult> {
  try {
    if (!motivo?.trim()) {
      return { error: 'El motivo de rechazo es obligatorio' }
    }

    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'asesor' && usuario.rol !== 'admin') {
      return { error: 'Solo los asesores pueden rechazar informes' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }
    if (periodo.es_historico) return { error: 'No se puede modificar un periodo histórico' }

    if (periodo.estado !== 'enviado' && periodo.estado !== 'revision') {
      return { error: 'Solo se pueden rechazar periodos en estado "enviado" o "revision"' }
    }

    const estadoAnterior = periodo.estado
    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'rechazado', motivo_rechazo: motivo.trim() })
      .eq('id', periodoId)

    if (error) return { error: `Error al rechazar: ${error.message}` }

    await insertHistorial(supabase, periodoId, estadoAnterior, 'rechazado', usuario.id, motivo.trim())

    // Notify contratista
    const contrato = await getContratoIds(supabase, periodo.contrato_id)
    if (contrato?.contratista_id) {
      await enviarNotificacion({
        destinatarioId: contrato.contratista_id,
        tipo: 'rechazado',
        titulo: 'Tu informe requiere correcciones',
        mensaje: `Tu informe de ${periodo.mes} ${periodo.anio} fue rechazado. Motivo: ${motivo.trim()}`,
        periodoId,
        mes: periodo.mes,
        anio: periodo.anio,
        contrato: contrato.numero || '',
        motivo: motivo.trim(),
        nombreRemitente: usuario.nombre_completo,
      })
    }

    invalidarCachePDF(createAdminSupabaseClient(), periodoId).catch(() => {})
    revalidar(periodo.contrato_id, periodoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Asesor pre-approves a period (adds a flag, doesn't change state).
 * @deprecated Use aprobarComoAsesor instead. Kept for backwards compatibility.
 */
export async function preAprobarPeriodo(periodoId: string): Promise<ActionResult> {
  return aprobarComoAsesor(periodoId)
}

/**
 * Asesor revokes their pre-approval.
 * @deprecated Use rechazarComoAsesor instead. Kept for backwards compatibility.
 */
export async function revocarPreaprobacion(periodoId: string): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'asesor' && usuario.rol !== 'admin') {
      return { error: 'Solo los asesores pueden revocar pre-aprobaciones' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }
    if (periodo.es_historico) return { error: 'No se puede modificar un periodo histórico' }

    if (periodo.estado !== 'revision') {
      return { error: 'Solo se puede revocar la revisión de periodos en estado "revision"' }
    }

    const estadoAnterior = periodo.estado
    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'enviado' })
      .eq('id', periodoId)

    if (error) return { error: `Error al revocar: ${error.message}` }

    await insertHistorial(supabase, periodoId, estadoAnterior, 'enviado', usuario.id, 'Aprobación revocada por asesor')

    revalidar(periodo.contrato_id, periodoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Secretary (Supervisor) Actions ─────────────────────────

/**
 * Secretary approves one or more periods (enviado|revision → aprobado).
 *
 * The secretary is the final authority. She can approve from:
 *   - 'enviado'  → asesor has not reviewed yet (secretary acts directly)
 *   - 'revision' → asesor has reviewed and flagged it (normal flow)
 * Both transitions are valid for supervisor and admin.
 *
 * Performance: replaces N+1 loop with 3 queries total regardless of batch size:
 *   1. SELECT all periods with contract data in one .in() query
 *   2. Single batch UPDATE .in(validIds)
 *   3. Parallel historial inserts + parallel notifications
 */
export async function aprobarPeriodos(periodoIds: string[]): Promise<ActionResult<{ aprobados: number }>> {
  try {
    if (!periodoIds.length) return { data: { aprobados: 0 } }

    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'supervisor' && usuario.rol !== 'admin') {
      return { error: 'Solo la secretaria puede aprobar informes' }
    }

    // Secretary can approve from either state — asesor review is optional
    const estadosPermitidos: EstadoPeriodo[] = ['revision', 'enviado']

    // 1 query: fetch all periods + contract info together (exclude historical)
    const { data: periodos, error: fetchError } = await supabase
      .from('periodos')
      .select('id, estado, contrato_id, mes, anio, contrato:contratos(numero, contratista_id)')
      .in('id', periodoIds)
      .in('estado', estadosPermitidos)
      .eq('es_historico', false)

    if (fetchError) return { error: fetchError.message }
    if (!periodos || periodos.length === 0) return { data: { aprobados: 0 } }

    const validIds = periodos.map(p => p.id)

    // 1 query: batch update all valid periods
    const { error: updateError } = await supabase
      .from('periodos')
      .update({ estado: 'aprobado', motivo_rechazo: null })
      .in('id', validIds)

    if (updateError) return { error: updateError.message }

    // Parallel: historial inserts + notifications (don't block each other)
    await Promise.all([
      ...periodos.map(p => insertHistorial(supabase, p.id, p.estado as EstadoPeriodo, 'aprobado', usuario.id)),
      Promise.allSettled(
        periodos.map(async (p) => {
          const contrato = p.contrato as unknown as { numero: string; contratista_id: string } | null
          if (!contrato?.contratista_id) return
          await enviarNotificacion({
            destinatarioId: contrato.contratista_id,
            tipo: 'aprobado',
            titulo: 'Tu informe fue aprobado',
            mensaje: `Tu informe de ${p.mes} ${p.anio} fue aprobado por la secretaria.`,
            periodoId: p.id,
            mes: p.mes,
            anio: p.anio,
            contrato: contrato.numero || '',
            nombreRemitente: usuario.nombre_completo,
          })
        })
      ),
    ])

    validIds.forEach(id => invalidarCachePDF(createAdminSupabaseClient(), id).catch(() => {}))
    revalidar()
    return { data: { aprobados: validIds.length } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Secretary rejects one or more periods back to asesor review (→ enviado).
 * Logs in historial but does NOT notify contratista.
 *
 * Performance: replaces N+1 loop with 3 queries total:
 *   1. SELECT all periods + contract data in one .in() query
 *   2. Single batch UPDATE
 *   3. Batch asesor lookup (one query for all unique dependencias) + parallel notifications
 */
export async function rechazarPeriodos(
  periodoIds: string[],
  motivo: string
): Promise<ActionResult<{ rechazados: number }>> {
  try {
    if (!motivo?.trim()) return { error: 'El motivo de rechazo es obligatorio' }
    if (!periodoIds.length) return { data: { rechazados: 0 } }

    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'supervisor' && usuario.rol !== 'admin') {
      return { error: 'Solo la secretaria puede rechazar informes' }
    }

    // 1 query: fetch all periods + contract info together (exclude historical)
    const { data: periodos, error: fetchError } = await supabase
      .from('periodos')
      .select('id, estado, contrato_id, mes, anio, contrato:contratos(numero, dependencia_id)')
      .in('id', periodoIds)
      .eq('es_historico', false)

    if (fetchError) return { error: fetchError.message }
    if (!periodos || periodos.length === 0) return { data: { rechazados: 0 } }

    // 1 query: batch update
    const { error: updateError } = await supabase
      .from('periodos')
      .update({ estado: 'enviado', motivo_rechazo: motivo.trim() })
      .in('id', periodos.map(p => p.id))

    if (updateError) return { error: updateError.message }

    // Parallel historial inserts
    await Promise.all(
      periodos.map(p => insertHistorial(supabase, p.id, p.estado as EstadoPeriodo, 'enviado', usuario.id, motivo.trim()))
    )

    // 1 query: fetch all asesores for all affected dependencias at once
    const dependenciaIds = [...new Set(
      periodos.map(p => (p.contrato as unknown as { numero: string; dependencia_id: string } | null)?.dependencia_id).filter(Boolean)
    )] as string[]

    if (dependenciaIds.length > 0) {
      const adminClient = createAdminSupabaseClient()
      const { data: asesores } = await adminClient
        .from('usuarios')
        .select('id, dependencia_id')
        .eq('rol', 'asesor')
        .in('dependencia_id', dependenciaIds)

      if (asesores && asesores.length > 0) {
        await Promise.allSettled(
          periodos.map(async (p) => {
            const contrato = p.contrato as unknown as { numero: string; dependencia_id: string } | null
            if (!contrato?.dependencia_id) return
            const asesorIds = asesores
              .filter(a => a.dependencia_id === contrato.dependencia_id)
              .map(a => a.id)
            if (!asesorIds.length) return
            await enviarNotificacionMultiple(asesorIds, {
              tipo: 'rechazado',
              titulo: `Informe devuelto por secretaría — ${p.mes} ${p.anio}`,
              mensaje: `La secretaría devolvió el informe de ${p.mes} ${p.anio}: ${motivo.trim()}`,
              periodoId: p.id,
              mes: p.mes,
              anio: p.anio,
              contrato: contrato.numero || '',
              motivo: motivo.trim(),
              nombreRemitente: usuario.nombre_completo,
            })
          })
        )
      }
    }

    periodos.forEach(p => invalidarCachePDF(createAdminSupabaseClient(), p.id).catch(() => {}))
    revalidar()
    return { data: { rechazados: periodos.length } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Asesor or secretary marks an approved period as radicado (physically filed).
 * Optionally stores the radicado number and notifies the contratista.
 */
export async function marcarRadicado(
  periodoId: string,
  numeroRadicado?: string
): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'admin' && usuario.rol !== 'asesor' && usuario.rol !== 'supervisor') {
      return { error: 'Solo el asesor, la secretaria o el admin pueden radicar periodos' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }
    if (periodo.es_historico) return { error: 'No se puede modificar un periodo histórico' }

    if (periodo.estado !== 'aprobado') {
      return { error: 'Solo se pueden radicar los periodos aprobados' }
    }

    const estadoAnterior = periodo.estado
    // Use admin client: RLS does not cover aprobado → radicado transition.
    // Optimistic lock: WHERE estado = 'aprobado' ensures concurrent calls don't
    // silently overwrite each other — if another request already radicó this
    // period, the update matches 0 rows and we return a clear error.
    const adminClient = createAdminSupabaseClient()
    const { error, data: updated } = await adminClient
      .from('periodos')
      .update({
        estado: 'radicado',
        ...(numeroRadicado?.trim() ? { numero_radicado: numeroRadicado.trim() } : {}),
      })
      .eq('id', periodoId)
      .eq('estado', 'aprobado')   // optimistic lock
      .select('id')

    if (error) return { error: `Error al radicar: ${error.message}` }
    if (!updated || updated.length === 0) {
      return { error: 'Este periodo ya fue radicado por otra acción simultánea' }
    }

    const comentario = numeroRadicado?.trim()
      ? `Radicado con No. ${numeroRadicado.trim()}`
      : undefined
    await insertHistorial(supabase, periodoId, estadoAnterior, 'radicado', usuario.id, comentario)

    // Notify contratista
    const contrato = await getContratoIds(supabase, periodo.contrato_id)
    if (contrato?.contratista_id) {
      const mensaje = numeroRadicado?.trim()
        ? `Tu informe ha sido radicado con el No. ${numeroRadicado.trim()}.`
        : `Tu informe de ${periodo.mes} ${periodo.anio} ha sido radicado exitosamente.`
      await enviarNotificacion({
        destinatarioId: contrato.contratista_id,
        tipo: 'radicado',
        titulo: 'Informe radicado',
        mensaje,
        periodoId,
        mes: periodo.mes,
        anio: periodo.anio,
        contrato: contrato.numero || '',
        numeroRadicado: numeroRadicado?.trim(),
        nombreRemitente: usuario.nombre_completo,
      })
    }

    invalidarCachePDF(adminClient, periodoId).catch(() => {})
    revalidar(periodo.contrato_id, periodoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Planilla review ─────────────────────────────────────────

/**
 * Asesor reviews the planilla de seguridad social.
 */
export async function revisarPlanilla(
  periodoId: string,
  estado: 'aprobada' | 'rechazada',
  comentario?: string
): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'asesor' && usuario.rol !== 'admin') {
      return { error: 'Solo los asesores pueden revisar la planilla' }
    }

    const { error } = await supabase
      .from('periodos')
      .update({
        planilla_estado: estado,
        planilla_comentario: comentario?.trim() ?? null,
      })
      .eq('id', periodoId)

    if (error) return { error: `Error al revisar planilla: ${error.message}` }

    revalidar(undefined, periodoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── File upload actions ────────────────────────────────────

/**
 * Upload planilla de seguridad social for a period.
 */
export async function subirPlanilla(
  periodoId: string,
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'contratista' && usuario.rol !== 'admin') {
      return { error: 'Solo el contratista puede subir la planilla' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }
    if (periodo.es_historico) return { error: 'No se puede modificar un periodo histórico' }

    if (!ESTADOS_PLANILLA_EDITABLE.includes(periodo.estado)) {
      return { error: 'No se puede reemplazar la planilla de un periodo ya aprobado o radicado' }
    }

    const file = formData.get('file') as File
    if (!file) return { error: 'No se recibió el archivo' }

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (file.type !== 'application/pdf' && ext !== 'pdf') {
      return { error: 'Solo se aceptan archivos PDF para la planilla de seguridad social' }
    }

    if (file.size > 10 * 1024 * 1024) {
      return { error: 'El archivo no puede superar 10 MB' }
    }
    const path = `planillas/${periodoId}/${Date.now()}.pdf`

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(path, buffer, { contentType: file.type, upsert: true })

    if (uploadError) return { error: `Error al subir: ${uploadError.message}` }

    const { data: { publicUrl } } = supabase.storage
      .from('documentos')
      .getPublicUrl(path)

    // Use admin client to bypass RLS (planilla is editable across multiple states)
    const adminClient = createAdminSupabaseClient()
    const { error: updateError } = await adminClient
      .from('periodos')
      .update({ planilla_ss_url: publicUrl })
      .eq('id', periodoId)

    if (updateError) return { error: `Error al guardar: ${updateError.message}` }

    revalidar(periodo.contrato_id, periodoId)
    return { data: { url: publicUrl } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/** States where contratista can still manage their planilla (anything before final approval). */
const ESTADOS_PLANILLA_EDITABLE: EstadoPeriodo[] = ['borrador', 'enviado', 'revision', 'rechazado']

/**
 * Delete the planilla de seguridad social for a period (set URL to null).
 * Allowed until the period is fully approved or radicado.
 */
export async function eliminarPlanilla(periodoId: string): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'contratista' && usuario.rol !== 'admin') {
      return { error: 'Solo el contratista puede eliminar la planilla' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }
    if (periodo.es_historico) return { error: 'No se puede modificar un periodo histórico' }

    if (!ESTADOS_PLANILLA_EDITABLE.includes(periodo.estado)) {
      return { error: 'No se puede eliminar la planilla de un periodo ya aprobado o radicado' }
    }

    const adminClient = createAdminSupabaseClient()
    const { error } = await adminClient
      .from('periodos')
      .update({ planilla_ss_url: null, numero_planilla: null, planilla_estado: 'pendiente' })
      .eq('id', periodoId)

    if (error) return { error: `Error al eliminar: ${error.message}` }

    revalidar(periodo.contrato_id, periodoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Save numero_planilla for a period.
 */
export async function guardarNumeroPlanilla(
  periodoId: string,
  numeroPlanilla: string
): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'contratista' && usuario.rol !== 'admin') {
      return { error: 'Solo el contratista puede actualizar el número de planilla' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }
    if (periodo.es_historico) return { error: 'No se puede modificar un periodo histórico' }

    if (!ESTADOS_PLANILLA_EDITABLE.includes(periodo.estado)) {
      return { error: 'No se puede modificar la planilla de un periodo ya aprobado o radicado' }
    }

    const adminClient = createAdminSupabaseClient()
    const { error } = await adminClient
      .from('periodos')
      .update({ numero_planilla: numeroPlanilla.trim() })
      .eq('id', periodoId)

    if (error) return { error: `Error al guardar: ${error.message}` }

    revalidar(periodo.contrato_id, periodoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Upload user signature image.
 * Contratista can upload their own, admin can upload anyone's.
 */
export async function subirFirma(
  formData: FormData,
  targetUserId?: string
): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase, usuario } = await getAuthContext()

    // Only contratista (own) or admin (anyone) can upload
    const uploadForId = targetUserId || usuario.id
    if (usuario.rol !== 'admin' && uploadForId !== usuario.id) {
      return { error: 'Solo puedes subir tu propia firma' }
    }

    const file = formData.get('file') as File
    if (!file) return { error: 'No se recibió el archivo' }

    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED_MIME.includes(file.type)) {
      return { error: 'Solo se permiten imágenes (JPG, PNG, WEBP)' }
    }

    if (file.size > 3 * 1024 * 1024) {
      return { error: 'La firma no puede superar 3 MB' }
    }

    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : 'png'
    const path = `firmas/${uploadForId}/${Date.now()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(path, buffer, { contentType: file.type, upsert: true })

    if (uploadError) return { error: `Error al subir: ${uploadError.message}` }

    const { data: { publicUrl } } = supabase.storage
      .from('documentos')
      .getPublicUrl(path)

    const adminClient = createAdminSupabaseClient()
    const { error: updateError } = await adminClient
      .from('usuarios')
      .update({ firma_url: publicUrl })
      .eq('id', uploadForId)

    if (updateError) return { error: `Error al guardar firma: ${updateError.message}` }

    revalidatePath('/dashboard')
    return { data: { url: publicUrl } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Update the radicado number of an already-radicado period.
 * Does NOT change the estado — only updates numero_radicado.
 * Allowed for asesor, supervisor, and admin.
 */
export async function actualizarNumeroRadicado(
  periodoId: string,
  numeroRadicado: string
): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'admin' && usuario.rol !== 'asesor' && usuario.rol !== 'supervisor') {
      return { error: 'Solo el asesor, la secretaria o el admin pueden editar el número de radicado' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }

    if (periodo.estado !== 'radicado') {
      return { error: 'Solo se puede editar el número de radicado de un periodo ya radicado' }
    }

    const adminClient = createAdminSupabaseClient()
    const { error } = await adminClient
      .from('periodos')
      .update({ numero_radicado: numeroRadicado.trim() || null })
      .eq('id', periodoId)

    if (error) return { error: `Error al actualizar radicado: ${error.message}` }

    await insertHistorial(
      supabase, periodoId,
      'radicado', 'radicado',
      usuario.id,
      `Número de radicado actualizado a: ${numeroRadicado.trim() || '(eliminado)'}`
    )

    revalidar(periodo.contrato_id, periodoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Admin: Historical period management ────────────────────

/**
 * Mark a period as historical (immutable). Admin-only.
 */
export async function marcarComoHistorico(
  periodoId: string,
  nota?: string
): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()
    if (usuario.rol !== 'admin') return { error: 'Solo el administrador puede marcar periodos como históricos' }

    const adminClient = createAdminSupabaseClient()
    const { error } = await adminClient
      .from('periodos')
      .update({
        es_historico: true,
        historico_marcado_por: usuario.id,
        historico_marcado_at: new Date().toISOString(),
        historico_nota: nota?.trim() || null,
      })
      .eq('id', periodoId)

    if (error) return { error: `Error al marcar como histórico: ${error.message}` }

    await insertHistorial(supabase, periodoId, null, null, usuario.id, `Periodo marcado como histórico${nota ? ': ' + nota : ''}`)
    revalidatePath('/dashboard/admin/historicos')
    revalidatePath('/dashboard/informes')
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Remove historical flag from a period. Admin-only.
 */
export async function desmarcarHistorico(periodoId: string): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()
    if (usuario.rol !== 'admin') return { error: 'Solo el administrador puede desmarcar periodos históricos' }

    const adminClient = createAdminSupabaseClient()
    const { error } = await adminClient
      .from('periodos')
      .update({
        es_historico: false,
        historico_marcado_por: null,
        historico_marcado_at: null,
        historico_nota: null,
      })
      .eq('id', periodoId)

    if (error) return { error: `Error al desmarcar histórico: ${error.message}` }

    await insertHistorial(supabase, periodoId, null, null, usuario.id, 'Periodo desmarcado como histórico')
    revalidatePath('/dashboard/admin/historicos')
    revalidatePath('/dashboard/informes')
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
