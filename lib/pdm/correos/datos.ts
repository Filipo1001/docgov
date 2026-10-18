import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { idsAnulados, type FilaAnulacion } from '../anulaciones'
import { puedeRecibirCorreoPdm } from './politica'
import { ACCIONES_DE_ASIGNACION, agruparPorUsuario, cambiosDeLote, type CambioDeUsuario, type FilaDeAsignacion } from './cambios'
import { INSIGNIA_BASE, elegirInsignia, type Insignia } from './insignias'
import type { ArchivoDeCorreo, CambioEnIndicador, GrupoDeAviso, IndicadorDeCorreo } from './plantillas'

/**
 * Lo que los correos necesitan saber, leído de la base.
 *
 * ── Con qué se lee y por qué ─────────────────────────────────────────────
 *
 * Con el cliente de SERVICIO, y solo para LEER. Un correo se arma DESPUÉS de que la respuesta ya viajó al navegador
 * (`after()`), y ahí ya no hay petición de la que tomar la sesión; además el correo habla de personas que no son
 * quien hizo la acción (la secretaria aprueba, el contratista recibe), y la base —con razón— no le deja a una persona
 * leer el correo de otra. Por eso este archivo:
 *
 *   · es `server-only`: no existe en el navegador;
 *   · nunca escribe ni borra;
 *   · pregunta por identificadores que ya están comprobados (la acción validó la sesión y el nivel antes de llamar a la
 *     base; aquí solo se lee lo que esa operación produjo);
 *   · saca de la base solo lo que el correo va a decir.
 *
 * Cada función LANZA si una lectura falla: quien las llama (`enviar.ts`) lo registra y no envía. Un correo a medio
 * armar —sin el indicador, sin la meta— es peor que ninguno.
 */

export type Admin = ReturnType<typeof createAdminSupabaseClient>

export interface Persona {
  id: string
  nombre: string
  correo: string | null
}

export const falla = (donde: string, e: { message: string }): never => {
  throw new Error(`${donde}: ${e.message}`)
}

export async function leerPersonas(admin: Admin, ids: string[]): Promise<Map<string, Persona>> {
  const unicos = [...new Set(ids)]
  const mapa = new Map<string, Persona>()
  if (unicos.length === 0) return mapa
  const { data, error } = await admin.from('usuarios').select('id, nombre_completo, email').in('id', unicos)
  if (error) falla('usuarios', error)
  for (const u of data ?? []) {
    mapa.set(u.id as string, { id: u.id as string, nombre: (u.nombre_completo as string | null) ?? '', correo: (u.email as string | null) ?? null })
  }
  return mapa
}

type FilaIndicador = {
  id: string; fila_origen: number; codigo: string; indicador: string; unidad: string
  dependencia: { nombre: string | null } | { nombre: string | null }[] | null
}

export async function leerIndicadores(admin: Admin, ids: string[]): Promise<Map<string, IndicadorDeCorreo>> {
  const unicos = [...new Set(ids)]
  const mapa = new Map<string, IndicadorDeCorreo>()
  if (unicos.length === 0) return mapa
  const { data, error } = await admin
    .from('pdm_indicadores')
    .select('id, fila_origen, codigo, indicador, unidad, dependencia:dependencias(nombre)')
    .in('id', unicos)
  if (error) falla('pdm_indicadores', error)
  for (const r of (data ?? []) as unknown as FilaIndicador[]) {
    const dep = Array.isArray(r.dependencia) ? r.dependencia[0] : r.dependencia
    mapa.set(r.id, { fila: r.fila_origen, codigo: r.codigo, nombre: r.indicador, unidad: r.unidad, dependencia: dep?.nombre ?? 'la dependencia' })
  }
  return mapa
}

// ─── Reportes ────────────────────────────────────────────────────────────────

export interface BaseDeReporte {
  id: string
  indicadorId: string
  anio: number
  valor: number
  texto: string
  autorId: string
  corrigeA: string | null
  motivoCorreccion: string | null
  creadoEn: string
}

/** La fila del reporte, y nada más: sirve para decidir si hay a quién escribirle ANTES de leer el resto. */
export async function leerBaseDeReporte(reporteId: string): Promise<BaseDeReporte | null> {
  const { data, error } = await createAdminSupabaseClient()
    .from('pdm_reportes')
    .select('id, indicador_id, anio, valor, texto, autor_id, corrige_a, motivo_correccion, created_at')
    .eq('id', reporteId)
    .maybeSingle()
  if (error) falla('pdm_reportes', error)
  if (!data) return null
  return {
    id: data.id as string, indicadorId: data.indicador_id as string, anio: data.anio as number, valor: Number(data.valor),
    texto: (data.texto as string | null) ?? '', autorId: data.autor_id as string, corrigeA: (data.corrige_a as string | null) ?? null,
    motivoCorreccion: (data.motivo_correccion as string | null) ?? null, creadoEn: data.created_at as string,
  }
}

export interface ContextoDeReporte {
  base: BaseDeReporte
  autor: Persona
  indicador: IndicadorDeCorreo
  meta: number | null
  archivos: (ArchivoDeCorreo & { id: string })[]
}

export async function completarContextoDeReporte(base: BaseDeReporte): Promise<ContextoDeReporte> {
  const admin = createAdminSupabaseClient()
  const [personas, indicadores, meta, archivos] = await Promise.all([
    leerPersonas(admin, [base.autorId]),
    leerIndicadores(admin, [base.indicadorId]),
    admin.from('pdm_metas').select('meta').eq('indicador_id', base.indicadorId).eq('anio', base.anio).maybeSingle(),
    admin.from('pdm_evidencias').select('id, nombre, tipo, bytes').eq('reporte_id', base.id).order('created_at').order('id'),
  ])
  if (meta.error) falla('pdm_metas', meta.error)
  if (archivos.error) falla('pdm_evidencias', archivos.error)
  const autor = personas.get(base.autorId)
  const indicador = indicadores.get(base.indicadorId)
  if (!autor || !indicador) throw new Error('reporte sin autor o sin indicador')
  const m = meta.data?.meta
  return {
    base, autor, indicador,
    meta: m === null || m === undefined ? null : Number(m),
    archivos: (archivos.data ?? []).map(a => ({ id: a.id as string, nombre: a.nombre as string, tipo: a.tipo as string, bytes: Number(a.bytes) })),
  }
}

export interface Validacion {
  validador: string
  comentario: string | null
  creadaEn: string
  observados: { nombre: string; motivo: string }[]
}

/**
 * La última validación con ese resultado. Las observaciones traen el identificador del archivo; aquí se cambia por su
 * nombre (y se descarta lo que no pertenezca a este reporte).
 */
export async function leerValidacion(
  reporteId: string, estado: 'aprobado' | 'devuelto', archivos: readonly { id: string; nombre: string }[],
): Promise<Validacion | null> {
  const { data, error } = await createAdminSupabaseClient()
    .from('pdm_validaciones')
    .select('comentario, validador_nombre, created_at, observaciones')
    .eq('reporte_id', reporteId)
    .eq('estado', estado)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) falla('pdm_validaciones', error)
  if (!data) return null
  const nombres = new Map(archivos.map(a => [a.id, a.nombre]))
  const observados: Validacion['observados'] = []
  if (Array.isArray(data.observaciones)) {
    for (const o of data.observaciones as { evidencia?: unknown; motivo?: unknown }[]) {
      const nombre = typeof o?.evidencia === 'string' ? nombres.get(o.evidencia) : undefined
      if (nombre && typeof o.motivo === 'string' && o.motivo.trim() !== '') observados.push({ nombre, motivo: o.motivo.trim() })
    }
  }
  const comentario = typeof data.comentario === 'string' && data.comentario.trim() !== '' ? data.comentario.trim() : null
  return { validador: (data.validador_nombre as string | null) ?? 'La secretaría', comentario, creadaEn: data.created_at as string, observados }
}

/**
 * Qué insignia merece una aprobación. Si CUALQUIER lectura falla se devuelve la insignia base (que no afirma nada de
 * más) en vez de impedir la felicitación: lo que se dice siempre es verdad, aunque a veces diga menos.
 */
export async function insigniaDeAprobacion(ctx: ContextoDeReporte): Promise<Insignia> {
  try {
    const admin = createAdminSupabaseClient()

    // La cadena de correcciones de ESTE envío: este reporte, el que corrigió, el que ese corrigió… dentro del año.
    const delAnio = await admin.from('pdm_reportes').select('id, corrige_a').eq('indicador_id', ctx.base.indicadorId).eq('anio', ctx.base.anio)
    if (delAnio.error) return INSIGNIA_BASE
    const previo = new Map((delAnio.data ?? []).map(r => [r.id as string, (r.corrige_a as string | null) ?? null]))
    const cadena: string[] = []
    for (let id: string | null = ctx.base.id; id && !cadena.includes(id) && previo.has(id); id = previo.get(id) ?? null) cadena.push(id)

    // Las aprobaciones de la persona NO cuentan si su reporte fue anulado (migración 068): este cliente de servicio ve todo,
    // así que lo anulado se descuenta aquí.
    const [devueltas, aprobadasDeLaPersona, anuladasDeLaPersona] = await Promise.all([
      admin.from('pdm_validaciones').select('id', { count: 'exact', head: true }).in('reporte_id', cadena.length ? cadena : [ctx.base.id]).eq('estado', 'devuelto'),
      admin.from('pdm_validaciones').select('id, reporte_id, pdm_reportes!inner(autor_id)').eq('estado', 'aprobado').eq('pdm_reportes.autor_id', ctx.base.autorId),
      admin.from('pdm_anulaciones').select('reporte_id, accion, motivo, actor_nombre, created_at, pdm_reportes!inner(autor_id)').eq('pdm_reportes.autor_id', ctx.base.autorId),
    ])
    if (devueltas.error || aprobadasDeLaPersona.error || anuladasDeLaPersona.error || devueltas.count === null) return INSIGNIA_BASE
    const anulados = idsAnulados((anuladasDeLaPersona.data ?? []) as unknown as FilaAnulacion[])
    const aprobadas = ((aprobadasDeLaPersona.data ?? []) as unknown as { reporte_id: string }[]).filter(v => !anulados.has(v.reporte_id)).length

    return elegirInsignia({
      anio: ctx.base.anio,
      valor: ctx.base.valor,
      meta: ctx.meta,
      primerAprobadoDeLaPersona: aprobadas <= 1,
      devolucionesPrevias: devueltas.count,
    })
  } catch {
    return INSIGNIA_BASE
  }
}

// ─── Cambios de reparto ──────────────────────────────────────────────────────

export interface AvisoDeAsignacion {
  persona: Persona
  /** Vacío SOLO si entró a un grupo que todavía no tiene indicadores. */
  cambios: CambioEnIndicador[]
  /** Si el cambio le llega por un grupo: entró a él, o el grupo recibió indicadores. */
  grupo?: GrupoDeAviso | null
}

/** Lo que se sabe de un grupo cuando la operación fue entrar a él (ver `datos-avisos.ts`). */
export interface EntradaAGrupo {
  grupo: { id: string; nombre: string; descripcion: string | null; dependencia: string | null }
  agregados: ReadonlyMap<string, { lider: boolean }>
  actor: string
  ocurridoEn: string
  motivo: string | null
}

export interface ContextoDeLote {
  actor: string
  motivo: string | null
  ocurridoEn: string
  avisos: AvisoDeAsignacion[]
  /** A cuántas personas afectadas NO se les escribe (la política las deja fuera). Solo se cuenta, nunca se nombra. */
  omitidas: number
}

/**
 * Los cambios de un lote, listos para escribir a cada persona afectada que la política permita.
 *
 * La política se aplica ANTES de leer nada más: mientras el módulo esté en pruebas, casi todo reparto afecta a gente
 * a la que no se le escribe, y no tiene sentido leer sus datos para después descartarlos.
 */
export async function leerContextoDeLote(lote: string, abierto: boolean, entrada: EntradaAGrupo | null = null): Promise<ContextoDeLote | null> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('pdm_historial')
    .select('id, accion, entidad_id, detalle, actor_nombre, created_at')
    .eq('entidad', 'indicador')
    .in('accion', [...ACCIONES_DE_ASIGNACION])
    .filter('detalle->>lote', 'eq', lote)
    .order('id')
    .limit(2000)
  if (error) falla('pdm_historial', error)
  const filas = (data ?? []) as unknown as (FilaDeAsignacion & { actor_nombre: string | null; created_at: string })[]
  // Sin asignaciones y sin nadie que haya entrado a un grupo, no hay a quién avisar.
  if (filas.length === 0 && (!entrada || entrada.agregados.size === 0)) return null

  const porPersona = new Map<string, CambioDeUsuario[]>(agruparPorUsuario(cambiosDeLote(filas)))
  // Quien entró a un grupo recibe aviso aunque el grupo todavía no tenga indicadores (sin cambios que contar).
  if (entrada) for (const id of entrada.agregados.keys()) if (!porPersona.has(id)) porPersona.set(id, [])
  const afectadas = [...porPersona.keys()]
  // Con flecha y no pasando la función suelta: `filter` le daría la POSICIÓN como segundo argumento («abierto»).
  const permitidas = afectadas.filter(id => puedeRecibirCorreoPdm(id, abierto))
  const omitidas = afectadas.length - permitidas.length

  const primera = filas[0]
  const base: ContextoDeLote = {
    actor: primera?.actor_nombre ?? entrada?.actor ?? 'Alguien de la secretaría',
    motivo: typeof primera?.detalle?.motivo === 'string' && primera.detalle.motivo.trim() !== '' ? primera.detalle.motivo.trim() : (entrada?.motivo ?? null),
    ocurridoEn: primera?.created_at ?? entrada?.ocurridoEn ?? new Date().toISOString(),
    avisos: [],
    omitidas,
  }
  if (permitidas.length === 0) return base

  const idsIndicadores = [...new Set(permitidas.flatMap(u => porPersona.get(u)!.map(c => c.indicadorId)))]
  const [personas, indicadores, principales] = await Promise.all([
    leerPersonas(admin, permitidas),
    leerIndicadores(admin, idsIndicadores),
    // Quién es hoy la persona responsable de cada indicador (para decirle a quien dejó de serlo quién lo lleva).
    admin.from('pdm_asignaciones').select('indicador_id, usuario_id').in('indicador_id', idsIndicadores).eq('principal', true),
  ])
  if (principales.error) falla('pdm_asignaciones', principales.error)
  const responsables = await leerPersonas(admin, (principales.data ?? []).map(p => p.usuario_id as string))
  const responsableDe = new Map<string, string>()
  for (const p of principales.data ?? []) {
    const nombre = responsables.get(p.usuario_id as string)?.nombre
    if (nombre) responsableDe.set(p.indicador_id as string, nombre)
  }

  for (const usuarioId of permitidas) {
    const persona = personas.get(usuarioId)
    if (!persona) continue
    const cambios: CambioEnIndicador[] = []
    const delUsuario = porPersona.get(usuarioId)!
    for (const c of delUsuario) {
      const ind = indicadores.get(c.indicadorId)
      if (!ind) continue
      cambios.push({ tipo: c.tipo, indicador: { fila: ind.fila, codigo: ind.codigo, nombre: ind.nombre, dependencia: ind.dependencia }, responsableActual: responsableDe.get(c.indicadorId) ?? null })
    }
    // ¿Le llega por un grupo? Si entró a uno en esta operación; o si TODO lo que cambió le llegó por el mismo grupo.
    const entro = entrada?.agregados.get(usuarioId)
    const nombresDeGrupo = new Set(delUsuario.map(c => c.grupo))
    const grupo: GrupoDeAviso | null = entro && entrada
      ? { motivo: 'agregado', nombre: entrada.grupo.nombre, lider: entro.lider, descripcion: entrada.grupo.descripcion, dependencia: entrada.grupo.dependencia }
      : delUsuario.length > 0 && nombresDeGrupo.size === 1 && [...nombresDeGrupo][0] !== null
        ? { motivo: 'asignado', nombre: [...nombresDeGrupo][0]! }
        : null
    if (cambios.length > 0 || (entro && grupo)) base.avisos.push({ persona, cambios, grupo })
  }
  return base
}

/**
 * Una marca en la bitácora: el número de la última fila. Se toma ANTES de guardar un grupo para saber, después, qué
 * filas son de esa operación y cuáles ya estaban. `null` si no se pudo leer (entonces no se avisa: sin marca no hay
 * manera de distinguir lo nuevo de lo viejo, y reenviar un reparto antiguo es peor que no avisar).
 */
export async function marcaDeHistorial(): Promise<number | null> {
  try {
    const { data, error } = await createAdminSupabaseClient().from('pdm_historial').select('id').order('id', { ascending: false }).limit(1).maybeSingle()
    if (error) return null
    return data ? Number(data.id) : 0
  } catch {
    return null
  }
}

/**
 * El lote de esta operación sobre un grupo. `pdm_grupo_guardar` devuelve el grupo y no el lote, y el lote es lo que
 * une el cambio de miembros con las asignaciones que arrastró. Solo cuentan las filas POSTERIORES a la marca: si la
 * edición no cambió nada no hay filas nuevas y no se avisa de nada (la última fila del grupo sería de otra operación).
 */
export async function leerLoteDeGrupo(grupoId: string, actorId: string, despuesDe: number): Promise<string | null> {
  const { data, error } = await createAdminSupabaseClient()
    .from('pdm_historial')
    .select('detalle')
    .eq('entidad', 'grupo')
    .eq('entidad_id', grupoId)
    .eq('actor_id', actorId)
    .gt('id', despuesDe)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) falla('pdm_historial', error)
  const lote = (data?.detalle as { lote?: unknown } | null)?.lote
  return typeof lote === 'string' ? lote : null
}
