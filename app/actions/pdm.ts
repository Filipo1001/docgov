'use server'

/**
 * ¿Qué puede hacer en el módulo Plan de Desarrollo quien pregunta? `null`: nada, y el botón de
 * la barra lateral no aparece.
 *
 * La barra es un componente de cliente y `VERCEL_ENV` solo existe en el servidor, así que la
 * pregunta se hace por aquí. Es una acción y no una variable pública a propósito: una variable
 * pública se fija al compilar, y la decisión de «¿estamos en vista previa?» la toma el servidor
 * en cada petición, con la misma función que cierra la página (`accesoPdm`). El botón y la
 * página no pueden discrepar porque leen lo mismo.
 *
 * Devuelve el nivel y nada más: no expone quién es el usuario ni por qué se negó. Ante
 * cualquier duda —sin sesión, sin permiso, error de lectura— la respuesta es `null`, que es el
 * estado seguro.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { accesoPdm } from '@/lib/pdm/acceso'
import { avisarDespues } from '@/lib/pdm/correos/despues'
import { avisarCambioDeGrupo, avisarCambioDeReparto } from '@/lib/pdm/correos/enviar'
import { marcaDeHistorial } from '@/lib/pdm/correos/datos'
import { gestiona, type NivelPdm } from '@/lib/pdm/niveles'
import { describirCambio, type EntradaHistorial, type FilaHistorial } from '@/lib/pdm/historial'
import { revalidatePath } from 'next/cache'
import {
  errorEnLista, errorEnMotivo, esUuid, traducirErrorPdm,
  MAX_DESCRIPCION, MAX_INDICADORES, MAX_MIEMBROS, MAX_NOMBRE_GRUPO,
  type CambioAcceso, type EntradaAsignarGrupo, type EntradaAsignarPersona, type EntradaDeshabilitar,
  type EntradaEliminarGrupo, type EntradaGuardarGrupo, type EntradaHabilitar, type EntradaQuitarAsignacion,
  type Resultado, type ResumenCambio,
} from '@/lib/pdm/acciones'
import { esNivelHabilitable } from '@/lib/pdm/niveles'

export async function nivelPdm(): Promise<NivelPdm | null> {
  try {
    return (await accesoPdm())?.nivel ?? null
  } catch {
    return null
  }
}

// ─── Repartir indicadores ─────────────────────────────────────────────────────
//
// Las acciones de quien gestiona (el administrador y las secretarías). Todas siguen el mismo
// camino y ninguna se salta una puerta:
//
//   1. `accesoPdm()`: fuera de la vista previa (producción) no hacen nada.
//   2. Sesión y nivel (administrador o secretaría), leídos del servidor y no del navegador.
//   3. Se valida lo que llega (ids, tamaños) ANTES de preguntarle nada a la base.
//   4. La base decide: llaman a funciones SECURITY INVOKER (migraciones 052 y 055) con la
//      sesión de quien pide, así que mandan las políticas de la migración 050: una
//      secretaría solo toca lo de SU dependencia. Aunque alguien invocara esto a mano,
//      la base lo negaría.
//   5. La bitácora (`pdm_historial`) la escribe un disparador de la base, no estas
//      funciones: no hay manera de cambiar una asignación sin que quede rastro.
//
// Nunca devuelven el error crudo de la base: `traducirErrorPdm` deja pasar solo los
// mensajes escritos para leerse.

const SIN_PERMISO = 'No tienes permiso para hacer este cambio.'

/** El cliente de Supabase con la sesión de quien gestiona (administrador o secretaría), o `null` si no corresponde. */
async function sesionGestorPdm() {
  const acceso = await accesoPdm()
  if (!acceso || !gestiona(acceso.nivel)) return null
  return createServerSupabaseClient()
}

const REFRESCO = '/dashboard/plan-desarrollo'
const refrescar = () => revalidatePath(REFRESCO, 'layout')

function resumenDe(datos: unknown): ResumenCambio {
  const d = (datos ?? {}) as Record<string, unknown>
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0)
  return { cambiados: n('cambiados'), sinCambio: n('sin_cambio'), pasadosAApoyo: n('pasados_a_apoyo'), quitados: n('quitados') }
}

const motivoDe = (m?: string) => (m && m.trim() ? m.trim() : null)

/** El lote que la base abrió para una operación de reparto: es lo que une la operación con lo que quedó en la bitácora. */
function loteDe(datos: unknown): string | null {
  const l = (datos as { lote?: unknown } | null)?.lote
  return esUuid(l) ? l : null
}

/** Tras repartir: si hubo cambios, se avisa a quienes les tocó (sin esperar, sin poder estorbar). Ver `lib/pdm/correos`. */
async function avisarReparto(datos: unknown) {
  const lote = loteDe(datos)
  const r = resumenDe(datos)
  if (lote && r.cambiados + r.quitados + r.pasadosAApoyo > 0) await avisarDespues(origen => avisarCambioDeReparto({ lote, origen }))
}

export async function asignarPersona(e: EntradaAsignarPersona): Promise<Resultado<ResumenCambio>> {
  try {
    const supabase = await sesionGestorPdm()
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
    await avisarReparto(data)
    return { ok: true, datos: resumenDe(data) }
  } catch (err) {
    console.error('[pdm/acciones] asignarPersona:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}

export async function asignarGrupo(e: EntradaAsignarGrupo): Promise<Resultado<ResumenCambio>> {
  try {
    const supabase = await sesionGestorPdm()
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
    await avisarReparto(data)
    return { ok: true, datos: resumenDe(data) }
  } catch (err) {
    console.error('[pdm/acciones] asignarGrupo:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}

export async function quitarAsignacion(e: EntradaQuitarAsignacion): Promise<Resultado<ResumenCambio>> {
  try {
    const supabase = await sesionGestorPdm()
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
    await avisarReparto(data)
    return { ok: true, datos: resumenDe(data) }
  } catch (err) {
    console.error('[pdm/acciones] quitarAsignacion:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}

export async function guardarGrupo(e: EntradaGuardarGrupo): Promise<Resultado<{ grupo: string }>> {
  try {
    const supabase = await sesionGestorPdm()
    if (!supabase) return { ok: false, error: SIN_PERMISO }
    const nombre = typeof e?.nombre === 'string' ? e.nombre.trim() : ''
    const mal = (e.grupo !== undefined && !esUuid(e.grupo) ? 'Algo de lo elegido no es válido.' : null)
      ?? (nombre === '' ? 'El grupo necesita un nombre.' : null)
      ?? (nombre.length > MAX_NOMBRE_GRUPO ? `El nombre no puede pasar de ${MAX_NOMBRE_GRUPO} caracteres.` : null)
      ?? (!esUuid(e.secretaria) ? 'Falta elegir la secretaría.' : null)
      // El líder es opcional; si viene, tiene que ser una persona válida.
      ?? (e.lider != null && !esUuid(e.lider) ? 'Algo de lo elegido no es válido.' : null)
      ?? errorEnLista(e.miembros, MAX_MIEMBROS, 'a quienes forman el grupo')
      ?? (e.descripcion !== undefined && typeof e.descripcion !== 'string' ? 'La descripción no es válida.' : null)
      ?? (typeof e.descripcion === 'string' && e.descripcion.trim().length > MAX_DESCRIPCION ? `La descripción no puede pasar de ${MAX_DESCRIPCION} caracteres.` : null)
      ?? errorEnMotivo(e.motivo)
    if (mal) return { ok: false, error: mal }

    // Antes de guardar: qué fila de la bitácora era la última, para saber después cuáles son de esta operación.
    const marca = await marcaDeHistorial()
    const { data, error } = await supabase.rpc('pdm_grupo_guardar', {
      p_grupo: e.grupo ?? null, p_nombre: nombre, p_dependencia: e.secretaria, p_lider: e.lider ?? null,
      p_miembros: e.miembros, p_motivo: motivoDe(e.motivo), p_descripcion: e.descripcion?.trim() || null,
    })
    if (error) return { ok: false, error: traducirErrorPdm(error.code, error.message) }
    if (!esUuid(data)) return { ok: false, error: traducirErrorPdm() }
    refrescar()
    // Agregar a alguien a un grupo con indicadores le asigna esos indicadores: se le avisa como en cualquier reparto.
    const grupo = data
    const actor = await accesoPdm()
    if (actor) await avisarDespues(origen => avisarCambioDeGrupo({ grupoId: grupo, actorId: actor.userId, marca, origen }))
    return { ok: true, datos: { grupo } }
  } catch (err) {
    console.error('[pdm/acciones] guardarGrupo:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}

export async function eliminarGrupo(e: EntradaEliminarGrupo): Promise<Resultado> {
  try {
    const supabase = await sesionGestorPdm()
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

// ─── Dar y quitar el acceso al módulo ─────────────────────────────────────────

const CAMBIOS: readonly CambioAcceso[] = ['habilitado', 'cambiado', 'quitado', 'ninguno']
const cambioDe = (datos: unknown): CambioAcceso => {
  const c = (datos as { cambio?: unknown } | null)?.cambio
  return CAMBIOS.find(x => x === c) ?? 'ninguno'
}

export async function habilitarPersona(e: EntradaHabilitar): Promise<Resultado<{ cambio: CambioAcceso }>> {
  try {
    const supabase = await sesionGestorPdm()
    if (!supabase) return { ok: false, error: SIN_PERMISO }
    const mal = (!esUuid(e?.usuario) ? 'Falta elegir a la persona.' : null)
      ?? (!esNivelHabilitable(e.nivel) ? 'Falta elegir el nivel de acceso.' : null)
      ?? errorEnMotivo(e.motivo)
    if (mal) return { ok: false, error: mal }

    const { data, error } = await supabase.rpc('pdm_habilitar', {
      p_usuario: e.usuario, p_nivel: e.nivel, p_motivo: motivoDe(e.motivo),
    })
    if (error) return { ok: false, error: traducirErrorPdm(error.code, error.message) }
    refrescar()
    return { ok: true, datos: { cambio: cambioDe(data) } }
  } catch (err) {
    console.error('[pdm/acciones] habilitarPersona:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}

export async function deshabilitarPersona(e: EntradaDeshabilitar): Promise<Resultado<{ cambio: CambioAcceso }>> {
  try {
    const supabase = await sesionGestorPdm()
    if (!supabase) return { ok: false, error: SIN_PERMISO }
    const mal = (!esUuid(e?.usuario) ? 'Falta elegir a la persona.' : null) ?? errorEnMotivo(e.motivo)
    if (mal) return { ok: false, error: mal }

    const { data, error } = await supabase.rpc('pdm_deshabilitar', { p_usuario: e.usuario, p_motivo: motivoDe(e.motivo) })
    if (error) return { ok: false, error: traducirErrorPdm(error.code, error.message) }
    refrescar()
    return { ok: true, datos: { cambio: cambioDe(data) } }
  } catch (err) {
    console.error('[pdm/acciones] deshabilitarPersona:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}

// ─── El historial de un indicador ─────────────────────────────────────────────

/**
 * Los cambios de responsable de un indicador, del más reciente al más antiguo.
 *
 * Solo lo lee el administrador: la política de `pdm_historial` (migración 050) así lo dice, y
 * esta acción además se lo pide al servidor. Una secretaría que la invocara recibiría una lista
 * vacía, no un error: la base no le muestra esas filas.
 */
export async function historialIndicador(indicador: string): Promise<Resultado<EntradaHistorial[]>> {
  try {
    const acceso = await accesoPdm()
    if (!acceso || acceso.nivel !== 'admin') return { ok: false, error: SIN_PERMISO }
    if (!esUuid(indicador)) return { ok: false, error: 'Algo de lo elegido no es válido.' }

    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('pdm_historial')
      .select('id, created_at, actor_nombre, accion, detalle')
      .eq('entidad', 'indicador')
      .eq('entidad_id', indicador)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(80)
    if (error) return { ok: false, error: traducirErrorPdm(error.code, error.message) }

    const entradas: EntradaHistorial[] = []
    for (const f of (data ?? []) as FilaHistorial[]) {
      const c = describirCambio(f)
      if (c) entradas.push({ id: f.id, cuando: f.created_at, quien: f.actor_nombre, texto: c.texto, motivo: c.motivo })
    }
    return { ok: true, datos: entradas }
  } catch (err) {
    console.error('[pdm/acciones] historialIndicador:', err)
    return { ok: false, error: traducirErrorPdm() }
  }
}
