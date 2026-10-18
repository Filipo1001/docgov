/**
 * lib/lectura-planilla.ts — Comparar el TEXTO de una planilla PILA con lo que el sistema tiene declarado.
 *
 * Quien revisa una planilla compara datos con el documento: el número de planilla, el mes que cotiza, el IBC (la base de
 * cotización) y que sea de la persona correcta. Esta lectura lo hace por él y le dice dónde está cada dato; la decisión
 * sigue siendo suya.
 *
 * Es una COMPARACIÓN, no una extracción: se sabe qué se espera encontrar (lo declarado) y se busca en el texto. Eso
 * funciona aunque cada operador de pagos dibuje su planilla distinta —SOI, SimplePila, Aportes en Línea, ARUS…— porque
 * no hace falta saber dónde está la etiqueta, solo si el dato aparece.
 *
 * Honestidad ante todo: «no aparece» NO es «está mal». Un escaneo, una foto o una planilla con la fuente dañada no tienen
 * texto que leer; entonces el dato queda «sin comprobar» y lo mira la persona. Solo se afirma «distinto» cuando el
 * documento muestra otro mes, otro año u otro IBC con claridad. Y un documento que no parece una planilla no «coincide»
 * en nada: un número suelto en un acta no prueba que sea la planilla.
 *
 * Los casos que se cubren (cada uno tiene su prueba):
 *   · Documento: sin texto (escaneo), con texto ilegible (fuente dañada), que no es una planilla (un acta, un recibo).
 *   · Número: entero (no pegado a otras cifras) y también dibujado cifra a cifra («6 0 1 6 …»).
 *   · Mes: por nombre, abreviado con año («sep. 2026»), AAAA-MM, MM/AAAA; sin tomar por periodo una fecha completa;
 *     y el AÑO: «septiembre de 2025» en un informe de 2026 es otro periodo aunque el mes coincida.
 *   · IBC: montos con puntos o con comas de miles, con decimales («2.320.000,00»), partidos por un espacio y con «$»
 *     sin separadores; solo se propone un valor cuando es el único candidato claro.
 *   · Persona: la cédula del contratista aparece en la planilla (con o sin puntos).
 *
 * Sin dependencias de React ni del navegador, y sin expresiones con «lookbehind» (que los Safari anteriores a 16.4 no
 * entienden y harían fallar la pantalla entera): se prueba con texto de planillas.
 */

export type Veredicto = 'coincide' | 'distinto' | 'sin_comprobar'

/** Qué tan útil es el documento para la lectura. */
export type Calidad = 'ok' | 'sin_texto' | 'ilegible' | 'no_parece_planilla'

/** Lo que se buscará en el documento para resaltarlo: el texto tal como aparece. */
export interface Hallazgo {
  veredicto: Veredicto
  /** Lo que muestra el documento (para decir «la planilla dice…»); null si no se encontró nada. */
  encontrado: string | null
  /** El texto literal a resaltar sobre el documento; null si el dato está pero no se puede señalar. */
  fragmento: string | null
}

export interface HallazgoMes extends Hallazgo {
  /** Mes encontrado en MAYÚSCULAS, para ofrecerlo como valor («SEPTIEMBRE»). */
  mes: string | null
  /** Año con el que lo nombra el documento, si lo dice. */
  anio: number | null
  /** El mes coincide pero el año no: la planilla es de otro periodo. */
  otroAnio: boolean
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
  /** Año y mes DEL INFORME: de ahí se deduce de qué año debe ser el mes cotizado. */
  anio?: number | null
  mesInforme?: string | null
  /** La base de cotización vigente (la del sistema: personalizada o por defecto). */
  base: number
  /** Piso bajo el cual un monto no se toma por IBC. */
  piso: number
  /** Cédula del contratista (solo dígitos, o con puntos: se limpia). */
  cedula?: string | null
}

export interface Lectura {
  calidad: Calidad
  /** El documento tiene texto que se pudo comparar (ni escaneo, ni ilegible, ni otro tipo de documento). */
  hayTexto: boolean
  numero: Hallazgo
  mes: HallazgoMes
  ibc: HallazgoIbc
  /** La cédula del contratista aparece en el documento. */
  persona: Hallazgo
}

export const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const

/** Menos de esto (sin espacios) y el documento es, a efectos prácticos, una imagen. */
export const MINIMO_CARACTERES = 80

/** Más allá de esto no se lee: un PDF de cientos de páginas no es una planilla y no debe congelar la pantalla. */
export const MAXIMO_CARACTERES = 300_000

const SIN_COMPROBAR: Hallazgo = { veredicto: 'sin_comprobar', encontrado: null, fragmento: null }
const MES_SIN_COMPROBAR: HallazgoMes = { ...SIN_COMPROBAR, mes: null, anio: null, otroAnio: false }
const IBC_SIN_COMPROBAR: HallazgoIbc = { ...SIN_COMPROBAR, valor: null }

/** Quita tildes y pasa a mayúsculas: «Septiembre» y «SEPTIEMBRE» son lo mismo. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

const soloDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

// ─── Calidad del documento ───────────────────────────────────────────────────

/**
 * Lo que distingue a una planilla PILA de cualquier otro documento: sus rótulos y sus siglas. Cada grupo cuenta una vez.
 * Un acta o un recibo pueden decir «seguridad social» o «planilla» en una frase; no traen la mayoría de estos juntos.
 */
const MARCAS_DE_PLANILLA: RegExp[] = [
  /N[UÚ]MERO\s+(?:DE\s+)?PLANILLA|NUM[EÉ]RO\s+PLANILLA|PLANILLA\s+N/i,
  /TIPO\s+(?:DE\s+)?PLANILLA/i,
  /PER[IÍ]ODO\s+(?:DE\s+)?(?:COTIZACI[OÓ]N|PENSI[OÓ]N|SALUD|SERVICIO)/i,
  /\bIBC\b/i,
  /D[IÍ]AS\s+COT/i,
  /ADMINISTRADORA|\bADMIN\b/i,
  /\bPILA\b|\bSOI\b|SIMPLE|\bARUS\b|ENLACE\s+OPERATIVO|SU\s*APORTE|APORTES\s+EN\s+L[IÍ]NEA|MI\s+PLANILLA|ASOPAGOS/i,
  /(?:COTIZACI[OÓ]N|APORTE)\s+(?:PENSI|SALUD|ARL|RIESGOS)/i,
  /INDEPENDIENTE|DEPENDIENTE/i,
]

/**
 * Con cuántas marcas se considera planilla. Medido con las 348 planillas reales (17-oct-2026): 291 traen 3 o más; las que
 * traen una son fotos de una planilla impresa con un texto mal reconocido («I-lNDEPENDIENTES», «PERloDO»), que SÍ son
 * planillas y de las que aun así se lee el número; y las que traen cero son otra cosa (actas, propuestas comerciales,
 * tablas). Con una basta; con cero no parece planilla.
 */
export const MARCAS_MINIMAS = 1

export function marcasDePlanilla(texto: string): number {
  return MARCAS_DE_PLANILLA.filter(rx => rx.test(texto)).length
}

/** Proporción de caracteres que no son letras, cifras, espacios ni puntuación corriente: una fuente dañada da basura. */
export function proporcionDeBasura(texto: string): number {
  const compacto = texto.replace(/\s/g, '')
  if (!compacto) return 0
  const basura = compacto.replace(/[\p{L}\p{N}.,:;$()/\-_°#*&+%'"¿?¡!|·–—«»[\]]/gu, '')
  return basura.length / compacto.length
}

export function calidadDelTexto(texto: string): Calidad {
  if (texto.replace(/\s/g, '').length <= MINIMO_CARACTERES) return 'sin_texto'
  if (proporcionDeBasura(texto) > 0.3) return 'ilegible'
  if (marcasDePlanilla(texto) < MARCAS_MINIMAS) return 'no_parece_planilla'
  return 'ok'
}

// ─── Número de planilla ──────────────────────────────────────────────────────

export function buscarNumero(texto: string, declarado: string | null): Hallazgo {
  const digitos = soloDigitos(declarado)
  if (!digitos) return SIN_COMPROBAR
  // El número va solo: ni parte de uno más largo (una cédula, un número de autorización) ni con cifras pegadas.
  if (new RegExp(`(?:^|[^\\d])${digitos}(?!\\d)`).test(texto)) {
    return { veredicto: 'coincide', encontrado: digitos, fragmento: digitos }
  }
  // Algunos operadores dibujan cada cifra por separado, y al leer el texto quedan con espacios: «6 0 1 6 0 8 …».
  if (new RegExp(`(?:^|[^\\d])${digitos.split('').join('\\s?')}(?!\\d)`).test(texto)) {
    return { veredicto: 'coincide', encontrado: digitos, fragmento: null }
  }
  return SIN_COMPROBAR
}

// ─── Persona (cédula del contratista) ────────────────────────────────────────

/** La cédula, con o sin puntos y con o sin ceros a la izquierda. «No aparece» no prueba nada: puede ir enmascarada. */
export function buscarPersona(texto: string, cedula: string | null | undefined): Hallazgo {
  const base = soloDigitos(cedula)
  if (base.length < 5) return SIN_COMPROBAR
  for (const digitos of new Set([base, base.replace(/^0+/, '')])) {
    if (digitos.length < 5) continue
    const hallado = new RegExp(`(?:^|[^\\d])(${digitos.split('').join('[.\\s]?')})(?!\\d)`).exec(texto)
    // El fragmento es el texto tal como está en el documento («1.020.304.050»), que es lo que se puede resaltar.
    if (hallado) return { veredicto: 'coincide', encontrado: digitos, fragmento: hallado[1] }
  }
  return SIN_COMPROBAR
}

// ─── Mes de cotización ───────────────────────────────────────────────────────

interface Mencion { indice: number; anio: number | null; fragmento: string }

const NOMBRES = MESES.map(m => m.toLowerCase())
const LETRA = 'a-záéíóúñ'
const ABREVIATURAS: Record<string, number> = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, set: 8, oct: 9, nov: 10, dic: 11 }

/** El año que sigue a un mes escrito: «septiembre de 2026», «septiembre 2026», «septiembre/2026». */
function anioDespues(texto: string, desde: number): number | null {
  const m = /^[\s/\-.,]{0,3}(?:de(?:l)?\s+)?(20\d\d)(?!\d)/i.exec(texto.slice(desde, desde + 16))
  return m ? Number(m[1]) : null
}

function menciones(texto: string): Mencion[] {
  const lista: Mencion[] = []

  // Por nombre completo. Si lo sigue un año, se toma.
  const porNombre = new RegExp(`(^|[^${LETRA}])(${NOMBRES.join('|')})(?![${LETRA}])`, 'gi')
  for (const m of texto.matchAll(porNombre)) {
    const fin = (m.index ?? 0) + m[0].length
    lista.push({ indice: NOMBRES.indexOf(normalizar(m[2]).toLowerCase()), anio: anioDespues(texto, fin), fragmento: m[2] })
  }

  // Abreviado («sep. 2026»): solo con año detrás, y no si lo precede un día («25 Sep 2026» es la fecha de un pago).
  const abreviado = new RegExp(`(^|[^${LETRA}\\d])(${Object.keys(ABREVIATURAS).join('|')})\\.?[\\s/\\-]*(?:de\\s+)?(20\\d\\d)(?!\\d)`, 'gi')
  for (const m of texto.matchAll(abreviado)) {
    const inicio = (m.index ?? 0) + m[1].length
    if (/\d{1,2}\s*(?:de\s*)?$/i.test(texto.slice(Math.max(0, inicio - 8), inicio))) continue
    lista.push({ indice: ABREVIATURAS[m[2].toLowerCase()], anio: Number(m[3]), fragmento: m[0].slice(m[1].length) })
  }

  // AAAA-MM o AAAA/MM (sin día detrás) y MM-AAAA o MM/AAAA (sin día delante): una fecha completa no es un periodo.
  for (const m of texto.matchAll(/(^|[^\d/-])(20\d\d)[-/](0[1-9]|1[0-2])(?!\d|[-/]\d)/g)) {
    lista.push({ indice: Number(m[3]) - 1, anio: Number(m[2]), fragmento: m[0].slice(m[1].length) })
  }
  for (const m of texto.matchAll(/(^|[^\d/-])(0[1-9]|1[0-2])[-/](20\d\d)(?!\d)/g)) {
    lista.push({ indice: Number(m[2]) - 1, anio: Number(m[3]), fragmento: m[0].slice(m[1].length) })
  }
  return lista
}

/** Los meses que el documento nombra como PERIODO, con cuántas veces y con qué año (el más repetido, si lo dice). */
export function mesesDelDocumento(texto: string): { mes: string; veces: number; fragmento: string; anio: number | null }[] {
  const porMes = new Map<number, Mencion[]>()
  for (const m of menciones(texto)) porMes.set(m.indice, [...(porMes.get(m.indice) ?? []), m])
  return [...porMes].map(([indice, lista]) => {
    const anios = new Map<number, number>()
    for (const m of lista) if (m.anio != null) anios.set(m.anio, (anios.get(m.anio) ?? 0) + 1)
    const ordenados = [...anios].sort((a, b) => b[1] - a[1])
    // Con años distintos y empatados no se sabe cuál es: se calla.
    const anio = ordenados.length === 0 || (ordenados[1] && ordenados[1][1] === ordenados[0][1]) ? null : ordenados[0][0]
    return { mes: MESES[indice], veces: lista.length, fragmento: lista[0].fragmento, anio }
  }).sort((a, b) => b.veces - a.veces)
}

/**
 * ¿Es plausible este periodo (mes y año) para este informe? Se mide en meses desde el del informe: un pago por mes
 * vencido cae atrás (hasta 11 meses de rezago es raro pero ocurre), uno adelantado, a lo sumo un par de meses adelante.
 * Un año de diferencia exacto (septiembre de 2025 en un informe de septiembre de 2026) ya es otro periodo. Así el
 * diciembre → enero se resuelve solo: diciembre de 2026 está a un mes de un informe de enero de 2027.
 */
const MESES_ATRAS = 11
const MESES_ADELANTE = 2

function esPlausible(mes: string, anioDelDocumento: number, anio: number, mesInforme: string | null | undefined): boolean {
  const m = (MESES as readonly string[]).indexOf(normalizar(mes))
  const i = mesInforme ? (MESES as readonly string[]).indexOf(normalizar(mesInforme)) : -1
  // Sin el mes del informe no se puede medir la distancia: se admite el año del informe y el anterior.
  if (m < 0 || i < 0) return anioDelDocumento === anio || anioDelDocumento === anio - 1
  const distancia = (anioDelDocumento * 12 + m) - (anio * 12 + i)
  return distancia >= -MESES_ATRAS && distancia <= MESES_ADELANTE
}

export function buscarMes(texto: string, esperado: string, anio?: number | null, mesInforme?: string | null): HallazgoMes {
  const esperadoNorm = normalizar(esperado)
  const encontrados = mesesDelDocumento(texto)
  if (encontrados.length === 0) return MES_SIN_COMPROBAR

  const coincide = encontrados.find(e => e.mes === esperadoNorm)
  if (coincide) {
    // El mes coincide; ¿y el año? Solo se objeta si el documento lo dice y no es plausible para este informe.
    const otroAnio = !!anio && coincide.anio != null && !esPlausible(esperado, coincide.anio, anio, mesInforme)
    return {
      veredicto: otroAnio ? 'distinto' : 'coincide', encontrado: coincide.mes, fragmento: coincide.fragmento,
      mes: coincide.mes, anio: coincide.anio, otroAnio,
    }
  }

  // Otro mes, y con claridad: solo uno, o uno que aparece más veces que los demás.
  const [primero, segundo] = encontrados
  if (!segundo || primero.veces > segundo.veces) {
    // También aquí el año cuenta: «septiembre de 2025» en un informe de octubre de 2026 no es un mes vencido, es otro año.
    const otroAnio = !!anio && primero.anio != null && !esPlausible(primero.mes, primero.anio, anio, mesInforme)
    return { veredicto: 'distinto', encontrado: primero.mes, fragmento: primero.fragmento, mes: primero.mes, anio: primero.anio, otroAnio }
  }
  // Varios meses empatados y ninguno es el esperado: no se afirma nada.
  return { ...MES_SIN_COMPROBAR, encontrado: encontrados.map(e => e.mes).join(', ') }
}

// ─── IBC ─────────────────────────────────────────────────────────────────────

/**
 * Montos con separador de miles («2.320.000», «1,800,000»), con decimales («2.320.000,00»), partidos por un espacio
 * («2.320 .000») o con «$» y sin separadores («$2320000»); con su texto literal y cuántas veces salen.
 */
export function montosDelDocumento(texto: string): { valor: number; veces: number; fragmento: string }[] {
  const cuenta = new Map<number, { veces: number; fragmento: string }>()
  const sumar = (valor: number, fragmento: string) => {
    const previo = cuenta.get(valor)
    cuenta.set(valor, { veces: (previo?.veces ?? 0) + 1, fragmento: previo?.fragmento ?? fragmento })
  }
  // Junta los miles que la lectura del PDF dejó separados por un espacio.
  const unido = texto.replace(/(\d[.,])\s+(?=\d{3}(?!\d))/g, '$1').replace(/(\d)\s+(?=[.,]\d{3}(?!\d))/g, '$1')

  for (const m of unido.matchAll(/(^|[^\d.,])(\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d{1,2})?(?!\d)/g)) sumar(Number(m[2].replace(/\D/g, '')), m[2])
  for (const m of unido.matchAll(/\$\s?(\d{6,9})(?!\d)/g)) sumar(Number(m[1]), m[1])
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
  return IBC_SIN_COMPROBAR
}

// ─── Todo junto ──────────────────────────────────────────────────────────────

export function leerPlanilla(paginas: string[], esperado: Esperado): Lectura {
  const texto = paginas.join('\n').slice(0, MAXIMO_CARACTERES)
  const calidad = calidadDelTexto(texto)
  // Sin texto, ilegible o de otro tipo de documento: nada se da por comprobado.
  if (calidad !== 'ok') {
    return { calidad, hayTexto: false, numero: SIN_COMPROBAR, mes: MES_SIN_COMPROBAR, ibc: IBC_SIN_COMPROBAR, persona: SIN_COMPROBAR }
  }
  return {
    calidad,
    hayTexto: true,
    numero: buscarNumero(texto, esperado.numero),
    mes: buscarMes(texto, esperado.mes, esperado.anio, esperado.mesInforme),
    ibc: buscarIbc(texto, esperado.base, esperado.piso),
    persona: buscarPersona(texto, esperado.cedula),
  }
}
