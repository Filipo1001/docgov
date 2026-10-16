/**
 * Un importe en pesos para un campo de texto, y lo que hace falta para editarlo con comodidad.
 *
 * El campo de la base de cotización guarda solo los DÍGITOS y los muestra con sus puntos (1.750.905): con siete cifras
 * seguidas es fácil equivocarse. Formatear mientras se escribe tiene una trampa conocida: al reescribir el valor el
 * cursor salta al final, y corregir una cifra del medio se vuelve imposible. Aquí se calcula dónde debe quedar el cursor
 * (el mismo número de dígitos a su izquierda), y la comparación con el valor por defecto que el modal muestra debajo.
 *
 * Funciones puras, sin DOM, para poder probarlas.
 */
import { DEFAULT_BASE_COTIZACION_SS, calcularBaseCotizacionSS } from '@/lib/constants'

export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

/** «1750905» → «1.750.905». Vacío si no hay dígitos. Sin ceros a la izquierda. */
export function formatearImporte(digitos: string): string {
  const limpio = soloDigitos(digitos).replace(/^0+(?=\d)/, '')
  if (!limpio) return ''
  return Number(limpio).toLocaleString('es-CO')
}

/**
 * Dónde queda el cursor al reescribir el campo con puntos: tantas posiciones como dígitos tenía a su izquierda.
 * `textoNuevo` ya viene formateado; `cursorAntes` es la posición en lo que el usuario acaba de teclear (con o sin puntos).
 */
export function cursorTrasFormatear(textoTecleado: string, cursorAntes: number, textoNuevo: string): number {
  const digitosAIzquierda = soloDigitos(textoTecleado.slice(0, cursorAntes)).length
  if (digitosAIzquierda === 0) return 0
  let vistos = 0
  for (let i = 0; i < textoNuevo.length; i++) {
    if (/\d/.test(textoNuevo[i])) vistos++
    if (vistos === digitosAIzquierda) return i + 1
  }
  return textoNuevo.length
}

export type ComparacionConDefecto =
  | { tipo: 'vacio' }
  | { tipo: 'igual' }
  | { tipo: 'mayor'; diferencia: number }
  | { tipo: 'menor'; diferencia: number }
  /** Menor que el piso que usa el sistema: se avisa, no se impide. */
  | { tipo: 'bajo_piso'; diferencia: number; piso: number }

/** Cómo se compara lo escrito con el valor por defecto, para decírselo a quien edita. */
export function compararConDefecto(valor: number, porDefecto: number, piso: number = DEFAULT_BASE_COTIZACION_SS): ComparacionConDefecto {
  if (!Number.isFinite(valor) || valor <= 0) return { tipo: 'vacio' }
  if (valor < piso) return { tipo: 'bajo_piso', diferencia: porDefecto - valor, piso }
  if (valor === porDefecto) return { tipo: 'igual' }
  return valor > porDefecto
    ? { tipo: 'mayor', diferencia: valor - porDefecto }
    : { tipo: 'menor', diferencia: porDefecto - valor }
}

/**
 * De dónde sale el valor por defecto de la base, en una frase. Es la misma regla que aplica el Acta de Supervisión:
 * el 40 % del valor mensual efectivo, con un piso (`calcularBaseCotizacionSS`).
 */
export function explicarBasePorDefecto(valorMensualEfectivo: number): { valor: number; texto: string } {
  const valor = calcularBaseCotizacionSS(valorMensualEfectivo)
  const cuarenta = Math.round(valorMensualEfectivo * 0.4)
  const pesos = (n: number) => `$ ${n.toLocaleString('es-CO')}`
  const texto = valorMensualEfectivo <= 0
    ? `Sin valor mensual cargado: se usa el piso de ${pesos(DEFAULT_BASE_COTIZACION_SS)}.`
    : cuarenta > DEFAULT_BASE_COTIZACION_SS
      ? `El 40 % del valor mensual (${pesos(valorMensualEfectivo)}) es ${pesos(cuarenta)}.`
      : `El 40 % del valor mensual (${pesos(valorMensualEfectivo)}) es ${pesos(cuarenta)}, por debajo del piso: se usa el piso de ${pesos(DEFAULT_BASE_COTIZACION_SS)}.`
  return { valor, texto }
}
