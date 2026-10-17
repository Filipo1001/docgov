/**
 * lib/numero-letras.ts — Los valores en letras de los documentos (español de Colombia, en mayúsculas).
 *
 * Una sola fuente para la cuenta de cobro, las actas y el texto que se guarda en el contrato. Antes había cuatro
 * conversores, y cada documento se equivocaba a su manera con la preposición ante «PESOS»:
 *
 *   · el acta de supervisión escribía «OCHO MILLONES PESOS» (falta «DE»);
 *   · la cuenta de cobro y el acta de pago, «TRES MILLONES QUINIENTOS MIL DE PESOS» (sobra «DE»).
 *
 * La regla (Diccionario panhispánico de dudas, «millón»): «millón», «millones» y «mil millones» son sustantivos y se
 * unen al nombre con «de» —«ocho millones de pesos»—, pero si detrás viene otra cifra, no: «tres millones quinientos
 * mil pesos». La aplica `conPesos`.
 *
 * Además: tildes también en mayúscula (MILLÓN, DIECISÉIS, VEINTIDÓS…) y «uno» apocopado ante un sustantivo
 * masculino: «VEINTIÚN MIL», «TREINTA Y UN MILLONES», «MIL UN PESOS». Las letras siempre van delante de PESOS, DÍAS o
 * MESES, así que el «uno» final también se apocopa.
 */

const UNIDADES = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
]
const VEINTES = [
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO',
  'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
]
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS',
  'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
]

/** «uno» ante un sustantivo masculino: VEINTIUNO → VEINTIÚN, TREINTA Y UNO → TREINTA Y UN. */
function apocopar(letras: string): string {
  return letras.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/\bUNO$/, 'UN')
}

function hasta999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  const resto = n % 100
  const decenas = resto < 20
    ? UNIDADES[resto]
    : resto < 30
      ? VEINTES[resto - 20]
      : resto % 10 === 0
        ? DECENAS[Math.floor(resto / 10)]
        : `${DECENAS[Math.floor(resto / 10)]} Y ${UNIDADES[resto % 10]}`
  return [CENTENAS[Math.floor(n / 100)], decenas].filter(Boolean).join(' ')
}

/** 0 a 999.999, con el «uno» de los miles ya apocopado (VEINTIÚN MIL). */
function hastaMillon(n: number): string {
  const miles = Math.floor(n / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (miles === 1) partes.push('MIL')
  else if (miles > 1) partes.push(`${apocopar(hasta999(miles))} MIL`)
  if (resto > 0) partes.push(hasta999(resto))
  return partes.join(' ')
}

/**
 * Un entero en letras, listo para anteponerse a PESOS, DÍAS o MESES.
 *   8_000_000     → «OCHO MILLONES»
 *   1_750_905     → «UN MILLÓN SETECIENTOS CINCUENTA MIL NOVECIENTOS CINCO»
 *   21_031_000    → «VEINTIÚN MILLONES TREINTA Y UN MIL»
 *   1_200_000_000 → «MIL DOSCIENTOS MILLONES»
 * Hasta 999.999.999.999. Los decimales se descartan; un negativo lleva «MENOS».
 */
export function numeroALetras(n: number): string {
  if (!Number.isFinite(n)) return ''
  const entero = Math.trunc(n)
  if (entero === 0) return 'CERO'
  if (entero < 0) return `MENOS ${numeroALetras(-entero)}`

  const millones = Math.floor(entero / 1_000_000)
  const resto = entero % 1_000_000
  const partes: string[] = []
  if (millones === 1) partes.push('UN MILLÓN')
  else if (millones > 1) partes.push(`${apocopar(hastaMillon(millones))} MILLONES`)
  if (resto > 0) partes.push(hastaMillon(resto))
  return apocopar(partes.join(' '))
}

/** Termina en MILLÓN o MILLONES (con o sin tilde): es cuando «PESOS» pide «DE». */
const TERMINA_EN_MILLON = /\bMILL(?:Ó|O)N(?:ES)?$/i

/**
 * Las letras de un valor unidas a «PESOS»: con «DE» solo si terminan en MILLÓN o MILLONES. Si el texto ya trae
 * «PESOS» o «DE PESOS» al final, lo rehace (las letras guardadas en el contrato pueden venir de cualquier versión).
 */
export function conPesos(letras: string): string {
  const limpio = letras.trim().replace(/\s+(?:DE\s+)?PESOS$/i, '')
  return TERMINA_EN_MILLON.test(limpio) ? `${limpio} DE PESOS` : `${limpio} PESOS`
}

/** Un valor en pesos, en letras: 8_000_000 → «OCHO MILLONES DE PESOS»; 3_500_000 → «TRES MILLONES QUINIENTOS MIL PESOS». */
export function pesosEnLetras(n: number): string {
  return conPesos(numeroALetras(n))
}

/**
 * Corrige la preposición ante «PESOS» dentro de un texto ya escrito, sin tocar nada más: «OCHO MILLONES PESOS M/CTE»
 * → «OCHO MILLONES DE PESOS M/CTE»; «… QUINIENTOS MIL DE PESOS M/L» → «… QUINIENTOS MIL PESOS M/L». Es para las letras
 * que ya están guardadas en los contratos (52 de 173 el 17-oct-2026 decían «MILLONES PESOS»), que algunos documentos
 * imprimen tal cual.
 */
export function corregirDePesos(texto: string): string {
  return texto.replace(/(\S+)\s+(?:DE\s+)?(PESOS)\b/gi, (_todo, palabra: string, pesos: string) =>
    TERMINA_EN_MILLON.test(palabra) ? `${palabra} DE ${pesos}` : `${palabra} ${pesos}`)
}

/**
 * El texto que se GUARDA en el contrato (`valor_letras_total`, `valor_letras_mensual`) al crearlo, editarlo o
 * importarlo: «OCHO MILLONES DE PESOS M/CTE». Vacío para 0.
 */
export function numerosALetras(n: number): string {
  if (!n || n === 0) return ''
  return `${pesosEnLetras(Math.round(n))} M/CTE`
}
