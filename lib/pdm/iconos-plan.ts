import { Iconos, type LucideIcon } from '@/lib/iconos'

/**
 * El icono de cada indicador: el de su SECTOR.
 *
 * Los 257 indicadores del plan pertenecen a uno de 19 sectores (la clasificación del DNP, que es la misma en
 * todos los municipios), así que un icono por sector cubre a todos sin tocar la base de datos. La línea
 * estratégica (4) tiene el suyo para los resúmenes.
 *
 * Reglas de la casa (ver `lib/iconos.ts`): monocromos, y el icono nunca carga el significado solo; en las
 * listas el sector va como etiqueta accesible y como texto emergente, y en la ficha, escrito al lado.
 *
 * Un sector que no esté aquí (un plan nuevo con otro nombre) recibe el icono general, no un error.
 */

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const POR_SECTOR = new Map<string, LucideIcon>([
  ['inclusion social y reconciliacion', Iconos.sector.inclusionSocial],
  ['ambiental y desarrollo sostenible', Iconos.sector.ambiental],
  ['agricultura y desarrollo rural', Iconos.sector.agricultura],
  ['salud y proteccion social', Iconos.sector.salud],
  ['educacion', Iconos.sector.educacion],
  ['tecnologias de la informacion y la comunicacion', Iconos.sector.tic],
  ['defensa y policia', Iconos.sector.defensa],
  ['justicia y derechos humanos', Iconos.sector.justicia],
  ['deporte y recreacion', Iconos.sector.deporte],
  ['cultura y patrimonio', Iconos.sector.cultura],
  ['gobierno territorial', Iconos.sector.gobierno],
  ['trabajo', Iconos.sector.trabajo],
  ['agua potable y saneamiento basico', Iconos.sector.agua],
  ['comercio, industria y turismo', Iconos.sector.comercio],
  ['ciudad y territorio', Iconos.sector.ciudad],
  ['minas y energia', Iconos.sector.energia],
  ['vias y transporte', Iconos.sector.vias],
  ['vivienda', Iconos.sector.vivienda],
  ['planeacion estrategica y hacienda', Iconos.sector.hacienda],
])

/** El icono del sector de un indicador; el general si el sector no se conoce. */
export const iconoDeSector = (sector: string): LucideIcon => POR_SECTOR.get(sinTildes(sector)) ?? Iconos.sector.general

/** ¿El sector tiene icono propio? (Sirve para comprobar que ningún indicador del plan cae en el general.) */
export const sectorConIcono = (sector: string): boolean => POR_SECTOR.has(sinTildes(sector))

const LINEAS: LucideIcon[] = [Iconos.linea.bienestar, Iconos.linea.economia, Iconos.linea.habitat, Iconos.linea.seguridad]

/** El icono de una línea estratégica por su número («Línea 3 - Hábitat…» → el tercero); el general si no se lee. */
export function iconoDeLinea(linea: string): LucideIcon {
  const n = /^\s*l[ií]nea\s*(\d+)/i.exec(linea)
  return (n ? LINEAS[Number(n[1]) - 1] : undefined) ?? Iconos.sector.general
}
