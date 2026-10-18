/**
 * lib/lectura-planilla.ts — Comparar el TEXTO de una planilla PILA con lo que el sistema tiene declarado.
 *
 * Quien revisa una planilla compara tres datos con el documento: el número de planilla, el mes que cotiza y el IBC
 * (la base de cotización). Esta lectura lo hace por él y le dice dónde está cada dato; la decisión sigue siendo suya.
 *
 * Es una COMPARACIÓN, no una extracción: se sabe qué se espera encontrar (lo declarado) y se busca en el texto. Eso
 * funciona aunque cada operador de pagos dibuje su planilla distinta —SOI, SimplePila, Aportes en Línea, ARUS…— porque
 * no hace falta saber dónde está la etiqueta, solo si el dato aparece. Medido el 17-oct-2026 con 60 planillas reales:
 * 52 traen texto; en ellas el número aparecía en 51, el IBC esperado en 44 y el mes en 50.
 *
 * Honestidad ante todo: «no aparece» NO es «está mal». Un escaneo, una foto o una planilla de un formato raro no tienen
 * texto que leer; entonces el dato queda «sin comprobar» y lo mira la persona. Solo se afirma «distinto» cuando el
 * documento muestra otro mes u otro IBC con claridad.
 *
 * Sin dependencias de React ni del navegador: se prueba con texto de planillas.
 */

export type Veredicto = 'coincide' | 'distinto' | 'sin_comprobar'

/** Lo que se buscará en el documento para resaltarlo: el texto tal como aparece. */
export interface Hallazgo {
  veredicto: Veredicto
  /** Lo que muestra el documento (para decir «la planilla dice…»); null si no se encontró nada. */
  encontrado: string | null
  /** El texto literal a resaltar sobre el documento. */
  fragmento: string | null
}

export interface HallazgoMes extends Hallazgo {
  /** Mes encontrado en MAYÚSCULAS, para ofrecerlo como valor («SEPTIEMBRE»). */
  mes: string | null
}

export interface HallazgoIbc extends Hallazgo {
  /** El IBC que muestra el documento, para ofrecerlo como valor. */
  valor: number | null
}

export interface Esperado {
  /** El número de planilla declarado por el contratista. */
  numero: string | null
  /** El mes de cotización vigente (nombre, en cualquier mayúscula). */
  mes: string
  /** La base de cotización vigente (la del sistema: personalizada o por defecto). */
  base: number
  /** Piso bajo el cual un monto no se toma por IBC. */
  piso: number
}

export interface Lectura {
  /** El documento tiene texto que leer (no es un escaneo ni una imagen). */
  hayTexto: boolean
  numero: Hallazgo
  mes: HallazgoMes
  ibc: HallazgoIbc
}

export const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const

/** Menos de esto (sin espacios) y el documento es, a efectos prácticos, una imagen. */
export const MINIMO_CARACTERES = 80

const SIN_COMPROBAR: Hallazgo = { veredicto: 'sin_comprobar', encontrado: null, fragmento: null }

/** Quita tildes y pasa a mayúsculas: «Septiembre» y «SEPTIEMBRE» son lo mismo. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

// ─── Número de planilla ──────────────────────────────────────────────────────

export function buscarNumero(texto: string, declarado: string | null): Hallazgo {
  const digitos = (declarado ?? '').replace(/\D/g, '')
  if (!digitos) return SIN_COMPROBAR
  // El número va solo: ni parte de uno más largo (una cédula, un número de autorización) ni con dígitos pegados.
  if (new RegExp(`(?<!\\d)${digitos}(?!\\d)`).test(texto)) {
    return { veredicto: 'coincide', encontrado: digitos, fragmento: digitos }
  }
  return SIN_COMPROBAR
}

// ─── Mes de cotización ───────────────────────────────────────────────────────

/**
 * Los meses que el documento nombra como PERIODO, con cuántas veces. Reconoce:
 *   «septiembre de 2026» · «Septiembre 2026» · «2026-07» · «07/2026» · «septiembre» solo.
 * No toma por periodo una fecha completa («2026-07-27», «27/07/2026»): ahí el mes es el del pago, no el cotizado.
 */
export function mesesDelDocumento(texto: string): { mes: string; veces: number; fragmento: string }[] {
  const cuenta = new Map<string, { veces: number; fragmento: string }>()
  const sumar = (indice: number, fragmento: string) => {
    const mes = MESES[indice]
    const previo = cuenta.get(mes)
    cuenta.set(mes, { veces: (previo?.veces ?? 0) + 1, fragmento: previo?.fragmento ?? fragmento })
  }

  // Por nombre.
  const nombres = MESES.map(m => m.toLowerCase())
  const porNombre = new RegExp(`(?<![a-záéíóúñ])(${nombres.join('|')})(?![a-záéíóúñ])`, 'gi')
  for (const m of texto.matchAll(porNombre)) {
    sumar(nombres.indexOf(normalizar(m[1]).toLowerCase()), m[1])
  }
  // Numérico: AAAA-MM o AAAA/MM (sin día detrás) y MM-AAAA o MM/AAAA (sin día delante).
  for (const m of texto.matchAll(/(?<![\d/-])(20\d\d)[-/](0[1-9]|1[0-2])(?![\d]|[-/]\d)/g)) sumar(Number(m[2]) - 1, m[0])
  for (const m of texto.matchAll(/(?<![\d/-])(0[1-9]|1[0-2])[-/](20\d\d)(?![\d])/g)) sumar(Number(m[1]) - 1, m[0])

  return [...cuenta].map(([mes, v]) => ({ mes, ...v })).sort((a, b) => b.veces - a.veces)
}

export function buscarMes(texto: string, esperado: string): HallazgoMes {
  const esperadoNorm = normalizar(esperado)
  const encontrados = mesesDelDocumento(texto)
  if (encontrados.length === 0) return { ...SIN_COMPROBAR, mes: null }

  const coincide = encontrados.find(e => e.mes === esperadoNorm)
  if (coincide) return { veredicto: 'coincide', encontrado: coincide.mes, fragmento: coincide.fragmento, mes: coincide.mes }

  // Otro mes, y con claridad: solo uno, o uno que aparece más veces que los demás.
  const [primero, segundo] = encontrados
  if (!segundo || primero.veces > segundo.veces) {
    return { veredicto: 'distinto', encontrado: primero.mes, fragmento: primero.fragmento, mes: primero.mes }
  }
  // Varios meses empatados y ninguno es el esperado: no se afirma nada.
  return { ...SIN_COMPROBAR, encontrado: encontrados.map(e => e.mes).join(', '), mes: null }
}

// ─── IBC ─────────────────────────────────────────────────────────────────────

/** Montos con separador de miles («2.320.000», «1,800,000»), con su texto literal y cuántas veces salen. */
export function montosDelDocumento(texto: string): { valor: number; veces: number; fragmento: string }[] {
  const cuenta = new Map<number, { veces: number; fragmento: string }>()
  for (const m of texto.matchAll(/(?<![\d.,])\d{1,3}(?:[.,]\d{3})+(?![\d]|[.,]\d)/g)) {
    const valor = Number(m[0].replace(/\D/g, ''))
    const previo = cuenta.get(valor)
    cuenta.set(valor, { veces: (previo?.veces ?? 0) + 1, fragmento: previo?.fragmento ?? m[0] })
  }
  return [...cuenta].map(([valor, v]) => ({ valor, ...v })).sort((a, b) => b.veces - a.veces)
}

/**
 * El IBC aparece repetido en la planilla (pensión, salud, riesgos, caja…), así que, si el esperado no está, el candidato
 * es el monto que más se repite entre los plausibles. Solo se afirma «distinto» si hay un candidato claro.
 */
export function buscarIbc(texto: string, esperado: number, piso: number): HallazgoIbc {
  const montos = montosDelDocumento(texto)
  const igual = montos.find(m => m.valor === esperado)
  if (igual) return { veredicto: 'coincide', encontrado: igual.fragmento, fragmento: igual.fragmento, valor: igual.valor }

  const candidatos = montos.filter(m => m.veces >= 3 && m.valor >= piso && m.valor <= 100_000_000)
  const [primero, segundo] = candidatos
  if (primero && (!segundo || primero.veces > segundo.veces)) {
    return { veredicto: 'distinto', encontrado: primero.fragmento, fragmento: primero.fragmento, valor: primero.valor }
  }
  return { ...SIN_COMPROBAR, valor: null }
}

// ─── Todo junto ──────────────────────────────────────────────────────────────

export function leerPlanilla(paginas: string[], esperado: Esperado): Lectura {
  const texto = paginas.join('\n')
  const hayTexto = texto.replace(/\s/g, '').length > MINIMO_CARACTERES
  if (!hayTexto) {
    return {
      hayTexto: false,
      numero: SIN_COMPROBAR,
      mes: { ...SIN_COMPROBAR, mes: null },
      ibc: { ...SIN_COMPROBAR, valor: null },
    }
  }
  return {
    hayTexto: true,
    numero: buscarNumero(texto, esperado.numero),
    mes: buscarMes(texto, esperado.mes),
    ibc: buscarIbc(texto, esperado.base, esperado.piso),
  }
}
