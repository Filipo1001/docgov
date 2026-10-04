import { nombrePropio } from './personas'
import { esAnioPlan, type EstadoReporte } from './seguimiento'

/**
 * La vista de evidencias: lo que se pregunta y lo que se pinta, sin leer nada.
 *
 * Pura: la lectura vive en `evidencias.ts` (`server-only`). Aquí se decide qué filtros valen (nada de lo que venga
 * en la dirección se cree: cada valor se contrasta con lo que de verdad existe), cómo se traducen a una consulta,
 * y cómo se ve cada fila.
 *
 * ── Qué se muestra por defecto ───────────────────────────────────────────
 *
 * Los archivos de las versiones VIGENTES de cada reporte. Cuando se corrige un reporte, la versión anterior queda
 * como historia (y lo que se conservó ya está en la nueva), así que mostrarla repetiría los mismos archivos. «Incluir
 * versiones anteriores» las trae, con su marca.
 */

export const TAMANO_PAGINA = 25
export const MAX_BUSQUEDA = 60

// ─── Tipos de archivo ─────────────────────────────────────────────────────────

export type CategoriaTipo = 'pdf' | 'imagen' | 'word' | 'excel'
export const CATEGORIAS: readonly CategoriaTipo[] = ['pdf', 'imagen', 'word', 'excel']

export const ROTULO_CATEGORIA: Record<CategoriaTipo, string> = {
  pdf: 'PDF', imagen: 'Imágenes', word: 'Word', excel: 'Excel',
}

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

/** Cómo se pide una categoría a la base: un tipo exacto, una lista o un prefijo. */
export function condicionDeCategoria(c: CategoriaTipo): { igual?: string; en?: string[]; prefijo?: string } {
  switch (c) {
    case 'pdf': return { igual: 'application/pdf' }
    case 'imagen': return { prefijo: 'image/' }
    case 'word': return { en: MIME_WORD }
    case 'excel': return { en: MIME_EXCEL }
  }
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

export type EstadoFiltro = 'aprobado' | 'pendiente' | 'devuelto' | 'observado'
export const ESTADOS_FILTRO: readonly EstadoFiltro[] = ['aprobado', 'pendiente', 'devuelto', 'observado']

export const ROTULO_ESTADO_FILTRO: Record<EstadoFiltro, string> = {
  aprobado: 'Aprobadas',
  pendiente: 'Sin validar',
  devuelto: 'Devueltas',
  observado: 'Archivos devueltos',
}

export interface FiltroEvidencias {
  /** Un año del plan; `null`: todos. */
  anio: number | null
  /** Texto que se busca en el nombre del archivo y en el indicador. Ya limpio. */
  q: string
  tipo: CategoriaTipo | null
  estado: EstadoFiltro | null
  dependencia: string | null
  /** Incluir las versiones de reportes que ya fueron corregidos. */
  historico: boolean
  /** Desde 1. */
  pagina: number
}

export const FILTRO_VACIO: FiltroEvidencias = {
  anio: null, q: '', tipo: null, estado: null, dependencia: null, historico: false, pagina: 1,
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
): FiltroEvidencias {
  const un = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const anio = un(p.anio)
  const n = anio !== undefined && /^\d{4}$/.test(anio) ? Number(anio) : NaN
  const pag = un(p.pagina)
  const pagina = pag !== undefined && /^\d{1,4}$/.test(pag) ? Math.max(1, Number(pag)) : 1
  const tipo = un(p.tipo)
  const estado = un(p.estado)
  const dep = un(p.dependencia)
  return {
    anio: esAnioPlan(n) ? n : null,
    q: limpiarBusqueda(un(p.q) ?? ''),
    tipo: CATEGORIAS.find(c => c === tipo) ?? null,
    estado: ESTADOS_FILTRO.find(e => e === estado) ?? null,
    dependencia: dep !== undefined && dependenciasValidas.includes(dep) ? dep : null,
    historico: un(p.historico) === '1',
    pagina,
  }
}

/** Los filtros como parámetros de la dirección; lo que está en su valor por defecto no se escribe. */
export function aParametros(f: Partial<FiltroEvidencias>): URLSearchParams {
  const s = new URLSearchParams()
  if (f.anio) s.set('anio', String(f.anio))
  if (f.q) s.set('q', f.q)
  if (f.tipo) s.set('tipo', f.tipo)
  if (f.estado) s.set('estado', f.estado)
  if (f.dependencia) s.set('dependencia', f.dependencia)
  if (f.historico) s.set('historico', '1')
  if (f.pagina && f.pagina > 1) s.set('pagina', String(f.pagina))
  return s
}

/**
 * Aplica los filtros a una consulta de `pdm_evidencias_vista`. Vive aquí y no en el lector del servidor para que la
 * prueba ejercite EXACTAMENTE lo mismo que la pantalla.
 *
 * `f.q` ya viene limpio (`limpiarBusqueda`): sin comas, paréntesis ni comodines, no puede romper el filtro. Se busca
 * en la columna `busqueda`, que ya está en minúsculas y sin tildes.
 */
// El constructor de consultas de PostgREST tiene un tipo muy cargado; aquí solo se le piden estos métodos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aplicarFiltros<Q extends Record<string, any>>(q: Q, f: FiltroEvidencias): Q {
  let r = q
  // Lo normal es ver solo las versiones vigentes: lo de una versión corregida es historia.
  if (!f.historico) r = r.eq('reemplazada', false)
  if (f.anio !== null) r = r.eq('anio', f.anio)
  if (f.dependencia !== null) r = r.eq('dependencia', f.dependencia)
  if (f.tipo !== null) {
    const c = condicionDeCategoria(f.tipo)
    if (c.igual) r = r.eq('tipo', c.igual)
    else if (c.en) r = r.in('tipo', c.en)
    else if (c.prefijo) r = r.like('tipo', `${c.prefijo}%`)
  }
  if (f.estado === 'observado') r = r.not('observacion', 'is', null)
  else if (f.estado !== null) r = r.eq('estado_reporte', f.estado)
  // Cada palabra escrita tiene que aparecer, en cualquier orden: «pse aprobada» encuentra «PSE - Transacción Aprobada».
  for (const palabra of claveDeBusqueda(f.q).split(' ')) {
    if (palabra !== '') r = r.ilike('busqueda', `%${palabra}%`)
  }
  return r
}

/** ¿Hay algún filtro puesto (sin contar la página)? */
export const hayFiltros = (f: FiltroEvidencias): boolean =>
  f.anio !== null || f.q !== '' || f.tipo !== null || f.estado !== null || f.dependencia !== null || f.historico

// ─── Las filas ────────────────────────────────────────────────────────────────

/** Una fila de `pdm_evidencias_vista`, tal como la devuelve la base. */
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

/** Una fila, lista para pintar. */
export interface EvidenciaFila {
  id: string
  nombre: string
  tipo: string
  categoria: CategoriaTipo | null
  bytes: number
  conservada: boolean
  /** El número del indicador en el plan (la clave que usan los enlaces a «Indicadores»). */
  indicadorFila: number
  codigo: string
  indicador: string
  sector: string
  dependencia: string
  anio: number
  valor: number | null
  /** Quién reportó, ya en forma de nombre propio. */
  autor: string
  /** ISO. */
  reportadoEn: string
  /** Cómo va el reporte al que pertenece el archivo; `null` si la base trae algo que no se entiende (no se inventa). */
  estado: EstadoReporte | null
  /** El reporte ya fue corregido: el archivo es historia. */
  reemplazada: boolean
  /** La nota con que la secretaría devolvió ESTE archivo, si lo hizo. */
  observacion: string | null
}

const ESTADOS: readonly EstadoReporte[] = ['pendiente', 'aprobado', 'devuelto']

const numero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function armarFilas(filas: FilaDeVista[]): EvidenciaFila[] {
  return filas.map(f => ({
    id: f.id,
    nombre: f.nombre,
    tipo: f.tipo,
    categoria: categoriaDeMime(f.tipo),
    bytes: numero(f.bytes) ?? 0,
    conservada: f.conservada === true,
    indicadorFila: f.indicador_fila,
    codigo: f.codigo,
    indicador: f.indicador,
    sector: f.sector,
    dependencia: f.dependencia,
    anio: f.anio,
    valor: numero(f.valor),
    autor: nombrePropio(f.autor_nombre),
    reportadoEn: f.reportado_en,
    estado: ESTADOS.find(e => e === f.estado_reporte) ?? null,
    reemplazada: f.reemplazada === true,
    observacion: f.observacion && f.observacion.trim() !== '' ? f.observacion : null,
  }))
}

/** Del número de página y el total de filas: desde cuál hasta cuál se muestra y cuántas páginas hay. */
export function rangoDePagina(pagina: number, total: number, tamano = TAMANO_PAGINA): { desde: number; hasta: number; paginas: number } {
  const paginas = Math.max(1, Math.ceil(total / tamano))
  const p = Math.min(Math.max(1, pagina), paginas)
  return { desde: total === 0 ? 0 : (p - 1) * tamano + 1, hasta: Math.min(total, p * tamano), paginas }
}
