import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { esNivelHabilitable, type NivelHabilitable } from '../niveles'
import { falla, leerIndicadores, leerPersonas, type Admin, type Persona } from './datos'
import { puedeRecibirCorreoPdm } from './politica'
import type { IndicadorDeCorreo } from './plantillas'

/**
 * Lo que necesitan los avisos de acceso, de grupo, de anulación, de comentarios y de reportes de apoyo.
 *
 * Mismas reglas que `datos.ts`: cliente de SERVICIO y solo para LEER, porque se arma después de que la respuesta viajó
 * y el aviso habla de personas que no son quien hizo la acción; cada función LANZA si una lectura falla (quien la llama
 * lo registra y no envía: un correo a medio armar es peor que ninguno); y la política de destinatarios se aplica ANTES
 * de leer datos de nadie.
 *
 * La VERDAD de lo ocurrido sale de la bitácora (`pdm_historial`) y de las tablas de solo-inserción
 * (`pdm_anulaciones`, `pdm_validaciones`), no de lo que la pantalla dice haber pedido.
 */

async function leerMeta(admin: Admin, indicadorId: string, anio: number): Promise<number | null> {
  const { data, error } = await admin.from('pdm_metas').select('meta').eq('indicador_id', indicadorId).eq('anio', anio).maybeSingle()
  if (error) falla('pdm_metas', error)
  return data?.meta === null || data?.meta === undefined ? null : Number(data.meta)
}

const nivelDe = (v: unknown): NivelHabilitable | null => (esNivelHabilitable(v) ? v : null)

// ─── Acceso al módulo ────────────────────────────────────────────────────────

export interface ContextoDeAcceso {
  persona: Persona
  dependencia: string | null
  actor: string
  ocurridoEn: string
  nivel: NivelHabilitable | null
  nivelAntes: NivelHabilitable | null
  indicadores: { codigo: string; nombre: string; papel: 'principal' | 'apoyo' }[]
  totalIndicadores: number
  indicadoresDeLaSecretaria: number | null
}

const MAX_INDICADORES_LEIDOS = 5

/**
 * Lo que dice el correo de acceso de UNA persona: la fila de la bitácora de esa operación (quién, cuándo, de qué nivel a
 * cuál), su secretaría y los indicadores que YA tiene a su cargo (para decírselos en la bienvenida).
 */
export async function leerContextoDeAcceso(usuarioId: string, lote: string | null): Promise<ContextoDeAcceso | null> {
  const admin = createAdminSupabaseClient()
  const personas = await leerPersonas(admin, [usuarioId])
  const persona = personas.get(usuarioId)
  if (!persona) return null

  let consulta = admin
    .from('pdm_historial')
    .select('actor_nombre, created_at, detalle')
    .eq('entidad', 'usuario')
    .eq('entidad_id', usuarioId)
    .in('accion', ['acceso_habilitado', 'acceso_cambiado', 'acceso_quitado'])
    .order('id', { ascending: false })
    .limit(1)
  if (lote) consulta = consulta.filter('detalle->>lote', 'eq', lote)
  const { data: fila, error } = await consulta.maybeSingle()
  if (error) falla('pdm_historial', error)
  if (!fila) return null
  const detalle = (fila.detalle ?? {}) as { nivel_antes?: unknown; nivel_despues?: unknown }

  const [usuario, asignaciones] = await Promise.all([
    admin.from('usuarios').select('dependencia_id, dependencia:dependencias(nombre)').eq('id', usuarioId).maybeSingle(),
    admin
      .from('pdm_asignaciones')
      .select('principal, indicador:pdm_indicadores(codigo, indicador, activo)', { count: 'exact' })
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false })
      .limit(MAX_INDICADORES_LEIDOS),
  ])
  if (usuario.error) falla('usuarios', usuario.error)
  if (asignaciones.error) falla('pdm_asignaciones', asignaciones.error)

  const dep = usuario.data?.dependencia as { nombre: string | null } | { nombre: string | null }[] | null | undefined
  const dependencia = (Array.isArray(dep) ? dep[0]?.nombre : dep?.nombre) ?? null
  const nivel = nivelDe(detalle.nivel_despues)

  let indicadoresDeLaSecretaria: number | null = null
  if (nivel === 'coordinador' && usuario.data?.dependencia_id) {
    const c = await admin.from('pdm_indicadores').select('id', { count: 'exact', head: true }).eq('dependencia_id', usuario.data.dependencia_id).eq('activo', true)
    if (c.error) falla('pdm_indicadores', c.error)
    indicadoresDeLaSecretaria = c.count ?? 0
  }

  const indicadores: ContextoDeAcceso['indicadores'] = []
  for (const a of (asignaciones.data ?? []) as unknown as { principal: boolean; indicador: { codigo: string; indicador: string; activo: boolean } | { codigo: string; indicador: string; activo: boolean }[] | null }[]) {
    const i = Array.isArray(a.indicador) ? a.indicador[0] : a.indicador
    if (i?.activo) indicadores.push({ codigo: i.codigo, nombre: i.indicador, papel: a.principal ? 'principal' : 'apoyo' })
  }
  return {
    persona, dependencia, actor: (fila.actor_nombre as string | null) ?? 'Alguien de la secretaría', ocurridoEn: fila.created_at as string,
    nivel, nivelAntes: nivelDe(detalle.nivel_antes), indicadores, totalIndicadores: asignaciones.count ?? indicadores.length, indicadoresDeLaSecretaria,
  }
}

// ─── Entrar a un grupo ───────────────────────────────────────────────────────

export interface AgregadosAlGrupo {
  grupo: { id: string; nombre: string; descripcion: string | null; dependencia: string | null }
  /** Quiénes entraron al grupo en esta operación, y si como líder. */
  agregados: Map<string, { lider: boolean }>
  actor: string
  ocurridoEn: string
  motivo: string | null
}

/**
 * Quiénes ENTRARON a un grupo en la operación de `actorId` posterior a la marca de la bitácora. Solo cuentan las filas
 * nuevas: si la edición no agregó a nadie, no hay a quién avisar (una fila de antes sería de otra operación).
 */
export async function leerAgregadosAlGrupo(grupoId: string, actorId: string, despuesDe: number): Promise<AgregadosAlGrupo | null> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('pdm_historial')
    .select('detalle, actor_nombre, created_at')
    .eq('entidad', 'grupo')
    .eq('entidad_id', grupoId)
    .eq('actor_id', actorId)
    .eq('accion', 'miembro_agregado')
    .gt('id', despuesDe)
    .order('id')
    .limit(500)
  if (error) falla('pdm_historial', error)
  const filas = data ?? []
  if (filas.length === 0) return null

  const agregados = new Map<string, { lider: boolean }>()
  for (const f of filas) {
    const d = (f.detalle ?? {}) as { usuario_id?: unknown; lider_despues?: unknown }
    if (typeof d.usuario_id === 'string') agregados.set(d.usuario_id, { lider: d.lider_despues === true })
  }
  const g = await admin.from('pdm_grupos').select('id, nombre, descripcion, dependencia:dependencias(nombre)').eq('id', grupoId).maybeSingle()
  if (g.error) falla('pdm_grupos', g.error)
  if (!g.data) return null
  const dep = g.data.dependencia as { nombre: string | null } | { nombre: string | null }[] | null
  const primera = filas[0]
  const detalle = (primera.detalle ?? {}) as { motivo?: unknown }
  return {
    grupo: {
      id: g.data.id as string, nombre: g.data.nombre as string,
      descripcion: typeof g.data.descripcion === 'string' && g.data.descripcion.trim() !== '' ? g.data.descripcion.trim() : null,
      dependencia: (Array.isArray(dep) ? dep[0]?.nombre : dep?.nombre) ?? null,
    },
    agregados,
    actor: (primera.actor_nombre as string | null) ?? 'Alguien de la secretaría',
    ocurridoEn: primera.created_at as string,
    motivo: typeof detalle.motivo === 'string' && detalle.motivo.trim() !== '' ? detalle.motivo.trim() : null,
  }
}

// ─── Reabrir, anular y restaurar un reporte ──────────────────────────────────

/**
 * ¿Esta devolución REABRIÓ un reporte aprobado? Es la última validación («devuelto») precedida de una aprobación. La
 * validación que se acaba de escribir ya está en la tabla: se miran las dos últimas.
 */
export async function leerSiReabrio(reporteId: string): Promise<boolean> {
  const { data, error } = await createAdminSupabaseClient()
    .from('pdm_validaciones')
    .select('estado')
    .eq('reporte_id', reporteId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(2)
  if (error) falla('pdm_validaciones', error)
  const e = (data ?? []).map(v => v.estado as string)
  return e[0] === 'devuelto' && e[1] === 'aprobado'
}

export interface AvisoDeAnulacion {
  persona: Persona
  reporteId: string
  valor: number
}

export interface ContextoDeAnulacion {
  accion: 'anular' | 'restaurar'
  motivo: string | null
  actor: string
  ocurridoEn: string
  indicador: IndicadorDeCorreo
  anio: number
  meta: number | null
  /** Una persona por autor de las versiones anuladas o restauradas, con SU versión más reciente. */
  avisos: AvisoDeAnulacion[]
  omitidas: number
}

/**
 * A quién avisar de una anulación o restauración (el lote que devolvió la base): a cada AUTOR de una versión del reporte,
 * una sola vez, con el avance de su versión más reciente. Una cadena de correcciones puede tener varios autores.
 */
export async function leerContextoDeAnulacion(lote: string, abierto: boolean): Promise<ContextoDeAnulacion | null> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('pdm_anulaciones')
    .select('reporte_id, accion, motivo, actor_nombre, created_at')
    .eq('lote', lote)
    .order('created_at')
    .limit(50)
  if (error) falla('pdm_anulaciones', error)
  const filas = data ?? []
  if (filas.length === 0) return null
  const accion = filas[0].accion === 'restaurar' ? 'restaurar' : 'anular'

  const reportes = await admin
    .from('pdm_reportes')
    .select('id, indicador_id, anio, valor, autor_id, created_at')
    .in('id', filas.map(f => f.reporte_id as string))
  if (reportes.error) falla('pdm_reportes', reportes.error)
  const versiones = reportes.data ?? []
  if (versiones.length === 0) return null

  // Una versión por autor: la más reciente que escribió.
  const porAutor = new Map<string, { id: string; valor: number; creado: string }>()
  for (const v of versiones) {
    const autor = v.autor_id as string | null
    if (!autor) continue
    const previa = porAutor.get(autor)
    if (!previa || (v.created_at as string) > previa.creado) porAutor.set(autor, { id: v.id as string, valor: Number(v.valor), creado: v.created_at as string })
  }
  const permitidos = [...porAutor.keys()].filter(id => puedeRecibirCorreoPdm(id, abierto))
  const omitidas = porAutor.size - permitidos.length

  const cabeza = versiones[0]
  const [indicadores, meta, personas] = await Promise.all([
    leerIndicadores(admin, [cabeza.indicador_id as string]),
    leerMeta(admin, cabeza.indicador_id as string, cabeza.anio as number),
    permitidos.length > 0 ? leerPersonas(admin, permitidos) : Promise.resolve(new Map<string, Persona>()),
  ])
  const indicador = indicadores.get(cabeza.indicador_id as string)
  if (!indicador) throw new Error('reporte sin indicador')

  const avisos: AvisoDeAnulacion[] = []
  for (const autorId of permitidos) {
    const persona = personas.get(autorId)
    const v = porAutor.get(autorId)
    if (persona && v) avisos.push({ persona, reporteId: v.id, valor: v.valor })
  }
  const primera = filas[0]
  return {
    accion, indicador, anio: cabeza.anio as number, meta, avisos, omitidas,
    motivo: typeof primera.motivo === 'string' && primera.motivo.trim() !== '' ? primera.motivo.trim() : null,
    actor: (primera.actor_nombre as string | null) ?? 'El administrador',
    ocurridoEn: primera.created_at as string,
  }
}

// ─── Comentario de Control Interno ───────────────────────────────────────────

export interface DestinatarioDeComentario {
  persona: Persona
  como: 'responsable' | 'secretaria'
}

export interface ContextoDeComentario {
  comentarioId: string
  ocurridoEn: string
  indicador: IndicadorDeCorreo
  anio: number | null
  autor: string
  texto: string
  destinatarios: DestinatarioDeComentario[]
  omitidas: number
}

/**
 * Un comentario de CONTROL INTERNO (nivel «consulta») y a quién le toca saberlo: las personas responsables del indicador
 * (las principales) y la secretaría dueña del indicador (quienes la validan). Quien comentó no se avisa a sí mismo. Un
 * comentario de otro nivel no genera aviso: devuelve `null`.
 */
export async function leerContextoDeComentario(comentarioId: string, abierto: boolean): Promise<ContextoDeComentario | null> {
  const admin = createAdminSupabaseClient()
  const { data: c, error } = await admin
    .from('pdm_comentarios')
    .select('id, indicador_id, reporte_id, texto, autor_id, autor_nombre, autor_nivel, created_at')
    .eq('id', comentarioId)
    .maybeSingle()
  if (error) falla('pdm_comentarios', error)
  if (!c || c.autor_nivel !== 'consulta') return null

  const [ind, principales, coordinadores, reporte] = await Promise.all([
    admin.from('pdm_indicadores').select('dependencia_id').eq('id', c.indicador_id as string).maybeSingle(),
    admin.from('pdm_asignaciones').select('usuario_id').eq('indicador_id', c.indicador_id as string).eq('principal', true),
    admin.from('pdm_permisos').select('usuario_id').eq('nivel', 'coordinador'),
    c.reporte_id ? admin.from('pdm_reportes').select('anio').eq('id', c.reporte_id as string).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  if (ind.error) falla('pdm_indicadores', ind.error)
  if (principales.error) falla('pdm_asignaciones', principales.error)
  if (coordinadores.error) falla('pdm_permisos', coordinadores.error)
  if (reporte.error) falla('pdm_reportes', reporte.error)

  // La secretaría: quienes tienen nivel «coordinador» Y pertenecen a la dependencia del indicador.
  let deLaSecretaria: string[] = []
  const idsCoordinadores = (coordinadores.data ?? []).map(x => x.usuario_id as string)
  if (ind.data?.dependencia_id && idsCoordinadores.length > 0) {
    const u = await admin.from('usuarios').select('id').eq('dependencia_id', ind.data.dependencia_id as string).in('id', idsCoordinadores)
    if (u.error) falla('usuarios', u.error)
    deLaSecretaria = (u.data ?? []).map(x => x.id as string)
  }

  const autorId = c.autor_id as string | null
  const como = new Map<string, 'responsable' | 'secretaria'>()
  for (const x of deLaSecretaria) como.set(x, 'secretaria')
  for (const x of principales.data ?? []) como.set(x.usuario_id as string, 'responsable') // si es las dos cosas, manda ser responsable
  if (autorId) como.delete(autorId)

  const permitidos = [...como.keys()].filter(id => puedeRecibirCorreoPdm(id, abierto))
  const omitidas = como.size - permitidos.length
  const [indicadores, personas] = await Promise.all([
    leerIndicadores(admin, [c.indicador_id as string]),
    permitidos.length > 0 ? leerPersonas(admin, permitidos) : Promise.resolve(new Map<string, Persona>()),
  ])
  const indicador = indicadores.get(c.indicador_id as string)
  if (!indicador) throw new Error('comentario sin indicador')

  const destinatarios: DestinatarioDeComentario[] = []
  for (const id of permitidos) {
    const persona = personas.get(id)
    if (persona) destinatarios.push({ persona, como: como.get(id)! })
  }
  return {
    comentarioId, ocurridoEn: c.created_at as string, indicador,
    anio: reporte.data ? Number(reporte.data.anio) : null,
    autor: (c.autor_nombre as string | null) ?? 'Control Interno', texto: (c.texto as string | null) ?? '', destinatarios, omitidas,
  }
}

// ─── Reportó una persona de apoyo ────────────────────────────────────────────

/**
 * A quién se le copia un reporte: si quien reportó es una persona de APOYO del indicador (está asignada y no es la
 * principal), a las personas responsables (las principales). Si reportó la responsable, o alguien sin asignación (una
 * secretaría que reporta lo suyo), no hay a quién copiar: devuelve una lista vacía.
 */
export async function leerResponsablesParaCopia(indicadorId: string, autorId: string, abierto: boolean): Promise<{ personas: Persona[]; omitidas: number }> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.from('pdm_asignaciones').select('usuario_id, principal').eq('indicador_id', indicadorId)
  if (error) falla('pdm_asignaciones', error)
  const filas = data ?? []
  const esApoyo = filas.some(a => a.usuario_id === autorId && a.principal === false)
  if (!esApoyo) return { personas: [], omitidas: 0 }
  const principales = [...new Set(filas.filter(a => a.principal === true && a.usuario_id !== autorId).map(a => a.usuario_id as string))]
  const permitidos = principales.filter(id => puedeRecibirCorreoPdm(id, abierto))
  const personas = permitidos.length > 0 ? [...(await leerPersonas(admin, permitidos)).values()] : []
  return { personas, omitidas: principales.length - permitidos.length }
}

/** Cuántos archivos lleva un reporte (para decirlo en la copia, sin nombrarlos). */
export async function contarArchivos(reporteId: string): Promise<number> {
  const { count, error } = await createAdminSupabaseClient().from('pdm_evidencias').select('id', { count: 'exact', head: true }).eq('reporte_id', reporteId)
  if (error) falla('pdm_evidencias', error)
  return count ?? 0
}

