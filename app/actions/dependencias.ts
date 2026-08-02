'use server'

/**
 * Server Actions: dependencias (secretarías) del municipio.
 *
 * Existían solo como filas sembradas por migración: la aplicación las exigía
 * al crear un contrato pero no ofrecía forma de crearlas ni corregirlas, así
 * que una secretaría nueva obligaba a entrar a la base de datos.
 *
 * Las gestiona quien gestiona contratos (admin y contratación), porque es
 * quien descubre que falta una justo al ir a registrar el contrato.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { normalizeName } from '@/lib/format'
import { esGestorContratos } from '@/lib/constants'
import { revalidatePath } from 'next/cache'
import type { ActionResult, Rol } from '@/lib/types'

export interface DependenciaDetalle {
  id: string
  nombre: string
  abreviatura: string | null
  /** Titular de la secretaría — quien supervisa sus contratos. */
  supervisor: { id: string; nombre_completo: string; cargo: string | null; foto_url: string | null } | null
  contratos: number
  usuarios: number
}

async function requireGestor(): Promise<{ userId: string; municipioId: string } | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('usuarios').select('rol, municipio_id').eq('id', user.id).single()
  if (!esGestorContratos(data?.rol as Rol)) return null
  return { userId: user.id, municipioId: data!.municipio_id as string }
}

// ── Lectura ──────────────────────────────────────────────────────────────────

export async function listarDependencias(): Promise<DependenciaDetalle[]> {
  const gestor = await requireGestor()
  if (!gestor) return []

  const admin = createAdminSupabaseClient()
  const [{ data: deps }, { data: users }, { data: contratos }] = await Promise.all([
    admin.from('dependencias').select('id, nombre, abreviatura').order('nombre'),
    admin.from('usuarios').select('id, nombre_completo, cargo, foto_url, rol, dependencia_id'),
    admin.from('contratos').select('dependencia_id'),
  ])

  const porDep = new Map<string, { usuarios: number; supervisor: DependenciaDetalle['supervisor'] }>()
  for (const u of (users ?? []) as any[]) {
    if (!u.dependencia_id) continue
    const acc = porDep.get(u.dependencia_id) ?? { usuarios: 0, supervisor: null }
    acc.usuarios++
    // Se queda con el primero: en la práctica cada secretaría tiene un titular.
    if (u.rol === 'supervisor' && !acc.supervisor) {
      acc.supervisor = { id: u.id, nombre_completo: u.nombre_completo, cargo: u.cargo, foto_url: u.foto_url }
    }
    porDep.set(u.dependencia_id, acc)
  }

  const contratosPorDep = new Map<string, number>()
  for (const c of (contratos ?? []) as { dependencia_id: string }[]) {
    contratosPorDep.set(c.dependencia_id, (contratosPorDep.get(c.dependencia_id) ?? 0) + 1)
  }

  return ((deps ?? []) as any[]).map(d => ({
    id: d.id,
    nombre: d.nombre,
    abreviatura: d.abreviatura,
    supervisor: porDep.get(d.id)?.supervisor ?? null,
    contratos: contratosPorDep.get(d.id) ?? 0,
    usuarios: porDep.get(d.id)?.usuarios ?? 0,
  }))
}

// ── Escritura ────────────────────────────────────────────────────────────────

function validarNombre(nombre: string): string | null {
  const limpio = normalizeName(nombre)
  if (limpio.length < 4) return null
  return limpio
}

export async function crearDependencia(
  nombre: string,
  abreviatura?: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const gestor = await requireGestor()
    if (!gestor) return { error: 'No autorizado' }

    const limpio = validarNombre(nombre)
    if (!limpio) return { error: 'El nombre debe tener al menos 4 caracteres.' }

    const admin = createAdminSupabaseClient()

    // Dos secretarías con el mismo nombre harían ambigua la selección en el
    // formulario de contrato y en los encabezados de los documentos.
    const { data: existente } = await admin
      .from('dependencias').select('id').ilike('nombre', limpio).maybeSingle()
    if (existente) return { error: `Ya existe una dependencia llamada "${limpio}".` }

    const { data, error } = await admin
      .from('dependencias')
      .insert({
        nombre: limpio,
        abreviatura: abreviatura?.trim().toUpperCase() || null,
        municipio_id: gestor.municipioId,
      })
      .select('id')
      .single()

    if (error || !data) return { error: error?.message ?? 'No se pudo crear la dependencia' }

    revalidatePath('/dashboard/dependencias')
    revalidatePath('/dashboard/contratos/nuevo')
    return { data: { id: data.id } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

export async function actualizarDependencia(
  id: string,
  nombre: string,
  abreviatura?: string,
): Promise<ActionResult> {
  try {
    const gestor = await requireGestor()
    if (!gestor) return { error: 'No autorizado' }

    const limpio = validarNombre(nombre)
    if (!limpio) return { error: 'El nombre debe tener al menos 4 caracteres.' }

    const admin = createAdminSupabaseClient()

    const { data: choque } = await admin
      .from('dependencias').select('id').ilike('nombre', limpio).neq('id', id).maybeSingle()
    if (choque) return { error: `Ya existe otra dependencia llamada "${limpio}".` }

    const { error } = await admin
      .from('dependencias')
      .update({ nombre: limpio, abreviatura: abreviatura?.trim().toUpperCase() || null })
      .eq('id', id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/dependencias')
    revalidatePath('/dashboard/contratos', 'layout')
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Elimina una dependencia vacía.
 *
 * Se comprueba antes de borrar, aunque las claves foráneas ya lo impedirían:
 * el error de Postgres no le dice al usuario CUÁNTOS contratos lo impiden, y
 * ese número es justo lo que necesita para decidir si reasignarlos.
 */
export async function eliminarDependencia(id: string): Promise<ActionResult> {
  try {
    const gestor = await requireGestor()
    if (!gestor) return { error: 'No autorizado' }

    const admin = createAdminSupabaseClient()
    const [{ count: contratos }, { count: usuarios }] = await Promise.all([
      admin.from('contratos').select('id', { count: 'exact', head: true }).eq('dependencia_id', id),
      admin.from('usuarios').select('id', { count: 'exact', head: true }).eq('dependencia_id', id),
    ])

    if ((contratos ?? 0) > 0 || (usuarios ?? 0) > 0) {
      const partes = [
        (contratos ?? 0) > 0 ? `${contratos} contrato(s)` : null,
        (usuarios ?? 0) > 0 ? `${usuarios} usuario(s)` : null,
      ].filter(Boolean).join(' y ')
      return { error: `No se puede eliminar: tiene ${partes} asociados. Reasígnalos primero.` }
    }

    const { error } = await admin.from('dependencias').delete().eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/dashboard/dependencias')
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
