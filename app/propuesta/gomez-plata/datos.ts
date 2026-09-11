/**
 * Los datos del municipio, en un solo sitio.
 *
 * Existen aparte porque los consumen DOS piezas —la página y el PDF— y un
 * nombre mal escrito en uno de los dos sería peor que en ninguno: la propuesta
 * se lee en pantalla y se archiva en papel, y quien la reciba vería las dos.
 *
 * EL NOMBRE DEL ALCALDE ESTÁ VERIFICADO contra el directorio de funcionarios
 * del propio municipio. Llegó escrito «Luis GuIllermo Perez Evheverri» y se
 * corrigió: es Echeverri, y Pérez lleva tilde. En un documento dirigido a esa
 * persona, su nombre es lo único que no admite una errata.
 */
export const GOMEZ_PLATA = {
  municipio: 'Gómez Plata',
  departamento: 'Antioquia',
  alcalde: 'Luis Guillermo Pérez Echeverri',
  /** Guardado en el repositorio: enlazar al sitio del municipio lo dejaría a
   *  merced de que ellos reorganicen su web, y sería el día de la reunión. */
  escudo: '/municipios/gomez-plata.png',
  implementacion: 3_500_000,
  mensualidad: 2_400_000,
} as const

/** $3.500.000 — como se escribe en Colombia, no como lo formatea el navegador. */
export function pesos(n: number): string {
  return '$' + n.toLocaleString('es-CO')
}
