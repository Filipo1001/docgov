import { pendientesDeValidar } from './correos/resumenes-armar'
import { cuentaDeAnio, cuentasPorPersona, POCOS_INDICADORES, type CuentaDeAnio } from './graficos'
import { agrupar, type Indicador } from './plan'
import type { PersonaDirectorio } from './personas'
import { ANIOS_PLAN, anioIniciado } from './seguimiento'

/**
 * El TABLERO del secretario de despacho: el inicio del módulo para el nivel «secretaría».
 *
 * Aquí está lo PURO (sin servidor, sin base, sin pantalla): las cuentas, el orden, las frases y las semanas. Las pantallas
 * (`components/pdm/tablero`) solo pintan lo que sale de aquí, y los datos de las otras secretarías los lee
 * `tablero-datos.ts` de la función de la migración 071.
 *
 * ── Las reglas de medición (no cambiar sin hablar con Felipe; ver `graficos.ts`) ─────────────────────────────────────────
 *
 *   · Cada año se mide contra SU meta. No hay «avance del cuatrienio».
 *   · Solo cuenta lo que la secretaría aprobó. Lo reportado y sin validar se ve aparte.
 *   · El denominador es siempre «indicadores con meta en el año». Nunca se suman valores de indicadores distintos.
 *   · Los cinco estados (aprobado, sin validar, devuelto, falta reportar, sin responsable) reparten sin sobrar ni faltar.
 *   · Sin ningún avance validado no se escribe «0 %»: sería decir que no se cumple cuando aún no se mide. Se escribe «—».
 *   · Con menos de cinco indicadores con meta se muestra la cifra («1 de 2»), no el porcentaje.
 *   · Las secretarías se ordenan por TAMAÑO, nunca por avance; y de las otras solo se ven números.
 *   · Las personas se miden por gestión (qué les falta, qué les devolvieron), sin puestos ni podio.
 */

// ─── Las cifras de un año ─────────────────────────────────────────────────────

/** Los números de un grupo de indicadores en un año: lo único que se comparte entre secretarías. */
export interface CifrasDeAnio {
  anio: number
  /** Indicadores con meta mayor que cero ese año: el denominador de todo. */
  conMeta: number
  aprobados: number
  porValidar: number
  devueltos: number
  faltan: number
  sinResponsable: number
  /** Llegaron a su meta con avance validado. */
  alcanzaron: number
  /** Con avance validado mayor que cero, sin llegar a la meta. */
  parciales: number
  /** Con algún avance validado (aunque sea cero). */
  conAvance: number
}

/** Una fila de `pdm_cifras_por_secretaria()` (migración 071), tal como la entrega la base. */
export interface FilaDeCifras {
  dependencia: string
  anio: number
  con_meta: number
  aprobados: number
  por_validar: number
  devueltos: number
  faltan: number
  sin_responsable: number
  alcanzaron: number
  parciales: number
  con_avance: number
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0
}

export const cifrasDeFila = (f: FilaDeCifras): CifrasDeAnio => ({
  anio: Number(f.anio), conMeta: n(f.con_meta), aprobados: n(f.aprobados), porValidar: n(f.por_validar), devueltos: n(f.devueltos),
  faltan: n(f.faltan), sinResponsable: n(f.sin_responsable), alcanzaron: n(f.alcanzaron), parciales: n(f.parciales), conAvance: n(f.con_avance),
})

/** La cuenta que ya arma el módulo con los indicadores que la sesión ve (la misma regla, calculada en TypeScript). */
export const cifrasDeCuenta = (c: CuentaDeAnio): CifrasDeAnio => ({
  anio: c.anio, conMeta: c.conMeta, aprobados: c.aprobados, porValidar: c.porValidar, devueltos: c.devueltos, faltan: c.faltan,
  sinResponsable: c.sinResponsable, alcanzaron: c.alcanzaron, parciales: c.parciales, conAvance: c.conAvance,
})

export const sinCifras = (anio: number): CifrasDeAnio => ({
  anio, conMeta: 0, aprobados: 0, porValidar: 0, devueltos: 0, faltan: 0, sinResponsable: 0, alcanzaron: 0, parciales: 0, conAvance: 0,
})

export function sumarCifras(anio: number, lista: CifrasDeAnio[]): CifrasDeAnio {
  const s = sinCifras(anio)
  for (const c of lista) {
    s.conMeta += c.conMeta; s.aprobados += c.aprobados; s.porValidar += c.porValidar; s.devueltos += c.devueltos; s.faltan += c.faltan
    s.sinResponsable += c.sinResponsable; s.alcanzaron += c.alcanzaron; s.parciales += c.parciales; s.conAvance += c.conAvance
  }
  return s
}

/** «Sin avance»: lo que no llegó a la meta ni va en avance (incluye lo que no tiene ningún avance validado). */
export const sinAvanceDe = (c: CifrasDeAnio): number => Math.max(0, c.conMeta - c.alcanzaron - c.parciales)

/** Los tres tramos del cumplimiento, en el orden en que se dibujan. */
export type TramoDeCumplimiento = 'cumplidos' | 'parciales' | 'sinAvance'
export const TRAMOS_DE_CUMPLIMIENTO: readonly TramoDeCumplimiento[] = ['cumplidos', 'parciales', 'sinAvance']

export const valorDeTramo = (c: CifrasDeAnio, t: TramoDeCumplimiento): number =>
  t === 'cumplidos' ? c.alcanzaron : t === 'parciales' ? c.parciales : sinAvanceDe(c)

/** Los cinco estados de un reporte, en el orden en que se dibujan. */
export type EstadoDeReporte = 'aprobados' | 'porValidar' | 'devueltos' | 'faltan' | 'sinResponsable'
export const ESTADOS_DE_REPORTE: readonly EstadoDeReporte[] = ['aprobados', 'porValidar', 'devueltos', 'faltan', 'sinResponsable']

/** Porcentaje entero de una parte. Nunca redondea hacia un extremo que no es cierto: 99,6 no es «100»; lo poco no es «0». */
export function pctEntero(parte: number, total: number): number {
  if (total <= 0 || parte <= 0) return 0
  const p = (100 * parte) / total
  if (p < 1) return 1
  return parte >= total ? 100 : Math.min(Math.round(p), 99)
}

/** ¿Hay algo que medir? El año tiene que haber empezado y haber al menos un indicador con meta. */
export const hayQueMedir = (c: CifrasDeAnio, anioActual: number): boolean => anioIniciado(c.anio, anioActual) && c.conMeta > 0

/** El centro de un anillo: el % cumplido, o nada («—») cuando ningún indicador tiene todavía un avance validado. */
export function centroDeAnillo(c: CifrasDeAnio): { pct: number | null } {
  return { pct: c.conMeta > 0 && c.conAvance > 0 ? pctEntero(c.alcanzaron, c.conMeta) : null }
}

// ─── Qué se compara y cómo se dice ────────────────────────────────────────────

export type MedidaDelTablero = 'cumplimiento' | 'reportes'

/**
 * La cifra de una fila de comparación (secretaría o sector): lo grande y lo pequeño debajo.
 *
 *   · Cumplimiento: «18 %» «cumplido»; con menos de cinco metas, «1 de 3» «pocas metas»; sin avances validados, «—».
 *   · Reportes: «35 %» «aprobado» (de los indicadores con meta); «—» mientras nadie haya reportado nada.
 */
export function textoDeFila(c: CifrasDeAnio, medida: MedidaDelTablero): { valor: string; nota: string } {
  if (c.conMeta === 0) return { valor: '—', nota: '' }
  if (medida === 'cumplimiento') {
    if (c.conAvance === 0) return { valor: '—', nota: 'sin avances validados' }
    if (c.conMeta < POCOS_INDICADORES) return { valor: `${c.alcanzaron} de ${c.conMeta}`, nota: 'pocas metas' }
    return { valor: `${pctEntero(c.alcanzaron, c.conMeta)} %`, nota: 'cumplido' }
  }
  if (c.aprobados + c.porValidar + c.devueltos === 0) return { valor: '—', nota: 'sin reportes' }
  if (c.conMeta < POCOS_INDICADORES) return { valor: `${c.aprobados} de ${c.conMeta}`, nota: 'pocas metas' }
  return { valor: `${pctEntero(c.aprobados, c.conMeta)} %`, nota: 'aprobado' }
}

// ─── Las secretarías ──────────────────────────────────────────────────────────

export interface SecretariaDeCifras {
  nombre: string
  porAnio: Record<number, CifrasDeAnio>
}

/** Agrupa las filas de la base por secretaría; cada año del plan sin fila queda en ceros (no se inventa nada). */
export function secretariasDeFilas(filas: FilaDeCifras[]): SecretariaDeCifras[] {
  const mapa = new Map<string, Record<number, CifrasDeAnio>>()
  for (const f of filas) {
    const porAnio = mapa.get(f.dependencia) ?? {}
    porAnio[Number(f.anio)] = cifrasDeFila(f)
    mapa.set(f.dependencia, porAnio)
  }
  return [...mapa].map(([nombre, porAnio]) => {
    for (const a of ANIOS_PLAN) porAnio[a] ??= sinCifras(a)
    return { nombre, porAnio }
  })
}

/**
 * El nombre de una secretaría para una fila: «Secretaría General de Gobierno» → «Gobierno», «Secretaría de Bienestar Social» →
 * «Bienestar Social». El nombre completo sigue disponible (se muestra al pasar el cursor). Si no se puede acortar, se deja entero.
 */
export function nombreCorto(nombre: string): string {
  const corto = nombre.replace(/^(secretar[ií]a|comisar[ií]a)\s+(general\s+)?de(\s+(la|los|las))?\s+/i, '').trim()
  return corto === '' ? nombre : corto
}

/** Lo que pesa una secretaría en el plan: sus indicadores con meta sumados en todos los años. Es el criterio de orden. */
export const tamanoDe = (s: SecretariaDeCifras): number => ANIOS_PLAN.reduce((t, a) => t + (s.porAnio[a]?.conMeta ?? 0), 0)

/**
 * Las secretarías por TAMAÑO (de la más grande a la más chica), y a igual tamaño por nombre. Nunca por avance. El tamaño suma
 * todos los años del plan: así el orden no cambia al cambiar de año y las barras no saltan de un lugar a otro.
 */
export function ordenarPorTamano(lista: SecretariaDeCifras[]): SecretariaDeCifras[] {
  return [...lista].sort((a, b) => tamanoDe(b) - tamanoDe(a) || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Las cifras de la propia secretaría en cada año del plan, calculadas con los indicadores que la sesión ya ve. */
export function propiaPorAnio(nombre: string, lista: Indicador[], anioActual: number): SecretariaDeCifras {
  const porAnio: Record<number, CifrasDeAnio> = {}
  for (const a of ANIOS_PLAN) porAnio[a] = cifrasDeCuenta(cuentaDeAnio(lista, a, anioActual))
  return { nombre, porAnio }
}

export interface FilaDeComparacion {
  nombre: string
  propia: boolean
  cifras: CifrasDeAnio
}

/**
 * Todas las secretarías en un año, por TAMAÑO. La propia viene de la lista que la sesión ya ve (calculada aquí, con la misma
 * regla), no de la base: así el anillo de «Tu secretaría» y su fila en la comparación son SIEMPRE la misma cifra.
 */
export function comparacionDelAnio(otras: SecretariaDeCifras[], propia: SecretariaDeCifras, anio: number): FilaDeComparacion[] {
  return ordenarPorTamano([...otras.filter(s => s.nombre !== propia.nombre), propia]).map(s => ({
    nombre: s.nombre, propia: s.nombre === propia.nombre, cifras: s.porAnio[anio] ?? sinCifras(anio),
  }))
}

// ─── Los sectores de la propia secretaría ─────────────────────────────────────

export interface SectorDeCifras {
  nombre: string
  cifras: CifrasDeAnio
}

/** Los sectores de una lista de indicadores en un año, por tamaño (suma de años) y a igual tamaño por nombre. */
export function sectoresDe(lista: Indicador[], anio: number, anioActual: number): SectorDeCifras[] {
  const grupos = agrupar(lista, i => i.sector)
  const tamano = (l: Indicador[]) => ANIOS_PLAN.reduce((t, a) => t + cuentaDeAnio(l, a, anioActual).conMeta, 0)
  return grupos
    .map(([nombre, l]) => ({ nombre, l, t: tamano(l) }))
    .sort((a, b) => b.t - a.t || a.nombre.localeCompare(b.nombre, 'es'))
    .map(({ nombre, l }) => ({ nombre, cifras: cifrasDeCuenta(cuentaDeAnio(l, anio, anioActual)) }))
}

// ─── La frase de lectura ──────────────────────────────────────────────────────

/** Un trozo de frase: lo `fuerte` va en negrilla (las cifras). */
export interface Trozo { texto: string; fuerte?: boolean }

const plural = (cantidad: number, uno: string, varios: string) => `${cantidad} ${cantidad === 1 ? uno : varios}`
const t = (texto: string, fuerte = false): Trozo => ({ texto, ...(fuerte ? { fuerte } : {}) })

/**
 * La frase con que abre el tablero: lo más importante del año en dos líneas.
 *
 *   titular  qué tan lejos está la secretaría de sus metas y qué espera su validación.
 *   detalle  lo demás que hay que hacer (devueltos, sin responsable, por reportar), en una línea.
 */
export function lecturaDelTablero(
  c: CifrasDeAnio, anioActual: number, antiguedadDias: number | null,
): { titular: Trozo[]; detalle: string } {
  const a = String(c.anio)
  if (!anioIniciado(c.anio, anioActual)) {
    return { titular: [t(`El ${a} empieza el 1 de enero de ${a}.`)], detalle: c.conMeta === 0 ? '' : `Sus ${c.conMeta} indicadores con meta se podrán reportar desde ese día.` }
  }
  if (c.conMeta === 0) return { titular: [t(`En ${a} ningún indicador tiene meta.`)], detalle: '' }

  const cerrado = c.anio < anioActual
  const titular: Trozo[] = []
  if (c.conAvance === 0) {
    titular.push(t('En '), t(a, true), t(' todavía no hay avances validados. Tu secretaría tiene '), t(String(c.conMeta), true), t(' indicadores con meta'))
    const partes: Trozo[][] = []
    if (c.sinResponsable > 0) partes.push([t(String(c.sinResponsable), true), t(' sin responsable')])
    if (c.faltan > 0) partes.push([t(String(c.faltan), true), t(' por reportar')])
    if (partes.length > 0) {
      titular.push(t(': '))
      partes.forEach((p, i) => { if (i > 0) titular.push(t(' y ')); titular.push(...p) })
    }
    titular.push(t('.'))
  } else {
    titular.push(t('En '), t(a, true), t(', '), t(String(c.alcanzaron), true), t(' de '), t(String(c.conMeta), true),
      t(` indicadores con meta ya ${c.alcanzaron === 1 ? 'la alcanzó' : 'la alcanzaron'}.`))
  }
  if (c.porValidar > 0) {
    titular.push(t(' Tienes '), t(plural(c.porValidar, 'reporte', 'reportes'), true), t(' por validar'))
    if (antiguedadDias !== null && antiguedadDias > 0) titular.push(t(', el más antiguo desde hace '), t(plural(antiguedadDias, 'día', 'días'), true))
    titular.push(t('.'))
  } else if (c.conAvance > 0) {
    titular.push(t(' No tienes reportes por validar.'))
  }

  const resto: string[] = []
  if (c.devueltos > 0) resto.push(`${plural(c.devueltos, 'reporte devuelto espera', 'reportes devueltos esperan')} corrección`)
  if (c.sinResponsable > 0 && c.conAvance > 0) resto.push(`${plural(c.sinResponsable, 'indicador no tiene', 'indicadores no tienen')} responsable`)
  if (c.faltan > 0 && c.conAvance > 0) resto.push(`${cerrado ? 'quedaron' : c.faltan === 1 ? 'falta' : 'faltan'} ${plural(c.faltan, 'indicador', 'indicadores')} por reportar`)
  const detalle = c.conAvance === 0
    ? (c.sinResponsable > 0 ? `Lo primero: repartir ${c.sinResponsable === 1 ? 'el indicador' : `los ${c.sinResponsable} indicadores`} sin responsable y habilitar a quienes ya los llevan.` : '')
    : resto.length ? `${resto.join('; ').replace(/^./, m => m.toUpperCase())}.` : ''
  return { titular, detalle }
}

// ─── Lo que necesita atención ─────────────────────────────────────────────────

export type ClaveDeAtencion = 'porValidar' | 'sinResponsable' | 'sinAcceso' | 'devueltos' | 'faltan'

export interface ItemDeAtencion {
  clave: ClaveDeAtencion
  cantidad: number
  titulo: string
  /** Qué significa, en una línea; si no hay nada, dice que está al día. */
  ayuda: string
  accion: string
}

/**
 * Lo que la secretaría puede hacer ahora, en un orden fijo (el que importa a quien decide: lo que espera su validación, lo que
 * no tiene dueño, quien no puede reportar, y lo demás). El orden NO cambia con las cifras para que nada salte de lugar.
 */
export function atencionDe(c: CifrasDeAnio, antiguedadDias: number | null, sinAcceso: number): ItemDeAtencion[] {
  return [
    {
      clave: 'porValidar', cantidad: c.porValidar, titulo: 'Reportes por validar', accion: 'Validar ahora',
      ayuda: c.porValidar === 0 ? 'Nada espera tu validación.' : antiguedadDias && antiguedadDias > 0 ? `El más antiguo lleva ${plural(antiguedadDias, 'día', 'días')} esperando.` : 'Esperan tu aprobación o tu devolución.',
    },
    {
      clave: 'sinResponsable', cantidad: c.sinResponsable, titulo: 'Indicadores sin responsable', accion: 'Repartir',
      ayuda: c.sinResponsable === 0 ? 'Todos tienen quien los lleve.' : 'Nadie los reporta todavía. Repártelos entre tu equipo.',
    },
    {
      clave: 'sinAcceso', cantidad: sinAcceso, titulo: 'Personas sin acceso al módulo', accion: 'Habilitar',
      ayuda: sinAcceso === 0 ? 'Todo tu equipo ya puede entrar.' : 'Tienen indicadores asignados y no pueden reportarlos.',
    },
    {
      clave: 'devueltos', cantidad: c.devueltos, titulo: 'Reportes devueltos', accion: 'Ver cuáles',
      ayuda: c.devueltos === 0 ? 'Ninguno espera corrección.' : 'Esperan que su autor los corrija.',
    },
    {
      clave: 'faltan', cantidad: c.faltan, titulo: 'Indicadores por reportar', accion: 'Ver la lista',
      ayuda: c.faltan === 0 ? 'No falta ninguno.' : 'Tienen responsable y aún no reportan.',
    },
  ]
}

// ─── El ritmo, semana a semana ────────────────────────────────────────────────

export interface SemanaDeRitmo {
  /** El lunes de la semana, `YYYY-MM-DD`. */
  semana: string
  enviados: number
  aprobados: number
}

const DIA_MS = 86_400_000
const aMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** El lunes de la semana de una fecha `YYYY-MM-DD` (las semanas del módulo empiezan el lunes). */
export function lunesDe(iso: string): string {
  const dia = new Date(aMs(iso)).getUTCDay() // 0 domingo … 6 sábado
  return aIso(aMs(iso) - ((dia + 6) % 7) * DIA_MS)
}

/**
 * Todas las semanas desde la de `desde` hasta la de `hasta`, con ceros donde no pasó nada: una barra ausente no es una barra de
 * cero, y el eje del tiempo no puede tener huecos. Lo que la base trae fuera del rango se descarta.
 */
export function semanasDeRitmo(filas: { semana: string; enviados: number; aprobados: number }[], desde: string, hasta: string): SemanaDeRitmo[] {
  const por = new Map(filas.map(f => [lunesDe(String(f.semana).slice(0, 10)), f]))
  const salida: SemanaDeRitmo[] = []
  for (let ms = aMs(lunesDe(desde)); ms <= aMs(lunesDe(hasta)); ms += 7 * DIA_MS) {
    const iso = aIso(ms)
    const f = por.get(iso)
    salida.push({ semana: iso, enviados: n(f?.enviados), aprobados: n(f?.aprobados) })
  }
  return salida
}

/**
 * Desde cuándo se dibuja el ritmo. El módulo abrió el 15 de octubre de 2026: lo anterior no es ritmo de trabajo (lo histórico de
 * 2024 y 2025 se cargó de una vez y las fechas de 2026 anteriores no existen). Cada año nuevo se dibuja desde el 1 de enero.
 */
export const INICIO_DEL_MODULO = '2026-10-15'
export const desdeDelRitmo = (anioActual: number): string => (anioActual === 2026 ? INICIO_DEL_MODULO : `${anioActual}-01-01`)

/**
 * Cuántos días lleva esperando el reporte más antiguo por validar, en cada año del plan (`null` si no hay ninguno). Se calcula en
 * el servidor, con la hora de Colombia, y se entrega ya hecho: el navegador no calcula con un reloj que puede estar mal.
 */
export function antiguedadesPorAnio(lista: Indicador[], ahora: Date): Record<number, number | null> {
  const pendientes = pendientesDeValidar(lista, ahora)
  return Object.fromEntries(ANIOS_PLAN.map(a => {
    const dias = pendientes.filter(p => p.anio === a).map(p => p.dias)
    return [a, dias.length ? Math.max(...dias) : null]
  }))
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «19 oct». */
export function etiquetaDeSemana(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}`
}

/** El tope del eje vertical: un múltiplo redondo por encima del máximo, con paso de 2, 5, 10 o 20. */
export function techoDelEje(maximo: number): { techo: number; marcas: number[] } {
  const m = Math.max(1, Math.ceil(maximo))
  const paso = m <= 10 ? 2 : m <= 20 ? 5 : m <= 50 ? 10 : m <= 100 ? 20 : 50
  const techo = Math.ceil(m / paso) * paso
  return { techo, marcas: [0, techo / 2, techo] }
}

// ─── El equipo ────────────────────────────────────────────────────────────────

export interface PersonaDeEquipo {
  id: string
  nombre: string
  indicadores: number
  /** Los que le faltan por reportar (con responsable y sin reporte). */
  porReportar: number
  porValidar: number
  devueltos: number
  aprobados: number
  /** Tiene indicadores asignados y no puede entrar al módulo. */
  sinAcceso: boolean
}

/**
 * Las personas con indicadores a su cargo en la lista, por nombre. Mide GESTIÓN (qué falta, qué espera, qué devolvieron), no
 * resultados: que una meta se cumpla depende de más cosas de las que una persona controla. El administrador no necesita acceso
 * al módulo y no se cuenta como «sin acceso».
 */
export function equipoDe(lista: Indicador[], personas: PersonaDirectorio[], anio: number, anioActual: number): PersonaDeEquipo[] {
  const cuentas = cuentasPorPersona(lista, anio, anioActual)
  const salida: PersonaDeEquipo[] = []
  for (const p of personas) {
    const c = cuentas.get(p.id)
    if (!c) continue
    salida.push({
      id: p.id, nombre: p.nombre, indicadores: c.total, porReportar: c.faltan, porValidar: c.porValidar, devueltos: c.devueltos,
      aprobados: c.aprobados, sinAcceso: p.acceso === null && p.rol !== 'admin',
    })
  }
  return salida.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
}

export type FiltroDeEquipo = 'todos' | 'pendientes' | 'sin_acceso'

export function filtrarEquipo(equipo: PersonaDeEquipo[], filtro: FiltroDeEquipo): PersonaDeEquipo[] {
  if (filtro === 'sin_acceso') return equipo.filter(p => p.sinAcceso)
  if (filtro === 'pendientes') return equipo.filter(p => p.porReportar + p.devueltos > 0)
  return equipo
}

// ─── Lo que el servidor entrega a la pantalla ─────────────────────────────────

/**
 * Todo lo que el tablero necesita además de los indicadores y las personas que la pantalla ya trae. Va ya calculado y es
 * serializable: el navegador no vuelve a preguntar nada ni calcula con su reloj.
 */
export interface DatosDelTablero {
  /** El nombre de la secretaría de quien mira. */
  secretaria: string
  anioActual: number
  /** Las demás secretarías, solo cifras. `null` si la base no las entregó: la comparación dice que no está disponible. */
  otras: SecretariaDeCifras[] | null
  /** Semana a semana desde `desdeDelRitmo` hasta hoy, sin huecos. `null` si no se pudo leer. */
  ritmo: SemanaDeRitmo[] | null
  desdeDelRitmo: string
  /** Días del reporte más antiguo por validar, en cada año. */
  antiguedadPorAnio: Record<number, number | null>
  /** La fecha de las cifras, dicha: «lunes 19 de octubre de 2026». */
  corte: string
}

/**
 * Arma lo que entrega el servidor. Lo que no se pudo leer (las otras secretarías, el ritmo) llega como `null` y la pantalla lo dice:
 * un tablero con una parte que falla sigue siendo útil, no se cae entero.
 */
export function datosDelTablero(a: {
  secretaria: string
  indicadores: Indicador[]
  filasDeCifras: FilaDeCifras[] | null
  filasDeRitmo: { semana: string; enviados: number; aprobados: number }[] | null
  anioActual: number
  ahora: Date
  /** Hoy en Colombia, `YYYY-MM-DD`. */
  hoy: string
  corte: string
}): DatosDelTablero {
  const desde = desdeDelRitmo(a.anioActual)
  return {
    secretaria: a.secretaria,
    anioActual: a.anioActual,
    otras: a.filasDeCifras === null ? null : secretariasDeFilas(a.filasDeCifras),
    ritmo: a.filasDeRitmo === null ? null : semanasDeRitmo(a.filasDeRitmo, desde, a.hoy),
    desdeDelRitmo: desde,
    antiguedadPorAnio: antiguedadesPorAnio(a.indicadores, a.ahora),
    corte: a.corte,
  }
}
