import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import type { Indicador } from '../plan'
import { falla, type Persona } from './datos'
import { nombreLegible } from './formato'
import { inicioDeSemana } from './resumenes-armar'

/**
 * Lo que necesitan los resúmenes por correo y no está ya en el plan: quién valida en cada secretaría, quién administra,
 * qué pasó en la última semana y quién tiene indicadores sin poder entrar al módulo.
 *
 * Mismas reglas que `datos.ts`: cliente de SERVICIO y solo para LEER (los resúmenes corren sin sesión, desde un cron);
 * cada función LANZA si una lectura falla —quien la llama lo registra y no envía: un resumen con cifras a medias es peor
 * que ninguno—; y la política de destinatarios la aplica quien envía, no estas lecturas.
 */

export interface PersonaConSecretaria extends Persona {
  secretaria: string
}

/**
 * Las personas con nivel «secretaría» (coordinador) del módulo, activas, con el nombre de su dependencia. Una persona sin
 * dependencia no recibe resumen: no hay a qué secretaría pertenezca.
 */
export async function leerSecretarias(): Promise<PersonaConSecretaria[]> {
  const admin = createAdminSupabaseClient()
  const permisos = await admin.from('pdm_permisos').select('usuario_id').eq('nivel', 'coordinador')
  if (permisos.error) falla('pdm_permisos', permisos.error)
  const ids = (permisos.data ?? []).map(p => p.usuario_id as string)
  if (ids.length === 0) return []

  const [usuarios, dependencias] = await Promise.all([
    admin.from('usuarios').select('id, nombre_completo, email, dependencia_id, activo').in('id', ids),
    admin.from('dependencias').select('id, nombre'),
  ])
  if (usuarios.error) falla('usuarios', usuarios.error)
  if (dependencias.error) falla('dependencias', dependencias.error)
  const nombreDe = new Map((dependencias.data ?? []).map(d => [d.id as string, d.nombre as string]))

  const salida: PersonaConSecretaria[] = []
  for (const u of usuarios.data ?? []) {
    const secretaria = u.dependencia_id ? nombreDe.get(u.dependencia_id as string) : undefined
    if (u.activo === false || !secretaria) continue
    salida.push({ id: u.id as string, nombre: (u.nombre_completo as string | null) ?? '', correo: (u.email as string | null) ?? null, secretaria })
  }
  return salida
}

/** Quienes administran el módulo (rol «admin» de Contratista Digital), activos. */
export async function leerAdministradores(): Promise<Persona[]> {
  const { data, error } = await createAdminSupabaseClient().from('usuarios').select('id, nombre_completo, email, activo').eq('rol', 'admin')
  if (error) falla('usuarios', error)
  return (data ?? [])
    .filter(u => u.activo !== false)
    .map(u => ({ id: u.id as string, nombre: (u.nombre_completo as string | null) ?? '', correo: (u.email as string | null) ?? null }))
}

export interface Semana {
  reportados: number
  aprobados: number
  devueltos: number
  anulados: number
}

/** Lo que pasó en los últimos siete días: reportes enviados, validaciones y anulaciones (una anulación es un lote, no una fila por versión). */
export async function leerSemana(ahora: Date): Promise<Semana> {
  const admin = createAdminSupabaseClient()
  const desde = inicioDeSemana(ahora).toISOString()
  const [reportes, validaciones, anulaciones] = await Promise.all([
    admin.from('pdm_reportes').select('id', { count: 'exact', head: true }).gte('created_at', desde),
    admin.from('pdm_validaciones').select('estado').gte('created_at', desde),
    admin.from('pdm_anulaciones').select('lote').eq('accion', 'anular').gte('created_at', desde),
  ])
  if (reportes.error) falla('pdm_reportes', reportes.error)
  if (validaciones.error) falla('pdm_validaciones', validaciones.error)
  if (anulaciones.error) falla('pdm_anulaciones', anulaciones.error)
  const estados = (validaciones.data ?? []).map(v => v.estado as string)
  return {
    reportados: reportes.count ?? 0,
    aprobados: estados.filter(e => e === 'aprobado').length,
    devueltos: estados.filter(e => e === 'devuelto').length,
    anulados: new Set((anulaciones.data ?? []).map(a => a.lote as string)).size,
  }
}

/** Cuántos nombres se escriben en el semanal antes de «y N más». */
export const MAX_SIN_ACCESO_EN_SEMANAL = 8

/**
 * Personas con indicadores asignados que no pueden entrar al módulo: no tienen nivel en `pdm_permisos` y no son
 * administradoras (esas entran sin fila). Los nombres salen en orden alfabético y con mayúscula legible.
 */
export async function leerSinAcceso(lista: Indicador[]): Promise<{ total: number; nombres: string[] }> {
  const asignadas = [...new Set(lista.flatMap(i => i.asignados.map(a => a.usuarioId)))]
  if (asignadas.length === 0) return { total: 0, nombres: [] }
  const admin = createAdminSupabaseClient()
  const [permisos, usuarios] = await Promise.all([
    admin.from('pdm_permisos').select('usuario_id'),
    admin.from('usuarios').select('id, nombre_completo, rol, activo').in('id', asignadas),
  ])
  if (permisos.error) falla('pdm_permisos', permisos.error)
  if (usuarios.error) falla('usuarios', usuarios.error)
  const conAcceso = new Set((permisos.data ?? []).map(p => p.usuario_id as string))
  const sin = (usuarios.data ?? [])
    .filter(u => u.activo !== false && u.rol !== 'admin' && !conAcceso.has(u.id as string))
    .map(u => nombreLegible((u.nombre_completo as string | null) ?? ''))
    .filter(n => n !== '')
    .sort((a, b) => a.localeCompare(b, 'es'))
  return { total: sin.length, nombres: sin.slice(0, MAX_SIN_ACCESO_EN_SEMANAL) }
}
