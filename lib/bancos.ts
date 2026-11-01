/**
 * Catálogo de bancos y billeteras de Colombia: el nombre que se guarda en `usuarios.banco`, la entidad que lo emite,
 * su color y el icono oficial de su app.
 *
 * Los iconos (public/bancos/*.png, 128 px) son los que cada entidad publica para su app en la App Store de Colombia,
 * descargados el 31-oct-2026: es la única fuente que existe igual para todos (cuadrada, del mismo tamaño, del propio
 * banco), y por eso las tarjetas quedan congruentes entre sí. Dos excepciones a propósito:
 *  - Banco Pichincha usa el icono de Pibank, su app en Colombia (la «Pichincha Banca Móvil» es la de Ecuador).
 *  - Coopcentral e Itaú no tienen una app de personas publicada por ellos mismos: van con la tarjeta genérica.
 *
 * El color es el de la marca y el texto se elige por contraste (≥ 4,5:1 con el texto normal, medido uno por uno).
 * Cuando el icono tiene fondo blanco, el color viene de la marca y no del fondo del icono.
 */

export interface Banco {
  /** Como se guarda en `usuarios.banco` y como aparece en los formularios. */
  nombre: string
  /** Quién emite la cuenta: lo que se lee bajo el nombre en la tarjeta. */
  entidad: string
  /** Archivo en /public/bancos, o null si no hay icono oficial. */
  icono: string | null
  color: string
  /** true cuando el color es claro y el texto va oscuro (Bancolombia, Pibank…). */
  textoOscuro?: boolean
  /** Billetera ligada al celular: el número de la cuenta es el teléfono y se agrupa como tal. */
  billetera?: boolean
  /** Otras formas en que el nombre puede estar escrito en la base. */
  alias?: string[]
}

export const BANCOS: Banco[] = [
  { nombre: 'Bancolombia', entidad: 'Bancolombia S.A.', icono: 'bancolombia', color: '#FDDA24', textoOscuro: true },
  { nombre: 'Davivienda', entidad: 'Banco Davivienda S.A.', icono: 'davivienda', color: '#CC0E1A' },
  { nombre: 'Banco de Bogotá', entidad: 'Banco de Bogotá S.A.', icono: 'bogota', color: '#0058C1' },
  { nombre: 'BBVA', entidad: 'BBVA Colombia S.A.', icono: 'bbva', color: '#001391' },
  { nombre: 'Banco Popular', entidad: 'Banco Popular S.A.', icono: 'popular', color: '#105163' },
  { nombre: 'Banco Agrario', entidad: 'Banco Agrario de Colombia S.A.', icono: 'agrario', color: '#16813A' },
  { nombre: 'Banco de Occidente', entidad: 'Banco de Occidente S.A.', icono: 'occidente', color: '#003CA5' },
  { nombre: 'Banco Caja Social', entidad: 'Banco Caja Social S.A.', icono: 'cajasocial', color: '#1C4F9C', alias: ['Caja Social', 'BCSC'] },
  { nombre: 'Banco AV Villas', entidad: 'Banco Comercial AV Villas S.A.', icono: 'avvillas', color: '#D81A2C', alias: ['AV Villas'] },
  { nombre: 'DAVIbank (Scotiabank Colpatria)', entidad: 'Banco Colpatria Multibanca Colpatria S.A.', icono: 'davibank', color: '#C8102E', alias: ['Scotiabank Colpatria', 'Colpatria', 'Scotiabank', 'DAVIbank'] },
  { nombre: 'Banco GNB Sudameris', entidad: 'Banco GNB Sudameris S.A.', icono: 'gnb', color: '#9AC355', textoOscuro: true, alias: ['GNB Sudameris', 'Sudameris'] },
  { nombre: 'Banco Falabella', entidad: 'Banco Falabella S.A.', icono: 'falabella', color: '#2F7D32', alias: ['Falabella'] },
  { nombre: 'Banco Pichincha', entidad: 'Banco Pichincha S.A. · Pibank', icono: 'pibank', color: '#FFDD00', textoOscuro: true, alias: ['Pichincha', 'Pibank'] },
  { nombre: 'Banco Finandina', entidad: 'Banco Finandina S.A.', icono: 'finandina', color: '#D91E26', alias: ['Finandina'] },
  { nombre: 'Bancoomeva', entidad: 'Banco Coomeva S.A.', icono: 'bancoomeva', color: '#E01012', alias: ['Banco Coomeva', 'Coomeva'] },
  { nombre: 'Banco Serfinanza', entidad: 'Banco Serfinanza S.A.', icono: 'serfinanza', color: '#130488', alias: ['Serfinanza'] },
  { nombre: 'Banco W', entidad: 'Banco W S.A.', icono: 'bancow', color: '#FF6D03', textoOscuro: true },
  { nombre: 'Banco Mundo Mujer', entidad: 'Banco Mundo Mujer S.A.', icono: 'mundomujer', color: '#04439E', alias: ['Mundo Mujer'] },
  { nombre: 'Bancamía', entidad: 'Banco de las Microfinanzas Bancamía S.A.', icono: 'bancamia', color: '#C93D15' },
  { nombre: 'Nu', entidad: 'Nu Colombia', icono: 'nu', color: '#820AD1', alias: ['Nubank', 'Nu Colombia'] },
  { nombre: 'Lulo Bank', entidad: 'Lulo Bank S.A.', icono: 'lulo', color: '#1B2132', alias: ['Lulo'] },
  { nombre: 'Nequi', entidad: 'Nequi S.A. Compañía de Financiamiento', icono: 'nequi', color: '#200020', billetera: true },
  { nombre: 'Daviplata', entidad: 'Banco Davivienda S.A.', icono: 'daviplata', color: '#E0144A', billetera: true },
  { nombre: 'MOVii', entidad: 'Movii S.A.', icono: 'movii', color: '#DD035B', billetera: true },
  { nombre: 'dale!', entidad: 'Aval Soluciones Digitales S.A.', icono: 'dale', color: '#030038', billetera: true, alias: ['Dale'] },
  { nombre: 'Confiar', entidad: 'Confiar Cooperativa Financiera', icono: 'confiar', color: '#7AC147', textoOscuro: true },
  { nombre: 'Cotrafa', entidad: 'Cooperativa Financiera Cotrafa', icono: 'cotrafa', color: '#0F3C80' },
  { nombre: 'JFK Cooperativa Financiera', entidad: 'JFK Cooperativa Financiera', icono: 'jfk', color: '#1F7A3F', alias: ['JFK'] },
  { nombre: 'Coopcentral', entidad: 'Banco Cooperativo Coopcentral', icono: null, color: '#192031', alias: ['Banco Coopcentral'] },
  { nombre: 'Itaú', entidad: 'Itaú Colombia S.A.', icono: null, color: '#192031', alias: ['Banco Itaú', 'Itau'] },
]

/** Lo que ofrecen los formularios: el catálogo y, al final, «Otro». */
export const NOMBRES_BANCOS: string[] = [...BANCOS.map(b => b.nombre), 'Otro']

function clave(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^banco/, '')
}

const POR_CLAVE = new Map<string, Banco>()
for (const b of BANCOS) for (const n of [b.nombre, ...(b.alias ?? [])]) POR_CLAVE.set(clave(n), b)

/** El banco del catálogo que corresponde a un nombre guardado, sin importar tildes, mayúsculas ni «Banco». */
export function bancoDe(nombre: string | null | undefined): Banco | null {
  if (!nombre?.trim()) return null
  return POR_CLAVE.get(clave(nombre)) ?? null
}

/**
 * El número de cuenta agrupado para leerlo y dictarlo sin perderse:
 *  - Bancolombia, 11 dígitos: 123-456789-01, como lo imprime el propio banco;
 *  - billeteras, 10 dígitos: como un celular, 300 123 4567;
 *  - el resto: bloques de cuatro.
 * Si trae algo que no son dígitos (un guion que puso contratación, por ejemplo), se respeta lo escrito.
 */
export function agruparNumeroCuenta(numero: string, banco: Banco | null): string {
  const d = numero.replace(/[\s-]/g, '')
  if (!/^\d+$/.test(d)) return numero.trim()
  if (banco?.nombre === 'Bancolombia' && d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 9)}-${d.slice(9)}`
  if (banco?.billetera && d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return d.replace(/(\d{4})(?=\d)/g, '$1 ')
}
