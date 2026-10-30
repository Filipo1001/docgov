'use server'

/**
 * Server Actions: terminación anticipada de un contrato (migración 081).
 *
 * La registran admin y contratación en cualquier contrato, y el supervisor en los suyos
 * (`puedeGestionarTerminacion`). Los efectos —anular los periodos posteriores, recortar el que contiene el último día,
 * marcar el contrato y dejar constancia— los hace la base en una sola transacción (`terminar_contrato`), con el cliente
 * administrador, como `aplicar_otrosi`: la sesión del usuario no puede tocar esas columnas de `periodos` (065), y la
 * decisión de quién puede la toma este archivo. La base vuelve a comprobar todo lo que importa (fechas, causal, lo ya
 * presentado) y se niega con un mensaje que se muestra tal cual.
 *
 * Después avisa al contratista, al supervisor y a contratación: la terminación es un hecho que les cambia el trabajo.
 */

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { enviarNotificacion } from '@/lib/notifications'
import { invalidarCachePDF } from '@/lib/pdf/cache'
import type { ActionResult, Rol } from '@/lib/types'
import {
  causalTerminacion,
  fechaLarga,
  planDeTerminacion,
  puedeGestionarTerminacion,
  type PeriodoParaTerminar,
  type PlanTerminacion,
} from '@/lib/terminacion-contrato'

type Admin = ReturnType<typeof createAdminSupabaseClient>

interface ContratoParaTerminar {
  id: string
  numero: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_mensual: number | null
  estado: string
  supervisor_id: string | null
  contratista_id: string | null
  fecha_terminacion: string | null
}

async function quienEs(): Promise<{ id: string; rol: Rol } | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  return data?.rol ? { id: user.id, rol: data.rol as Rol } : null
}

/** El contrato, si existe y quien pregunta puede gestionar su terminación. */
async function contratoGestionable(
  admin: Admin,
  contratoId: string,
): Promise<{ yo: { id: string; rol: Rol }; contrato: ContratoParaTerminar } | { error: string }> {
  const yo = await quienEs()
  if (!yo) return { error: 'Sesión expirada. Recarga la página.' }
  const { data } = await admin
    .from('contratos')
    .select('id, numero, anio, fecha_inicio, fecha_fin, valor_mensual, estado, supervisor_id, contratista_id, fecha_terminacion')
    .eq('id', contratoId)
    .maybeSingle()
  if (!data) return { error: 'Contrato no encontrado' }
  const contrato = data as ContratoParaTerminar
  if (!puedeGestionarTerminacion(yo.rol, yo.id, contrato)) {
    return { error: 'Solo administración, contratación o el supervisor del contrato registran su terminación.' }
  }
  return { yo, contrato }
}

function mensajeDeLaBase(error: { message?: string } | null, porDefecto: string): string {
  const m = error?.message ?? ''
  return m.startsWith('TERMINACION: ') ? m.slice('TERMINACION: '.length) : porDefecto
}

function revalidar(contratoId: string) {
  revalidatePath(`/dashboard/contratos/${contratoId}`)
  revalidatePath('/dashboard/contratos', 'layout')
  revalidatePath('/dashboard')
}

// ─── Lo que se ve antes de confirmar ──────────────────────────────────────────

/** Qué pasaría si el contrato terminara ese día: qué se anula, qué se recorta y por cuánto, qué lo impide. */
export async function previsualizarTerminacion(
  contratoId: string,
  fecha: string,
): Promise<ActionResult<PlanTerminacion>> {
  try {
    const admin = createAdminSupabaseClient()
    const r = await contratoGestionable(admin, contratoId)
    if ('error' in r) return { error: r.error }
    if (!['vigente', 'suspendido'].includes(r.contrato.estado)) {
      return { error: 'Este contrato ya no está vigente: solo se termina uno vigente o suspendido.' }
    }

    const { data: periodos, error } = await admin
      .from('periodos')
      .select('id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado, es_historico')
      .eq('contrato_id', contratoId)
    if (error) return { error: error.message }

    return { data: planDeTerminacion(r.contrato, (periodos ?? []) as PeriodoParaTerminar[], fecha) }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Registrar ────────────────────────────────────────────────────────────────

export interface RegistrarTerminacionInput {
  contratoId: string
  causal: string
  /** Último día de ejecución. */
  fecha: string
  fechaActo?: string | null
  numeroActo?: string | null
  observacion?: string | null
  /** Valor del periodo que queda recortado; se ignora si ninguno se recorta. */
  valorAjustado?: number | null
}

export async function registrarTerminacion(
  input: RegistrarTerminacionInput,
): Promise<ActionResult<{ anulados: number; actasSinEfecto: number }>> {
  try {
    const admin = createAdminSupabaseClient()
    const r = await contratoGestionable(admin, input.contratoId)
    if ('error' in r) return { error: r.error }
    const { yo, contrato } = r

    const causal = causalTerminacion(input.causal)
    if (!causal) return { error: 'Elige la causal de la terminación.' }
    if (!input.fecha) return { error: 'Indica el último día de ejecución.' }
    const observacion = input.observacion?.trim() || null
    if (causal.id === 'otra' && !observacion) return { error: 'Con «Otra causal» explica cuál en la observación.' }
    if (input.valorAjustado != null && (!Number.isFinite(input.valorAjustado) || input.valorAjustado < 0)) {
      return { error: 'El valor del periodo recortado debe ser 0 o mayor.' }
    }

    const { data, error } = await admin.rpc('terminar_contrato', {
      p_contrato: contrato.id,
      p_causal: causal.id,
      p_fecha: input.fecha,
      p_fecha_acto: input.fechaActo || null,
      p_numero_acto: input.numeroActo?.trim() || null,
      p_observacion: observacion,
      p_valor_ajustado: input.valorAjustado ?? null,
      p_usuario: yo.id,
    })
    if (error) return { error: mensajeDeLaBase(error, `No se pudo registrar la terminación: ${error.message}`) }

    const res = (data ?? {}) as { anulados?: number; actas_sin_efecto?: number; ajustado?: { periodo?: string } | null }
    // El periodo recortado cambió de fechas y de valor: sus PDF en caché (si alguno se generó en borrador) ya no sirven.
    if (res.ajustado?.periodo) await invalidarCachePDF(admin, res.ajustado.periodo).catch(() => {})

    await avisarTerminacion(admin, contrato, yo.id, {
      tipo: 'contrato_terminado',
      titulo: `Contrato ${contrato.numero} terminado anticipadamente`,
      mensaje:
        `El contrato ${contrato.numero} terminó anticipadamente: su último día de ejecución fue el ${fechaLarga(input.fecha)} ` +
        `(${causal.nombre}). Los informes hasta ese día siguen pendientes; los meses posteriores quedaron anulados y no ` +
        `generan más avisos.`,
    })

    revalidar(contrato.id)
    return { data: { anulados: Number(res.anulados ?? 0), actasSinEfecto: Number(res.actas_sin_efecto ?? 0) } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Deshacer ─────────────────────────────────────────────────────────────────

export async function revertirTerminacion(
  contratoId: string,
  motivo: string,
): Promise<ActionResult<{ repuestos: number }>> {
  try {
    const admin = createAdminSupabaseClient()
    const r = await contratoGestionable(admin, contratoId)
    if ('error' in r) return { error: r.error }
    const { yo, contrato } = r
    if (!motivo.trim()) return { error: 'Indica por qué se deshace: queda en el historial del contrato.' }

    const { data: vigente } = await admin
      .from('contrato_terminaciones')
      .select('periodo_ajustado_id')
      .eq('contrato_id', contratoId)
      .is('revertida_en', null)
      .maybeSingle()

    const { data, error } = await admin.rpc('revertir_terminacion', {
      p_contrato: contratoId,
      p_motivo: motivo.trim(),
      p_usuario: yo.id,
    })
    if (error) return { error: mensajeDeLaBase(error, `No se pudo deshacer la terminación: ${error.message}`) }

    if (vigente?.periodo_ajustado_id) {
      await invalidarCachePDF(admin, vigente.periodo_ajustado_id as string).catch(() => {})
    }

    await avisarTerminacion(admin, contrato, yo.id, {
      tipo: 'contrato_terminacion_revertida',
      titulo: `Se deshizo la terminación del contrato ${contrato.numero}`,
      mensaje:
        `La terminación anticipada del contrato ${contrato.numero} se deshizo (${motivo.trim()}). ` +
        `El contrato vuelve a ir hasta el ${fechaLarga(contrato.fecha_fin)} y sus periodos vuelven a estar como estaban.`,
    })

    revalidar(contratoId)
    const res = (data ?? {}) as { repuestos?: number }
    return { data: { repuestos: Number(res.repuestos ?? 0) } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Avisa al contratista, al supervisor y a contratación, menos a quien la registró. Nunca bloquea: la terminación ya
 * quedó registrada y un correo que no sale no puede deshacerla.
 */
async function avisarTerminacion(
  admin: Admin,
  contrato: ContratoParaTerminar,
  autorId: string,
  aviso: { tipo: 'contrato_terminado' | 'contrato_terminacion_revertida'; titulo: string; mensaje: string },
) {
  try {
    const { data: contratacion } = await admin.from('usuarios').select('id').eq('rol', 'contratacion').eq('activo', true)
    const destinatarios = [
      contrato.contratista_id,
      contrato.supervisor_id,
      ...((contratacion ?? []) as { id: string }[]).map(u => u.id),
    ].filter((id): id is string => !!id && id !== autorId)

    await Promise.allSettled(
      [...new Set(destinatarios)].map(id => enviarNotificacion({
        destinatarioId: id,
        tipo: aviso.tipo,
        titulo: aviso.titulo,
        mensaje: aviso.mensaje,
        contrato: contrato.numero,
        detalle: aviso.mensaje,
      })),
    )
  } catch {
    /* el aviso no deshace lo registrado */
  }
}

// ─── Lo que muestra la ficha del contrato ─────────────────────────────────────

export interface TerminacionVigente {
  causal: string
  causalNombre: string
  fechaTerminacion: string
  fechaActo: string | null
  numeroActo: string | null
  observacion: string | null
  periodosAnulados: number
  registradaPor: string
  registradaEn: string
}

/**
 * La terminación vigente del contrato, para la ficha. Se lee con la sesión de quien mira: la tabla tiene la misma
 * visibilidad que el contrato (RLS de la 081), así que si ve el contrato ve por qué terminó.
 */
export async function getTerminacionVigente(contratoId: string): Promise<TerminacionVigente | null> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data } = await supabase
      .from('contrato_terminaciones')
      .select('causal, fecha_terminacion, fecha_acto, numero_acto, observacion, periodos_anulados, registrada_en, registrada_por')
      .eq('contrato_id', contratoId)
      .is('revertida_en', null)
      .maybeSingle()
    if (!data) return null

    // El nombre de quien la registró: `usuarios` tiene permisos por columna y RLS propias; se lee con el cliente
    // administrador, que solo devuelve el nombre.
    const admin = createAdminSupabaseClient()
    const { data: autor } = await admin.from('usuarios').select('nombre_completo').eq('id', data.registrada_por).maybeSingle()

    return {
      causal: data.causal as string,
      causalNombre: causalTerminacion(data.causal as string)?.nombre ?? (data.causal as string),
      fechaTerminacion: data.fecha_terminacion as string,
      fechaActo: (data.fecha_acto as string | null) ?? null,
      numeroActo: (data.numero_acto as string | null) ?? null,
      observacion: (data.observacion as string | null) ?? null,
      periodosAnulados: Array.isArray(data.periodos_anulados) ? data.periodos_anulados.length : 0,
      registradaPor: (autor?.nombre_completo as string | undefined) ?? '—',
      registradaEn: data.registrada_en as string,
    }
  } catch {
    return null
  }
}
