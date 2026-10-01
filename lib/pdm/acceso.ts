import 'server-only'
import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { pdmHabilitado } from '@/lib/pdm/habilitado'
import { PLAN } from '@/lib/pdm/identidad'
import { ITEM_PLAN_DESARROLLO } from '@/lib/pdm/menu'
import { esNivelHabilitable, gestiona, veDirectorio, type NivelPdm } from '@/lib/pdm/niveles'

export interface AccesoPdm {
  nivel: NivelPdm
  userId: string
  dependenciaId: string | null
}

/**
 * Qué puede hacer en el módulo quien pregunta, o `null` si nada.
 *
 *   · Fuera de vista previa o desarrollo el módulo no existe: `null` para todos, y falla
 *     hacia lo cerrado (ver `pdmHabilitado`).
 *   · El administrador entra por su rol.
 *   · Cualquier otra persona entra solo si tiene una fila en `pdm_permisos`: se lee con SU
 *     sesión, y la política de la base le deja ver únicamente la suya.
 *
 * Ante cualquier error responde `null`, que es el estado seguro. `cache` de React: una sola
 * lectura por petición aunque la pidan varios componentes.
 */
export const accesoPdm = cache(async (): Promise<AccesoPdm | null> => {
  try {
    if (!pdmHabilitado()) return null
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: yo } = await supabase.from('usuarios').select('rol, dependencia_id').eq('id', user.id).single()
    if (!yo) return null
    const dependenciaId = (yo.dependencia_id as string | null) ?? null
    if (yo.rol === 'admin') return { nivel: 'admin', userId: user.id, dependenciaId }

    const { data: permiso } = await supabase.from('pdm_permisos').select('nivel').eq('usuario_id', user.id).maybeSingle()
    return esNivelHabilitable(permiso?.nivel) ? { nivel: permiso.nivel, userId: user.id, dependenciaId } : null
  } catch {
    return null
  }
})

/** Qué se exige para entrar a una pantalla. */
export type Requisito = 'cualquiera' | 'gestor' | 'gestor_o_consulta'

/**
 * La puerta de TODAS las pantallas del módulo.
 *
 * Se llama al principio de cada página y no una vez en un layout: un layout no
 * se vuelve a ejecutar cuando se navega entre sus páginas hijas, así que una
 * comprobación puesta solo ahí protegería la primera pantalla y dejaría abiertas
 * las demás. Con una función y una línea por página, olvidarla salta a la vista.
 *
 * 1. Fuera de vista previa o desarrollo el módulo no existe: 404, y falla hacia
 *    lo cerrado (ver `pdmHabilitado`).
 * 2. Sin sesión, al inicio de sesión. Con sesión pero sin acceso al módulo, al panel.
 * 3. Cada pantalla dice qué nivel exige. Quien tiene acceso pero no el suficiente va al
 *    resumen, que es la pantalla de todos: ninguna pestaña lleva a una puerta cerrada.
 *
 * `connection()` obliga a decidirlo EN CADA PETICIÓN. Sin él, en un entorno donde
 * `pdmHabilitado()` responde «no», `notFound()` se lanza antes de que nada lea
 * las cookies y Next da la página por estática: hornea el 404 al compilar. La
 * decisión quedaría tomada con el entorno de la compilación y no con el de
 * ejecución, que es el que importa.
 */
export async function exigirAccesoPdm(requiere: Requisito = 'cualquiera'): Promise<AccesoPdm> {
  await connection()
  if (!pdmHabilitado()) notFound()

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const acceso = await accesoPdm()
  if (!acceso) redirect('/dashboard')

  const suficiente = requiere === 'cualquiera'
    || (requiere === 'gestor' && gestiona(acceso.nivel))
    || (requiere === 'gestor_o_consulta' && veDirectorio(acceso.nivel))
  if (!suficiente) redirect(ITEM_PLAN_DESARROLLO.href)

  return acceso
}

/**
 * El título de la pestaña del navegador.
 *
 * Next calcula los metadatos de una página AUNQUE su cuerpo termine en 404, así
 * que un `metadata` fijo pondría «Resumen · Por Amor a Fredonia» en la pestaña
 * de quien abra esta dirección en producción, donde el módulo no existe.
 * Pasando por la misma regla que la puerta, allí no dice nada.
 */
export function metadataPdm(seccion: string): Metadata {
  return pdmHabilitado() ? { title: `${seccion} · ${PLAN.nombre}` } : {}
}
