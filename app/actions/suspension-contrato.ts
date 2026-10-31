'use server'

/**
 * Server Actions: suspensión y reinicio de un contrato (migración 082).
 *
 * Quién puede: los mismos que registran la terminación (`puedeGestionarTerminacion`): admin y contratación en todos los
 * contratos, el supervisor en los suyos. Los efectos los hace la base en una transacción (`suspender_contrato`,
 * `reiniciar_contrato`); aquí se decide quién y se traducen los mensajes de la base.
 */

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { enviarNotificacion } from '@/lib/notifications'
import type { ActionResult, Rol } from '@/lib/types'
import { fechaLarga, puedeGestionarTerminacion } from '@/lib/terminacion-contrato'

type Admin = ReturnType<typeof createAdminSupabaseClient>

export interface SuspensionAbierta {
  id: string
  fechaInicio: string
  motivo: string
  numeroActo: string | null
  fechaActo: string | null
}

async function quienEs(): Promise<{ id: string; rol: Rol } | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  return data?.rol ? { id: user.id, rol: data.rol as Rol } : null
}

async function contratoGestionable(admin: Admin, contratoId: string) {
  const yo = await quienEs()
  if (!yo) return { error: 'Sesión expirada. Recarga la página.' } as const
  const { data } = await admin
    .from('contratos')
    .select('id, numero, estado, fecha_inicio, fecha_fin_efectiva, contratista_id, supervisor_id')
    .eq('id', contratoId)
    .maybeSingle()
  if (!data) return { error: 'Contrato no encontrado' } as const
  if (!puedeGestionarTerminacion(yo.rol, yo.id, data)) {
    return { error: 'Solo administración, contratación o el supervisor del contrato registran sus suspensiones.' } as const
  }
  return { yo, contrato: data as { id: string; numero: string; estado: string; contratista_id: string | null; supervisor_id: string | null } } as const
}

function mensajeDeLaBase(error: { message?: string } | null, porDefecto: string): string {
  const m = error?.message ?? ''
  return m.startsWith('SUSPENSION: ') ? m.slice('SUSPENSION: '.length) : porDefecto
}

function revalidar(contratoId: string) {
  revalidatePath(`/dashboard/contratos/${contratoId}`)
  revalidatePath('/dashboard/contratos', 'layout')
  revalidatePath('/dashboard')
}

/** La suspensión abierta del contrato, si la hay, para la ficha. */
export async function getSuspensionAbierta(contratoId: string): Promise<SuspensionAbierta | null> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data } = await supabase
      .from('contrato_suspensiones')
      .select('id, fecha_inicio, motivo, numero_acto, fecha_acto')
      .eq('contrato_id', contratoId)
      .is('fecha_reinicio', null)
      .maybeSingle()
    if (!data) return null
    return {
      id: data.id as string,
      fechaInicio: data.fecha_inicio as string,
      motivo: data.motivo as string,
      numeroActo: (data.numero_acto as string | null) ?? null,
      fechaActo: (data.fecha_acto as string | null) ?? null,
    }
  } catch {
    return null
  }
}

export interface RegistrarSuspensionInput {
  contratoId: string
  fecha: string
  motivo: string
  numeroActo?: string | null
  fechaActo?: string | null
}

export async function registrarSuspension(input: RegistrarSuspensionInput): Promise<ActionResult> {
  try {
    const admin = createAdminSupabaseClient()
    const r = await contratoGestionable(admin, input.contratoId)
    if ('error' in r) return { error: r.error }
    if (!input.fecha) return { error: 'Indica la fecha en que se suspende.' }
    if (!input.motivo.trim()) return { error: 'Indica el motivo: queda como constancia en el expediente.' }

    const { error } = await admin.rpc('suspender_contrato', {
      p_contrato: r.contrato.id,
      p_fecha: input.fecha,
      p_motivo: input.motivo.trim(),
      p_numero_acto: input.numeroActo?.trim() || null,
      p_fecha_acto: input.fechaActo || null,
      p_usuario: r.yo.id,
    })
    if (error) return { error: mensajeDeLaBase(error, `No se pudo registrar la suspensión: ${error.message}`) }

    await avisar(admin, r.contrato, r.yo.id, {
      tipo: 'contrato_suspension',
      titulo: `Contrato ${r.contrato.numero} suspendido`,
      mensaje:
        `El contrato ${r.contrato.numero} quedó suspendido desde el ${fechaLarga(input.fecha)} (${input.motivo.trim()}). ` +
        `Mientras dure la suspensión no se piden informes.`,
    })
    revalidar(r.contrato.id)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

export interface ReiniciarSuspensionInput {
  contratoId: string
  fecha: string
  numeroActo?: string | null
  fechaActo?: string | null
}

export async function reiniciarSuspension(input: ReiniciarSuspensionInput): Promise<ActionResult<{ diasSuspendido: number }>> {
  try {
    const admin = createAdminSupabaseClient()
    const r = await contratoGestionable(admin, input.contratoId)
    if ('error' in r) return { error: r.error }
    if (!input.fecha) return { error: 'Indica la fecha de reinicio.' }

    const { data, error } = await admin.rpc('reiniciar_contrato', {
      p_contrato: r.contrato.id,
      p_fecha: input.fecha,
      p_numero_acto: input.numeroActo?.trim() || null,
      p_fecha_acto: input.fechaActo || null,
      p_usuario: r.yo.id,
    })
    if (error) return { error: mensajeDeLaBase(error, `No se pudo registrar el reinicio: ${error.message}`) }

    await avisar(admin, r.contrato, r.yo.id, {
      tipo: 'contrato_reinicio',
      titulo: `Contrato ${r.contrato.numero} reiniciado`,
      mensaje: `El contrato ${r.contrato.numero} se reinició el ${fechaLarga(input.fecha)}. Se retoma la presentación de informes.`,
    })
    revalidar(r.contrato.id)
    const res = (data ?? {}) as { dias_suspendido?: number }
    return { data: { diasSuspendido: Number(res.dias_suspendido ?? 0) } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/** Contratista, supervisor y contratación, menos quien lo registró. Nunca bloquea el registro. */
async function avisar(admin: Admin, contrato: { numero: string; contratista_id: string | null; supervisor_id: string | null }, autorId: string, aviso: { tipo: 'contrato_suspension' | 'contrato_reinicio'; titulo: string; mensaje: string }) {
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
