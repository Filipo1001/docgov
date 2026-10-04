import { nombrePropio } from './personas'
import type { Indicador } from './plan'
import { anioDeParametro, type EstadoReporte } from './seguimiento'

/**
 * La vista de evidencias: lo que se pregunta y lo que se pinta, sin leer nada.
 *
 * Pura: la lectura vive en `evidencias.ts` (`server-only`). Aquí se decide qué filtros valen (nada de lo que venga
 * en la dirección se cree: cada valor se contrasta con lo que de verdad existe), qué indicadores se muestran y cómo
 * se ve cada fila.
 *
 * ── La unidad es el INDICADOR en un AÑO, no el archivo ───────────────────
 *
 * Una lista de archivos deja de servir cuando hay miles: no responde a ninguna pregunta de comprobación. La pregunta
 * es «¿este indicador, este año, tiene con qué demostrarse?». Así que cada fila es un indicador con lo que lo
 * respalda ese año: si es UN archivo, el archivo; si son varios, una carpeta con todos.
 *
 * Los años no se mezclan nunca: la pantalla muestra un año a la vez, y un indicador con evidencia en dos años
 * aparece una vez en cada uno, con SUS archivos. (Un mismo archivo reutilizado en dos años no es «el mismo» a efectos
 * de esta vista: cada año se demuestra por separado.)
 *
 * Qué indicadores tienen evidencia ya lo sabe el plan (cada indicador trae su último reporte de cada año y cuántos
 * archivos lleva), así que no hace falta una consulta para eso: solo se piden a la base los archivos de los 25
 * indicadores de la página.
 */

export const TAMANO_PAGINA = 25
export const MAX_BUSQUEDA = 60

// ─── Tipos de archivo ─────────────────────────────────────────────────────────

export type CategoriaTipo = 'pdf' | 'imagen' | 'word' | 'excel'

/** Cómo se llama un tipo de archivo en singular, para la fila («PDF · 146 KB»). */
export const ETIQUETA_CATEGORIA: Record<CategoriaTipo, string> = {
  pdf: 'PDF', imagen: 'Imagen', word: 'Word', excel: 'Excel',
}

const MIME_WORD = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MIME_EXCEL = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

/** A qué categoría pertenece un tipo de archivo; `null` si no es de las que se admiten. */
export function categoriaDeMime(mime: string): CategoriaTipo | null {
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'imagen'
  if (MIME_WORD.includes(mime)) return 'word'
  if (MIME_EXCEL.includes(mime)) return 'excel'
  return null
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

/** Cómo va el ÚLTIMO reporte del indicador en el año. */
export type EstadoFiltro = EstadoReporte
export const ESTADOS_FILTRO: readonly EstadoFiltro[] = ['aprobado', 'pendiente', 'devuelto']

export const ROTULO_ESTADO_FILTRO: Record<EstadoFiltro, string> = {
  aprobado: 'Aprobados',
  pendiente: 'Sin validar',
  devuelto: 'Devueltos',
}

export interface FiltroEvidencias {
  /** Siempre hay UN año: los años no se mezclan. */
  anio: number
  /** Texto que se busca en el nombre de los archivos, el indicador y su código. Ya limpio. */
  q: string
  estado: EstadoFiltro | null
  dependencia: string | null
  /** Desde 1. */
  pagina: number
}

/**
 * El texto de búsqueda sin lo que rompe una consulta: la coma, los paréntesis, las comillas, los comodines y los
 * dos puntos separan partes de un filtro de PostgREST. Letras (con tildes), números, espacios, punto, guion y guion
 * bajo se quedan. Tope de largo.
 */
export function limpiarBusqueda(q: string): string {
  return q
    .replace(/[^\p{L}\p{N} ._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_BUSQUEDA)
    .trim()
}

/**
 * El texto de búsqueda como lo guarda la columna `busqueda` de la vista (migración 060): en minúsculas y sin tildes.
 * «Transacción», «TRANSACCION» y la tilde «descompuesta» de algunos equipos dan lo mismo. El guion bajo se escapa
 * porque, en una búsqueda con comodines, significa «cualquier letra».
 */
export function claveDeBusqueda(q: string): string {
  return q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/_/g, '\\_')
}

/** Los filtros que llegan en la dirección, contrastados con lo que existe. Lo que no cuadre se ignora. */
export function leerFiltros(
  p: Record<string, string | string[] | undefined>,
  dependenciasValidas: readonly string[],
  anioActual: number,
): FiltroEvidencias {
  const un = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const pag = un(p.pagina)
  const dep = un(p.dependencia)
  const estado = un(p.estado)
  return {
    anio: anioDeParametro(un(p.anio), anioActual),
    q: limpiarBusqueda(un(p.q) ?? ''),
    estado: ESTADOS_FILTRO.find(e => e === estado) ?? null,
    dependencia: dep !== undefined && dependenciasValidas.includes(dep) ? dep : null,
    pagina: pag !== undefined && /^\d{1,4}$/.test(pag) ? Math.max(1, Number(pag)) : 1,
  }
}

/** Los filtros como parámetros de la dirección; lo que está en su valor por defecto no se escribe (el año sí: es la identidad de la vista). */
export function aParametros(f: Partial<FiltroEvidencias> & { anio: number }): URLSearchParams {
  const s = new URLSearchParams()
  s.set('anio', String(f.anio))
  if (f.q) s.set('q', f.q)
  if (f.estado) s.set('estado', f.estado)
  if (f.dependencia) s.set('dependencia', f.dependencia)
  if (f.pagina && f.pagina > 1) s.set('pagina', String(f.pagina))
  return s
}

/**
 * Aplica la búsqueda a una consulta de `pdm_evidencias_vista`: cada palabra escrita tiene que aparecer, en cualquier
 * orden, en la columna `busqueda` (nombre del archivo, indicador y código, ya en minúsculas y sin tildes). Vive aquí y
 * no en el lector del servidor para que la prueba ejercite EXACTAMENTE lo mismo que la pantalla.
 *
 * `q` ya viene limpio (`limpiarBusqueda`): sin comas, paréntesis ni comodines, no puede romper el filtro.
 */
// El constructor de consultas de PostgREST tiene un tipo muy cargado; aquí solo se le pide este método.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aplicarBusqueda<Q extends Record<string, any>>(consulta: Q, q: string): Q {
  let r = consulta
  for (const palabra of claveDeBusqueda(q).split(' ')) {
    if (palabra !== '') r = r.ilike('busqueda', `%${palabra}%`)
  }
  return r
}

/** ¿Hay algún filtro puesto (sin contar el año ni la página)? */
export const hayFiltros = (f: FiltroEvidencias): boolean => f.q !== '' || f.estado !== null || f.dependencia !== null

// ─── Los archivos, tal como los devuelve la base ──────────────────────────────

/** Una fila de `pdm_evidencias_vista`: un archivo con su reporte, su indicador y su estado. */
export interface FilaDeVista {
  id: string
  reporte_id: string
  nombre: string
  tipo: string
  bytes: number | string
  conservada: boolean
  indicador_id: string
  indicador_fila: number
  codigo: string
  indicador: string
  sector: string
  dependencia: string
  anio: number
  valor: number | string
  autor_nombre: string
  reportado_en: string
  estado_reporte: string
  reemplazada: boolean
  observacion: string | null
}

/** Lo que hace falta de un archivo para saber si es el mismo que otro y a qué indicador sirve. */
export interface FilaRelacionable {
  id: string
  indicador_id: string
  indicador_fila: number
  codigo: string
  indicador: string
  sector: string
  dependencia: string
  anio: number
  estado_reporte: string
  nombre: string
  bytes: number | string
  tipo: string
}

const ESTADOS: readonly EstadoReporte[] = ['pendiente', 'aprobado', 'devuelto']

const numero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ─── Un mismo archivo en varios indicadores ───────────────────────────────────

/** Otro indicador del MISMO año al que sirve el mismo archivo. */
export interface IndicadorRelacionado {
  /** El número del indicador en el plan (la clave que usan los enlaces a «Indicadores»). */
  indicadorFila: number
  codigo: string
  indicador: string
  sector: string
  dependencia: string
  anio: number
  estado: EstadoReporte | null
}

/**
 * La identidad de un archivo: su nombre (normalizado, sin importar mayúsculas), su tamaño real y su tipo. Dos
 * archivos con las tres cosas iguales son, para todo efecto práctico, el mismo documento subido dos veces.
 *
 * Es lo que se sabe HOY: la base no liga un archivo a más de un reporte (cada reporte lleva sus propias copias).
 * Si algún día un archivo se adjunta a varios indicadores de verdad, solo cambia de dónde sale esta relación.
 */
export function claveDeArchivo(f: { nombre: string; bytes: number | string; tipo: string }): string {
  return `${f.nombre.normalize('NFC').toLowerCase()}|${Number(f.bytes)}|${f.tipo}`
}

/** Los nombres que se pueden pedir con seguridad en un filtro `in` de PostgREST (sin comillas ni barras). */
export function nombresPedibles(filas: { nombre: string }[]): string[] {
  return [...new Set(filas.map(f => f.nombre).filter(n => n !== '' && !/["\\]/.test(n)))]
}

/**
 * Para cada archivo, los OTROS indicadores del MISMO año a los que sirve ese mismo archivo (nunca de otro año: los
 * años no se mezclan). No cuenta el propio indicador y deduplica por indicador. Salen por código.
 */
export function relacionar(filas: FilaDeVista[], candidatas: FilaRelacionable[]): Map<string, IndicadorRelacionado[]> {
  const porClave = new Map<string, FilaRelacionable[]>()
  for (const c of candidatas) {
    const k = claveDeArchivo(c)
    const l = porClave.get(k)
    if (l) l.push(c); else porClave.set(k, [c])
  }
  const res = new Map<string, IndicadorRelacionado[]>()
  for (const f of filas) {
    const vistos = new Set<string>()
    const otros: IndicadorRelacionado[] = []
    for (const c of porClave.get(claveDeArchivo(f)) ?? []) {
      if (c.indicador_id === f.indicador_id || c.anio !== f.anio || vistos.has(c.indicador_id)) continue
      vistos.add(c.indicador_id)
      otros.push({
        indicadorFila: c.indicador_fila, codigo: c.codigo, indicador: c.indicador, sector: c.sector,
        dependencia: c.dependencia, anio: c.anio, estado: ESTADOS.find(e => e === c.estado_reporte) ?? null,
      })
    }
    if (otros.length > 0) {
      otros.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }) || a.indicadorFila - b.indicadorFila)
      res.set(f.id, otros)
    }
  }
  return res
}

// ─── Las filas: un indicador en un año, con sus archivos ──────────────────────

/** Un archivo que respalda a un indicador en un año. */
export interface ArchivoDeIndicador {
  id: string
  reporteId: string
  nombre: string
  tipo: string
  categoria: CategoriaTipo | null
  bytes: number
  conservada: boolean
  /** Cómo va el reporte al que pertenece ESTE archivo (puede diferir del último si el año tiene varios). */
  estado: EstadoReporte | null
  /** La nota con que la secretaría devolvió este archivo, si lo hizo. */
  observacion: string | null
  /** ISO. */
  reportadoEn: string
  autor: string
  /** Otros indicadores del mismo año a los que sirve este mismo archivo. */
  tambien: IndicadorRelacionado[]
}

/** Una fila lista para pintar: un indicador, un año, y lo que lo respalda. */
export interface FilaIndicador {
  indicadorFila: number
  codigo: string
  indicador: string
  sector: string
  dependencia: string
  anio: number
  /** Cómo va el ÚLTIMO reporte del año. */
  estado: EstadoReporte | null
  /** Quién hizo el último reporte, ya en forma de nombre propio. */
  autor: string
  /** ISO: cuándo se hizo el último reporte. */
  reportadoEn: string
  /** Los archivos vigentes del año, del más reciente al más antiguo. Uno solo: se muestra el archivo; varios: una carpeta. */
  archivos: ArchivoDeIndicador[]
}

/**
 * Los indicadores que tienen evidencia en el año, ya filtrados y en el orden en que se muestran: primero lo que se
 * reportó más recientemente.
 *
 * «Tiene evidencia» es que su último reporte del año lleva al menos un archivo (la base exige uno en cada reporte).
 * `ids` es el resultado de buscar por texto en la base (los indicadores cuyos archivos o nombre coinciden), o `null`
 * si no se buscó nada.
 */
export function indicadoresConEvidencia(
  lista: Indicador[],
  f: Pick<FiltroEvidencias, 'anio' | 'estado' | 'dependencia'>,
  ids: ReadonlySet<string> | null,
): Indicador[] {
  const con: { i: Indicador; creado: string }[] = []
  for (const i of lista) {
    const r = i.anios.find(a => a.anio === f.anio)?.enAnio?.reporte
    if (!r || r.nEvidencias < 1) continue
    if (f.dependencia !== null && i.dependencia !== f.dependencia) continue
    if (f.estado !== null && r.estado !== f.estado) continue
    if (ids !== null && !ids.has(i.uuid)) continue
    con.push({ i, creado: r.creado })
  }
  return con
    .sort((a, b) => (a.creado < b.creado ? 1 : a.creado > b.creado ? -1 : a.i.id - b.i.id))
    .map(x => x.i)
}

/** Arma las filas de una página: cada indicador con SUS archivos de ese año (los vigentes). */
export function armarFilasIndicador(
  pagina: Indicador[],
  anio: number,
  archivos: FilaDeVista[],
  relaciones: ReadonlyMap<string, IndicadorRelacionado[]> = new Map(),
): FilaIndicador[] {
  const porIndicador = new Map<string, FilaDeVista[]>()
  for (const a of archivos) {
    if (a.anio !== anio || a.reemplazada) continue
    const l = porIndicador.get(a.indicador_id)
    if (l) l.push(a); else porIndicador.set(a.indicador_id, [a])
  }
  return pagina.map(i => {
    const r = i.anios.find(a => a.anio === anio)?.enAnio?.reporte ?? null
    const propios = (porIndicador.get(i.uuid) ?? [])
      .slice()
      .sort((a, b) => (a.reportado_en < b.reportado_en ? 1 : a.reportado_en > b.reportado_en ? -1 : a.nombre.localeCompare(b.nombre, 'es')))
    return {
      indicadorFila: i.id,
      codigo: i.codigo,
      indicador: i.indicador,
      sector: i.sector,
      dependencia: i.dependencia,
      anio,
      estado: r?.estado ?? null,
      autor: r ? nombrePropio(r.autorNombre) : '',
      reportadoEn: r?.creado ?? '',
      archivos: propios.map(a => ({
        id: a.id,
        reporteId: a.reporte_id,
        nombre: a.nombre,
        tipo: a.tipo,
        categoria: categoriaDeMime(a.tipo),
        bytes: numero(a.bytes) ?? 0,
        conservada: a.conservada === true,
        estado: ESTADOS.find(e => e === a.estado_reporte) ?? null,
        observacion: a.observacion && a.observacion.trim() !== '' ? a.observacion : null,
        reportadoEn: a.reportado_en,
        autor: nombrePropio(a.autor_nombre),
        tambien: relaciones.get(a.id) ?? [],
      })),
    }
  })
}

/** Cuántos archivos de cada tipo hay, dicho en una línea («PDF ×2 · Imagen»). */
export function resumenDeTipos(archivos: Pick<ArchivoDeIndicador, 'categoria'>[]): string {
  const cuenta = new Map<string, number>()
  for (const a of archivos) {
    const k = a.categoria ? ETIQUETA_CATEGORIA[a.categoria] : 'Otro'
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  return [...cuenta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(' · ')
}

/** Del número de página y el total de filas: desde cuál hasta cuál se muestra y cuántas páginas hay. */
export function rangoDePagina(pagina: number, total: number, tamano = TAMANO_PAGINA): { desde: number; hasta: number; paginas: number; pagina: number } {
  const paginas = Math.max(1, Math.ceil(total / tamano))
  const p = Math.min(Math.max(1, pagina), paginas)
  return { desde: total === 0 ? 0 : (p - 1) * tamano + 1, hasta: Math.min(total, p * tamano), paginas, pagina: p }
}
