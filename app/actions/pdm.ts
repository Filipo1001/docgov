'use server'

/**
 * ¿Debe la barra lateral mostrar el botón de Plan de Desarrollo?
 *
 * La barra es un componente de cliente y `VERCEL_ENV` solo existe en el
 * servidor, así que la pregunta se hace por aquí. Responde únicamente a
 * administradores con sesión y, además, solo donde el módulo existe (ver
 * `pdmHabilitado`).
 *
 * Es una acción y no una variable pública a propósito: una variable pública se
 * fija al compilar y la decisión de «¿estamos en vista previa?» la toma el
 * servidor en cada petición, con la misma función que cierra la página. El
 * botón y la página no pueden discrepar porque leen lo mismo.
 *
 * Devuelve un booleano y nada más: no expone quién es el usuario ni por qué se
 * negó. Ante cualquier duda —sin sesión, rol distinto, error de lectura— la
 * respuesta es `false`, que es el estado seguro.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { pdmHabilitado } from '@/lib/pdm/habilitado'
import { revalidatePath } from 'next/cache'
import {
  errorEnLista, errorEnMotivo, esUuid, traducirErrorPdm,
  MAX_INDICADORES, MAX_MIEMBROS, MAX_NOMBRE_GRUPO,
  type EntradaAsignarGrupo, type EntradaAsignarPersona, type EntradaEliminarGrupo,
  type EntradaGuardarGrupo, type EntradaQuitarApoyo, type Resultado, type ResumenCambio,
} from '@/lib/pdm/acciones'

export async function moduloPdmVisible(): Promise<boolean> {
  try {
    if (!pdmHabilitado()) return false

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data: yo } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    return yo?.rol === 'admin'
  } catch {
    return false
  }
}

// ─── Repartir indicadores ─────────────────────────────────────────────────────
//
// Las cinco acciones del administrador. Todas siguen el mismo camino y ninguna se
// salta una puerta:
//
//   1. `pdmHabilitado()`: fuera de la vista previa (producción) no hacen nada.
//   2. Sesión y rol de administrador, leídos del servidor y no del navegador.
//   3. Se valida lo que llega (ids, tamaños) ANTES de preguntarle nada a la base.
//   4. La base decide: llaman a funciones SECURITY INVOKER (migración 052) con la
//      sesión de quien pide, así que mandan las políticas de la migración 050.
//      Aunque alguien invocara esto a mano sin ser administrador, la base lo negaría.
//   5. La bitácora (`pdm_historial`) la escribe un disparador de la base, no estas
//      funciones: no hay manera de cambiar una asignación sin que quede rastro.
//
// Nunca devuelven el error crudo de la base: `traducirErrorPdm` deja pasar solo los
// mensajes escritos para leerse.

const SIN_PERMISO = 'No tienes permiso para hacer este cambio.'

/** El cliente de Supabase con la sesión del administrador, o `null` si no corresponde. */
async function sesionAdminPdm() {
  if (!pdmHabilitado()) return null
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: yo } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  return yo?.rol === 'admin' ? supabase : null
}

const REFRESCO = '/dashboard/plan-desarrollo'
const refrescar = () => revalidatePath(REFRESCO, 'layout')

function resumenDe(datos: unknown): ResumenCambio {
  const d = (datos ?? {}) as Record<string, unknown>
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0)
  return { cambiados: n('cambiados'), sinCambio: n('sin_cambio'), pasadosAApoyo: n('pasados_a_apoyo'), quitados: n('quitados') }
}

const motivoDe = (m?: string) => (m && m.trim() ? m.trim() : null)

export async function asignarPersona(e: EntradaAsignarPersona): Promise<Resultado<ResumenCambio>> {
  try {
    const supabase = await sesionAdminPdm()
    if (!supabase) return { ok: false, error: SIN_PERMISO }
    const mal = errorEnLista(e?.indicadores, MAX_INDICADORES, 'al menos un indicador')
      ?? (!esUuid(e?.usuario) ? 'Falta elegir a la persona.' : null)
      ?? (e.anterior !== 'apoyo' && e.anterior !== 'quitar' ? 'Algo de lo elegido no es válido.' : null)
      ?? errorEnMotivo(e.motivo)
    if (mal) return { ok: false, error: mal }

    const { data, error } = await supabase.rpc('pdm_asignar', {
      p_indicadores: e.indicadores, p_usuario: e.usuario, p_principal: e.principal === true,
      p_anterior: e.anterior, p_motivo: motivoDe(e.motivo),
    })
    if (error) return { ok: false, error: traducirErrorPdm(error.code, error.message) }
    refrescar()
    return { ok: true, datos: resumenDe(data) }
  } catch (err) {
    console.error('[pdm/acciones] asignarPersona:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}

export async function asignarGrupo(e: EntradaAsignarGrupo): Promise<Resultado<ResumenCambio>> {
  try {
    const supabase = await sesionAdminPdm()
    if (!supabase) return { ok: false, error: SIN_PERMISO }
    const mal = errorEnLista(e?.indicadores, MAX_INDICADORES, 'al menos un indicador')
      ?? (!esUuid(e?.grupo) ? 'Falta elegir el grupo.' : null)
      ?? (e.anterior !== 'apoyo' && e.anterior !== 'quitar' ? 'Algo de lo elegido no es válido.' : null)
      ?? errorEnMotivo(e.motivo)
    if (mal) return { ok: false, error: mal }

    const { data, error } = await supabase.rpc('pdm_asignar_grupo', {
      p_indicadores: e.indicadores, p_grupo: e.grupo, p_anterior: e.anterior, p_motivo: motivoDe(e.motivo),
    })
    if (error) return { ok: false, error: traducirErrorPdm(error.code, error.message) }
    refrescar()
    return { ok: true, datos: resumenDe(data) }
  } catch (err) {
    console.error('[pdm/acciones] asignarGrupo:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}

export async function quitarApoyo(e: EntradaQuitarApoyo): Promise<Resultado<ResumenCambio>> {
  try {
    const supabase = await sesionAdminPdm()
    if (!supabase) return { ok: false, error: SIN_PERMISO }
    const mal = errorEnLista(e?.indicadores, MAX_INDICADORES, 'al menos un indicador')
      ?? (!esUuid(e?.usuario) ? 'Falta elegir a la persona.' : null)
      ?? errorEnMotivo(e.motivo)
    if (mal) return { ok: false, error: mal }

    const { data, error } = await supabase.rpc('pdm_quitar', {
      p_indicadores: e.indicadores, p_usuario: e.usuario, p_motivo: motivoDe(e.motivo),
    })
    if (error) return { ok: false, error: traducirErrorPdm(error.code, error.message) }
    refrescar()
    return { ok: true, datos: resumenDe(data) }
  } catch (err) {
    console.error('[pdm/acciones] quitarApoyo:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}

export async function guardarGrupo(e: EntradaGuardarGrupo): Promise<Resultado<{ grupo: string }>> {
  try {
    const supabase = await sesionAdminPdm()
    if (!supabase) return { ok: false, error: SIN_PERMISO }
    const nombre = typeof e?.nombre === 'string' ? e.nombre.trim() : ''
    const mal = (e.grupo !== undefined && !esUuid(e.grupo) ? 'Algo de lo elegido no es válido.' : null)
      ?? (nombre === '' ? 'El grupo necesita un nombre.' : null)
      ?? (nombre.length > MAX_NOMBRE_GRUPO ? `El nombre no puede pasar de ${MAX_NOMBRE_GRUPO} caracteres.` : null)
      ?? (!esUuid(e.secretaria) ? 'Falta elegir la secretaría.' : null)
      ?? (!esUuid(e.lider) ? 'El grupo necesita un líder.' : null)
      ?? errorEnLista(e.miembros, MAX_MIEMBROS, 'a quienes forman el grupo')
      ?? errorEnMotivo(e.motivo)
    if (mal) return { ok: false, error: mal }

    const { data, error } = await supabase.rpc('pdm_grupo_guardar', {
      p_grupo: e.grupo ?? null, p_nombre: nombre, p_dependencia: e.secretaria, p_lider: e.lider,
      p_miembros: e.miembros, p_motivo: motivoDe(e.motivo),
    })
    if (error) return { ok: false, error: traducirErrorPdm(error.code, error.message) }
    if (!esUuid(data)) return { ok: false, error: traducirErrorPdm() }
    refrescar()
    return { ok: true, datos: { grupo: data } }
  } catch (err) {
    console.error('[pdm/acciones] guardarGrupo:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}

export async function eliminarGrupo(e: EntradaEliminarGrupo): Promise<Resultado> {
  try {
    const supabase = await sesionAdminPdm()
    if (!supabase) return { ok: false, error: SIN_PERMISO }
    const mal = (!esUuid(e?.grupo) ? 'Algo de lo elegido no es válido.' : null) ?? errorEnMotivo(e.motivo)
    if (mal) return { ok: false, error: mal }

    const { error } = await supabase.rpc('pdm_grupo_eliminar', { p_grupo: e.grupo, p_motivo: motivoDe(e.motivo) })
    if (error) return { ok: false, error: traducirErrorPdm(error.code, error.message) }
    refrescar()
    return { ok: true, datos: undefined }
  } catch (err) {
    console.error('[pdm/acciones] eliminarGrupo:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}
