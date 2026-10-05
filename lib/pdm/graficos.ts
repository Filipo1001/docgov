/**
 * Las cuentas detrás de los gráficos del Resumen.
 *
 * Sin `server-only` ni `'use client'`: las usa el navegador (al pintar) y las pruebas. Aquí no se lee nada de
 * ninguna parte: llega la lista de indicadores —la misma que ya tiene la pantalla— y salen cifras.
 *
 * ── Las tres reglas que sostienen todo ───────────────────────────────────
 *
 *   1. Un año se mide contra SU meta (la decisión de la Alcaldía, ver `seguimiento.ts`). No hay «avance del
 *      cuatrienio»: 192 de los 257 indicadores suman su meta de cuatro años, pero los otros 65 son constantes o
 *      irregulares (Morgues dotadas: 1, 1, 1, 1) y sumarlos sería inventar una regla que nadie fijó.
 *   2. Nunca se suman valores crudos entre indicadores (hay personas, hectáreas, documentos). Todo se agrega como
 *      CUÁNTOS indicadores están en cada punto, o como porcentaje de SU meta.
 *   3. Solo cuenta lo APROBADO por la secretaría. Lo reportado y sin validar se ve, pero no suma avance.
 *
 * ── Qué se cuenta ────────────────────────────────────────────────────────
 *
 * El denominador de todo es el mismo: los indicadores CON META en ese año (meta mayor que cero: con meta 0 no hay
 * nada que cumplir ni que reportar). Esos indicadores se reparten, sin dejar a nadie fuera ni contarlo dos veces,
 * en cinco puntos del reporte:
 *
 *   aprobado · sin validar · devuelto · falta reportar · sin responsable
 *
 * (los tres primeros salen del último reporte del año; «falta reportar» es el que tiene responsable y aún no ha
 * reportado; «sin responsable» es el que nadie lleva y por tanto nadie va a reportar). Además hay dos medidas de
 * avance, que dicen cosas distintas:
 *
 *   alcanzaron  cuántos llegaron a su meta (con avance validado). Es el «cumplimiento» de toda la vida del módulo.
 *   promedio    cuánto lleva cada uno de su meta, en promedio, con TOPE de 100 % (pasarse en uno no tapa lo que le falta
 *               a otro) y contando 0 al que aún no tiene avance validado (lo que no está validado no es avance).
 *
 * «Alcanzaron» es todo o nada: un indicador al 95 % cuenta cero. El promedio lo compensa; por eso van juntos.
 *
 * No se usan los estados «en ruta / atrasado / crítico»: sus umbrales son provisionales (los fija la Alcaldía) y un
 * gráfico los convertiría en una afirmación. Aquí todo lo que se pinta es un hecho.
 */

import { agrupar, type Indicador } from './plan'
import type { NivelPdm } from './niveles'
import { ANIOS_PLAN, anioIniciado, estadoDelAnio, type EstadoDelAnio, type EstadoReporte } from './seguimiento'

/** Los cinco puntos del reporte en que se reparten los indicadores con meta, de lo hecho a lo que nadie hará. */
export type ParteDeReportes = 'aprobados' | 'porValidar' | 'devueltos' | 'faltan' | 'sinResponsable'

export const PARTES: readonly ParteDeReportes[] = ['aprobados', 'porValidar', 'devueltos', 'faltan', 'sinResponsable']

export interface CuentaDeAnio {
  anio: number
  estado: EstadoDelAnio
  /** Cuántos indicadores hay en el grupo, tengan o no meta ese año. */
  total: number
  /** Con meta mayor que cero ese año: el denominador de todo lo demás. */
  conMeta: number
  /** Con un avance validado (aprobado) ese año. */
  conAvance: number
  /** Llegaron a su meta con avance validado. */
  alcanzaron: number
  /** Con avance validado MAYOR que cero pero sin llegar a la meta: van en camino. */
  parciales: number
  /**
   * 0–100, o `null` si no se puede decir: el año no ha empezado, no hay indicadores con meta o todavía no hay ni un
   * avance validado (un «0 %» sonaría a un plan que no cumple, cuando es un plan que aún no se mide).
   */
  avancePromedio: number | null
  aprobados: number
  porValidar: number
  devueltos: number
  faltan: number
  sinResponsable: number
}

/** Con menos indicadores con meta que esto, un porcentaje se mueve demasiado con uno solo: se avisa. */
export const POCOS_INDICADORES = 5

/** La cuenta de un año para un grupo de indicadores (todo el plan, una secretaría, una línea). */
export function cuentaDeAnio(lista: Indicador[], anio: number, anioActual: number): CuentaDeAnio {
  const estado = estadoDelAnio(anio, anioActual)
  const iniciado = anioIniciado(anio, anioActual)
  const c: CuentaDeAnio = {
    anio, estado, total: lista.length, conMeta: 0, conAvance: 0, alcanzaron: 0, parciales: 0, avancePromedio: null,
    aprobados: 0, porValidar: 0, devueltos: 0, faltan: 0, sinResponsable: 0,
  }
  let suma = 0
  for (const i of lista) {
    const a = i.anios.find(x => x.anio === anio)
    const meta = a?.meta ?? null
    if (!a || meta === null || meta <= 0) continue
    c.conMeta++
    if (!iniciado) continue

    // Un reporte manda sobre todo lo demás; sin reporte, «falta» si alguien lo lleva y si no, no lo lleva nadie.
    switch (a.enAnio?.situacion) {
      case 'aprobado': c.aprobados++; break
      case 'pendiente': c.porValidar++; break
      case 'devuelto': c.devueltos++; break
      case 'falta': c.faltan++; break
      default: c.sinResponsable++
    }

    if (a.avance !== null) {
      c.conAvance++
      suma += Math.min(a.avance / meta, 1)
      if (a.avance >= meta) c.alcanzaron++
      else if (a.avance > 0) c.parciales++
    }
  }
  if (iniciado && c.conMeta > 0 && c.conAvance > 0) c.avancePromedio = (100 * suma) / c.conMeta
  return c
}

/** La cuenta de cada año del plan, de 2024 a 2027. */
export const cuentasPorAnio = (lista: Indicador[], anioActual: number): CuentaDeAnio[] =>
  ANIOS_PLAN.map(a => cuentaDeAnio(lista, a, anioActual))

export interface CuentaDeGrupo {
  nombre: string
  cuenta: CuentaDeAnio
}

/** La cuenta de un año por grupos (secretaría, línea…), del grupo con más indicadores al que menos tiene. */
export function cuentasPorGrupo(
  lista: Indicador[], anio: number, anioActual: number, clave: (i: Indicador) => string,
): CuentaDeGrupo[] {
  return agrupar(lista, clave).map(([nombre, l]) => ({ nombre, cuenta: cuentaDeAnio(l, anio, anioActual) }))
}

/**
 * La cuenta de cada persona: sobre los indicadores que tiene asignados, como principal o de apoyo (el mismo criterio de
 * «Mi trabajo» y de la cifra que ya muestra la lista de personas: quien tiene un indicador a su cargo, de cualquier
 * modo, es quien tiene que reportarlo). Habla de GESTIÓN —qué le falta, qué le devolvieron, qué espera validación—
 * y no del resultado de los indicadores: que una meta se cumpla depende de más cosas de las que una persona controla.
 */
export function cuentasPorPersona(lista: Indicador[], anio: number, anioActual: number): Map<string, CuentaDeAnio> {
  const suyos = new Map<string, Indicador[]>()
  for (const i of lista) {
    for (const id of new Set(i.asignados.map(a => a.usuarioId))) {
      const l = suyos.get(id) ?? []
      l.push(i)
      suyos.set(id, l)
    }
  }
  return new Map([...suyos].map(([id, l]) => [id, cuentaDeAnio(l, anio, anioActual)]))
}

// ─── El mapa: una cuenta por cada cruce de dos grupos ─────────────────────────

export interface MapaDeGrupos {
  /** Del grupo con más indicadores al que menos. */
  filas: string[]
  /** En orden alfabético (las líneas se llaman «Línea 1…», «Línea 2…»). */
  columnas: string[]
  /** `celdas[fila][columna]`: la cuenta del año para los indicadores de ese cruce. */
  celdas: CuentaDeAnio[][]
  /** Cuántos indicadores con meta tiene el cruce más cargado: la escala del sombreado. */
  maximo: number
}

/** La cuenta de un año en cada cruce de dos agrupaciones (secretaría × línea). Todos los cruces suman el total. */
export function mapaDeGrupos(
  lista: Indicador[], anio: number, anioActual: number,
  fila: (i: Indicador) => string, columna: (i: Indicador) => string,
): MapaDeGrupos {
  const filas = agrupar(lista, fila).map(([nombre]) => nombre)
  const columnas = [...new Set(lista.map(columna))].sort((a, b) => a.localeCompare(b, 'es'))
  const celdas = filas.map(f => columnas.map(c =>
    cuentaDeAnio(lista.filter(i => fila(i) === f && columna(i) === c), anio, anioActual),
  ))
  return { filas, columnas, celdas, maximo: Math.max(0, ...celdas.flat().map(c => c.conMeta)) }
}

// ─── La carga: cuántos indicadores lleva cada persona ─────────────────────────

/** Los tramos de carga: lo bastante pocos para leerse de un vistazo, y cortados donde cambia lo que se le puede pedir a alguien. */
const TRAMOS_DE_CARGA: { rotulo: string; hasta: number }[] = [
  { rotulo: '1 a 5', hasta: 5 },
  { rotulo: '6 a 10', hasta: 10 },
  { rotulo: '11 a 20', hasta: 20 },
  { rotulo: '21 a 40', hasta: 40 },
  { rotulo: '41 o más', hasta: Infinity },
]

export interface DistribucionDeCarga {
  tramos: { rotulo: string; personas: number }[]
  /** Personas con al menos un indicador: las que no llevan nada no entran (no son «carga baja», son otra cosa). */
  personas: number
  minimo: number | null
  mediana: number | null
  maximo: number | null
}

/**
 * Cuántas personas hay en cada tramo de carga. No nombra a nadie: dice si el trabajo está repartido parejo, y quién lleva
 * qué lo dice la lista de personas, que ya viene ordenada por carga.
 */
export function distribucionDeCarga(cargas: number[]): DistribucionDeCarga {
  const con = cargas.filter(n => n > 0).sort((a, b) => a - b)
  const tramos = TRAMOS_DE_CARGA.map(t => ({ rotulo: t.rotulo, personas: 0 }))
  for (const n of con) tramos[TRAMOS_DE_CARGA.findIndex(t => n <= t.hasta)].personas++
  const mitad = Math.floor(con.length / 2)
  return {
    tramos,
    personas: con.length,
    minimo: con[0] ?? null,
    mediana: con.length === 0 ? null : con.length % 2 === 1 ? con[mitad] : (con[mitad - 1] + con[mitad]) / 2,
    maximo: con[con.length - 1] ?? null,
  }
}

// ─── La serie: cómo fue creciendo lo reportado en un año ──────────────────────

export interface PuntoDeSerie {
  /** Milisegundos desde 1970: el eje del tiempo. */
  t: number
  valor: number
  estado: EstadoReporte
}

/**
 * Los reportes VIGENTES de un año, del más antiguo al más reciente. Las versiones reemplazadas por una corrección son
 * historia (siguen en la trazabilidad) y no entran: la serie es lo que quedó dicho en cada momento, no cada intento.
 * Cada reporte trae el avance del año hasta ese día, así que la serie sube (o no) con cada uno.
 */
export function serieDelAnio(
  reportes: { anio: number; creado: string; valor: number; estado: EstadoReporte; vigente: boolean }[],
  anio: number,
): PuntoDeSerie[] {
  return reportes
    .filter(r => r.anio === anio && r.vigente)
    .map(r => ({ t: Date.parse(r.creado), valor: r.valor, estado: r.estado }))
    .filter(p => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t)
}

// ─── El cumplimiento: tres tramos, sobre uno o varios años ───────────────────

/**
 * El cumplimiento de un grupo de indicadores en uno o varios años, repartido en tres tramos que suman SIEMPRE el total:
 *
 *   cumplidos   llegaron a su meta (con avance validado)
 *   parciales   tienen avance validado, sin llegar a la meta
 *   sinAvance   todavía no tienen avance validado (los que no han reportado, los que esperan validación o fueron devueltos,
 *               y los que nadie lleva)
 *
 * Es un reparto de HECHOS: no usa los umbrales «en ruta / atrasado / crítico», que siguen provisionales.
 *
 * La unidad es la META ANUAL: un indicador con meta en 2025 y en 2026 cuenta dos veces si se piden los dos años, cada una
 * contra su propia meta (la decisión de la Alcaldía). Con un solo año, meta anual e indicador son lo mismo. Los años que
 * todavía no empiezan no se cuentan: no se espera nada de ellos y sumarían «sin avance» que no es cierto.
 */
export interface Cumplimiento {
  /** Los años que se sumaron (los pedidos que ya empezaron), de menor a mayor. */
  anios: number[]
  /** Metas anuales con meta mayor que cero: el denominador. */
  total: number
  cumplidos: number
  parciales: number
  sinAvance: number
  /** 0–100, o `null` si en ninguna meta hay todavía un avance validado (un «0 %» sonaría a un plan que no cumple, no que no se mide). */
  pctCumplido: number | null
  // El estado de los reportes, sumado en los mismos años (ver `CuentaDeAnio`): lo aprobado y lo que hay que hacer.
  aprobados: number
  sinResponsable: number
  faltan: number
  devueltos: number
  porValidar: number
}

export function cumplimientoDe(cuentas: CuentaDeAnio[], anios?: number[]): Cumplimiento {
  const usadas = cuentas
    .filter(c => c.estado !== 'proximo' && (anios === undefined || anios.includes(c.anio)))
    .sort((a, b) => a.anio - b.anio)
  const suma = (f: (c: CuentaDeAnio) => number) => usadas.reduce((t, c) => t + f(c), 0)
  const total = suma(c => c.conMeta)
  const cumplidos = suma(c => c.alcanzaron)
  const parciales = suma(c => c.parciales)
  return {
    anios: usadas.map(c => c.anio),
    total,
    cumplidos,
    parciales,
    sinAvance: total - cumplidos - parciales,
    pctCumplido: total > 0 && suma(c => c.conAvance) > 0 ? (100 * cumplidos) / total : null,
    aprobados: suma(c => c.aprobados),
    sinResponsable: suma(c => c.sinResponsable),
    faltan: suma(c => c.faltan),
    devueltos: suma(c => c.devueltos),
    porValidar: suma(c => c.porValidar),
  }
}

/**
 * Lo que viaja del servidor al panel de inicio: las cuentas de cada año (no los indicadores), que son pocas y bastan para
 * elegir años en el navegador sin volver a preguntar nada. Quién ve qué lo decide la base (ver `datos.ts`): el administrador y
 * Control Interno el plan entero, una secretaría su dependencia, un responsable sus indicadores.
 */
export interface DatosCumplimiento {
  nivel: NivelPdm
  /** El año calendario (hora de Colombia): de él depende qué años ya empezaron. */
  anioActual: number
  /** De quién habla el diagrama: del plan entero, de una secretaría, o de los indicadores de quien mira. */
  alcance: 'plan' | 'secretaria' | 'mios'
  /** Con alcance «secretaria»: cómo se llama. */
  secretaria: string | null
  /** Las cuentas de cada año del plan para ese alcance. */
  total: CuentaDeAnio[]
  /** Solo con alcance «plan»: una secretaría por fila, del grupo con más indicadores al que menos. */
  porSecretaria: { nombre: string; porAnio: CuentaDeAnio[] }[]
}

/** `null`: no hay nada que mostrar (el módulo no existe aquí, no se tiene acceso, o no hay indicadores). */
export type RespuestaCumplimiento = { estado: 'ok'; datos: DatosCumplimiento } | { estado: 'error' } | null

/** Los años que ya empezaron: los únicos que se pueden elegir para mirar el cumplimiento. */
export const aniosIniciados = (anioActual: number): number[] => ANIOS_PLAN.filter(a => anioIniciado(a, anioActual))

/** Los años elegidos, dichos: «2026», «2024 y 2025», «2024 a 2026», «todos los años». */
export function rotuloDeAnios(elegidos: number[], anioActual: number): string {
  const a = [...elegidos].sort((x, y) => x - y)
  const todos = aniosIniciados(anioActual)
  if (a.length === 0) return ''
  if (a.length === todos.length && a.length > 1 && a.every((v, i) => v === todos[i])) return 'todos los años'
  if (a.length === 1) return String(a[0])
  const seguidos = a.every((v, i) => i === 0 || v === a[i - 1] + 1)
  if (a.length === 2) return `${a[0]} y ${a[1]}`
  return seguidos ? `${a[0]} a ${a[a.length - 1]}` : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`
}

// ─── Palabras ─────────────────────────────────────────────────────────────────

const u = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Un porcentaje 0–100 para leer: «37 %». Sin dato, «—». Nunca redondea hacia un extremo que no es cierto. */
export function pctLegible(p: number | null): string {
  if (p === null) return '—'
  if (p > 0 && p < 1) return '<1 %'
  const r = Math.round(p)
  // 99,7 % redondea a 100 y diría «todos llegaron», que no es cierto: se queda en 99.
  return `${r >= 100 && p < 100 ? 99 : r} %`
}

/** El rótulo de cada punto, para una leyenda con la cifra aparte. Son las palabras que el módulo ya usa. */
export const ROTULO_DE_PARTE: Record<ParteDeReportes, string> = {
  aprobados: 'Aprobado',
  porValidar: 'Sin validar',
  devueltos: 'Devuelto',
  faltan: 'Falta reportar',
  sinResponsable: 'Sin responsable',
}

/** La cifra con su palabra, para frases corridas: «5 aprobados», «1 devuelto», «12 por reportar». */
export function textoDeParte(parte: ParteDeReportes, n: number): string {
  switch (parte) {
    case 'aprobados': return `${n} ${n === 1 ? 'aprobado' : 'aprobados'}`
    case 'porValidar': return `${n} sin validar`
    case 'devueltos': return `${n} ${n === 1 ? 'devuelto' : 'devueltos'}`
    case 'faltan': return `${n} por reportar`
    case 'sinResponsable': return `${n} sin responsable`
  }
}

/** Lo que dice la barra de reportes para un lector de pantalla: lo mismo que enseña, con todas las cifras. */
export function descripcionDeReportes(c: CuentaDeAnio): string {
  const con = u(c.conMeta, 'indicador con meta', 'indicadores con meta')
  if (c.estado === 'proximo') return `${c.anio} empieza el 1 de enero: ${con}, todavía sin reportes`
  return `Reportes de ${con} en ${c.anio}: ${PARTES.map(p => textoDeParte(p, c[p])).join(', ')}`
}

/**
 * La frase que abre el Resumen: lo que un administrador querría que le dijeran en voz alta. La arma el código con las
 * cuentas de arriba (nada escrito a mano), así que cambia sola con cada reporte.
 *
 * `titular` dice cómo va el año; `detalle`, qué lo frena y a quién le toca. En ese orden de urgencia: lo que espera a una
 * secretaría, lo que espera a quien reportó, lo que solo el administrador puede arreglar (indicadores sin responsable)
 * y, por último, lo que falta reportar (que suele ser lo más grande y lo que menos dice).
 */
export function lecturaDelAnio(c: CuentaDeAnio, porSecretaria: CuentaDeGrupo[]): { titular: string; detalle: string } {
  if (c.estado === 'proximo') {
    return {
      titular: `El ${c.anio} empieza el 1 de enero de ${c.anio}.`,
      detalle: c.conMeta === 0 ? '' : c.conMeta === 1
        ? 'Su único indicador con meta se podrá reportar desde ese día.'
        : `Sus ${c.conMeta} indicadores con meta se podrán reportar desde ese día.`,
    }
  }
  if (c.conMeta === 0) return { titular: `En ${c.anio} ningún indicador tiene meta.`, detalle: '' }

  const con = u(c.conMeta, 'indicador', 'indicadores')
  let titular: string
  if (c.avancePromedio === null) {
    titular = `En ${c.anio} todavía no hay avances validados.`
  } else if (c.alcanzaron === 0) {
    titular = `En ${c.anio}, 0 de ${con} con meta la han alcanzado; el avance promedio es ${pctLegible(c.avancePromedio)}.`
  } else {
    titular = `En ${c.anio}, ${c.alcanzaron} de ${con} con meta ya ${c.alcanzaron === 1 ? 'la alcanzó' : 'la alcanzaron'}; el avance promedio es ${pctLegible(c.avancePromedio)}.`
  }

  const frases: string[] = []
  if (c.porValidar > 0) {
    let f = `${u(c.porValidar, 'reporte espera', 'reportes esperan')} validación`
    // Con una sola secretaría no hay «dónde»: sería repetir el único nombre que existe.
    const mayor = porSecretaria.length > 1
      ? porSecretaria.reduce((a, b) => (b.cuenta.porValidar > a.cuenta.porValidar ? b : a))
      : null
    if (mayor && mayor.cuenta.porValidar === c.porValidar) f += ` en ${mayor.nombre}`
    else if (mayor && mayor.cuenta.porValidar * 2 > c.porValidar) f += `, la mayoría en ${mayor.nombre}`
    frases.push(f)
  }
  if (c.devueltos > 0) frases.push(`${u(c.devueltos, 'reporte devuelto espera', 'reportes devueltos esperan')} corrección`)
  if (c.sinResponsable > 0) frases.push(`${u(c.sinResponsable, 'indicador con meta no tiene', 'indicadores con meta no tienen')} responsable`)
  if (c.faltan > 0) frases.push(`${c.faltan === 1 ? 'Falta' : 'Faltan'} ${u(c.faltan, 'indicador', 'indicadores')} por reportar`)

  const detalle = frases.map(f => `${f.charAt(0).toUpperCase()}${f.slice(1)}.`).join(' ')
  return { titular, detalle }
}
