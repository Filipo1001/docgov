/**
 * lib/obligaciones-texto.ts — Limpieza del texto de una obligación específica.
 *
 * Las obligaciones se cargan copiando y pegando desde el pliego, que casi
 * siempre es un Word o un PDF. Con el texto se arrastra el formato del
 * original, y eso produjo tres defectos reales en producción:
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
