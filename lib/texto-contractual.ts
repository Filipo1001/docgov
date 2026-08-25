/**
 * lib/texto-contractual.ts — Limpieza del texto que se pega desde el pliego.
 *
 * Obligaciones y actividades se cargan copiando y pegando desde un Word o un
 * PDF. Con el texto se arrastra el formato del original, y eso produjo defectos
 * reales en producción:
 *
 * ── La numeración duplicada ──────────────────────────────────────────────
 *
 * El pliego numera sus obligaciones, así que el texto pegado empieza por
 * «1.» y un tabulador. La aplicación numera por su cuenta —la pantalla
 * antepone `index + 1`— de modo que la primera obligación del contrato 169 se
 * leía «1. 1. Impulsar el funcionamiento…».
 *
 * Peor aún en el acta de supervisión: ahí la descripción va entre comillas
 * dentro de una frase, y quedaba `la obligación contractual relacionada con
 * "1.⇥Impulsar…"`. Un documento que se radica.
 *
 * ── Saltos de línea y espacios dobles ────────────────────────────────────
 *
 * Un PDF con el texto justificado se pega con saltos duros al final de cada
 * renglón visual. Al reflujarse en otro ancho, la frase queda partida por
 * donde no toca.
 *
 * ── Por qué son dos funciones y no una ───────────────────────────────────
 *
 * Se diferencian en una sola cosa, y es deliberada: qué hacen con los saltos
 * de línea.
 *
 * Una obligación es una cláusula, una sola frase; un salto ahí siempre sobra y
 * `normalizarObligacion` los aplana. Una actividad es el relato del mes, y 246
 * de las que hay en producción tienen varios párrafos puestos a propósito, así
 * que `normalizarActividad` los conserva. Aplanarlos destruiría formato que el
 * contratista escribió queriendo, y ese texto va impreso en el informe.
 *
 * ── La guarda del número ─────────────────────────────────────────────────
 *
 * Quitar «lo que parezca una numeración» es tentador y peligroso: una
 * obligación que empiece por «2.5% del presupuesto» perdería el «2.» y pasaría
 * a exigir un 5%. Por eso solo se retira cuando son una o dos cifras, el signo
 * va seguido de un espacio, y después viene una letra. «2.5%» no cumple
 * ninguna de las dos últimas condiciones.
 */

/** Numeración de lista al principio del texto: `1.`, `2)`, `15 -`… */
const NUMERACION_INICIAL = /^\s*\d{1,2}\s*[.)–-]\s+(?=[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ])/

/**
 * Deja el texto como debe guardarse: sin numeración heredada del pliego, en
 * una sola línea y sin espacios de más.
 *
 * Es idempotente — aplicarla dos veces da lo mismo que aplicarla una— y no
 * toca el contenido: solo lo que rodea a las palabras.
 */
export function normalizarObligacion(texto: string): string {
  return texto
    .replace(/[\t\r\n]+/g, ' ')   // tabuladores y saltos duros → un espacio
    .replace(NUMERACION_INICIAL, '')
    .replace(/\s{2,}/g, ' ')      // espacios dobles del texto justificado
    .trim()
}


/** Viñeta de lista al principio: `-`, `•`, `*`… */
const VINETA_INICIAL = /^[^\S\n]*[-•*–—·][^\S\n]+/

/** Cuenta las viñetas del texto, para distinguir una suelta de una lista. */
function vinetas(texto: string): number {
  return (texto.match(/[•·]/g) ?? []).length
}

/**
 * Deja una actividad como debe guardarse, CONSERVANDO sus saltos de línea.
 *
 * El informe de actividades imprime `actIndex + 1` justo antes de la
 * descripción, así que una actividad que ya traía su propio «4.» salía
 * numerada dos veces en el documento que se radica.
 *
 * La viñeta inicial solo se quita si es la única del texto. Cuando hay más, la
 * actividad es una lista con viñeta en cada renglón y retirarle únicamente la
 * primera la dejaría descuadrada.
 *
 * Los espacios se colapsan con una clase que excluye el salto de línea: `\s`
 * lo incluiría y aplanaría los párrafos, que es justo lo que aquí no se quiere.
 */
export function normalizarActividad(texto: string): string {
  const sinTabs = texto.replace(/\r/g, '').replace(/\t/g, ' ')
  const sinVineta = vinetas(sinTabs) <= 1 ? sinTabs.replace(VINETA_INICIAL, '') : sinTabs
  return sinVineta
    .replace(NUMERACION_INICIAL, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}
