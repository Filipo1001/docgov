/**
 * El lenguaje visual del módulo Plan de Desarrollo.
 *
 * ── De dónde sale ────────────────────────────────────────────────────────
 *
 * De Contratista Digital, no de una paleta nueva. La tinta es la de la marca (`#192031`, el
 * grafito del logotipo); los botones oscuros y el trazo sobrio son los de la aplicación; y la
 * forma de ordenar la información es la de los formatos oficiales de la alcaldía: cuadros con
 * rótulos en mayúscula sostenida («FORMATO», «CÓDIGO», «VERSIÓN», «FECHA») y datos debajo.
 *
 * El módulo se presentó antes con un verde azulado propio y tarjetas de colores. Servía para
 * distinguirlo, pero no pertenecía a la marca y se leía como un panel de control de plantilla.
 * Ahora se distingue por lo que dice (el nombre del plan en la cabecera) y no por otro color:
 * es la misma casa.
 *
 * ── Reglas ───────────────────────────────────────────────────────────────
 *
 *   · UN solo color de marca: la tinta. Acciones, enlaces, pestaña activa y foco, todo en tinta.
 *   · El color solo significa ESTADO (cumplido, atrasado, crítico…), y nunca sin una palabra al
 *     lado: un marcador pequeño más el texto. Nada de píldoras de colores.
 *   · Esquinas sobrias (6–8 px) y un solo borde fino. Sin sombras: la jerarquía la dan los
 *     rótulos, las reglas y el peso de la letra, no la elevación.
 *   · Los rótulos van en mayúscula con espaciado y los números son tabulares.
 *
 * Las clases viven aquí, enteras, para que cambiar un tono sea cambiarlo en un sitio (y para que
 * Tailwind las encuentre: no se arman por pedazos).
 */

export const TINTA = '#192031'

/**
 * Los botones que cuentan lo que pasa (`BotonAccion`): se hunden un poco al pulsarlos y, mientras trabajan o
 * al terminar, NO usan `disabled` (que los apagaría a media opacidad y se leería como «no se puede») sino
 * `aria-disabled`: siguen siendo ellos, solo que quietos.
 */
const BASE_ACCION =
  'relative inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-[background-color,border-color,transform,opacity] duration-150 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:pointer-events-none'

export const T = {
  // Superficies
  pagina: 'bg-[#F4F5F8]',
  panel: 'rounded-lg border border-[#DCE0E8] bg-white',
  regla: 'border-[#E6E9EF]',
  /** `divide-y` pinta con SU color, no con `border-*`: sin esto las divisiones salen negras. */
  divide: 'divide-[#E6E9EF]',
  reglaFuerte: 'border-[#DCE0E8]',

  // Texto
  tinta: 'text-[#192031]',
  suave: 'text-[#556072]',
  tenue: 'text-[#667085]',
  rotulo: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]',

  // Acciones
  boton:
    'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#192031] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#242F45] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40',
  botonChico:
    'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#192031] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#242F45] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40',
  botonSec:
    'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#C5CBD6] bg-white px-4 py-2.5 text-sm font-semibold text-[#192031] transition-colors hover:bg-[#F4F5F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40',
  botonSecChico:
    'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#C5CBD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#192031] transition-colors hover:bg-[#F4F5F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40',
  botonPeligro:
    'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#B42318] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#912018] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40',
  accionPrimaria: `${BASE_ACCION} bg-[#192031] px-4 py-2.5 text-sm text-white hover:bg-[#242F45]`,
  accionPrimariaChica: `${BASE_ACCION} bg-[#192031] px-3.5 py-2 text-xs text-white hover:bg-[#242F45]`,
  accionSecundaria: `${BASE_ACCION} border border-[#C5CBD6] bg-white px-4 py-2.5 text-sm text-[#192031] hover:bg-[#F4F5F8]`,
  accionSecundariaChica: `${BASE_ACCION} border border-[#C5CBD6] bg-white px-3 py-1.5 text-xs text-[#192031] hover:bg-[#F4F5F8]`,
  enlace: 'font-semibold text-[#192031] underline decoration-[#9AA3B5] underline-offset-2 transition-colors hover:decoration-[#192031]',

  // Campos
  campo:
    'w-full rounded-lg border border-[#C5CBD6] bg-white px-3 py-2.5 text-sm text-[#192031] placeholder-[#98A2B3] outline-none transition-colors focus:border-[#192031] focus:ring-1 focus:ring-[#192031] disabled:opacity-60',

  // Avisos (el color dice qué clase de aviso es; la palabra, qué pasó)
  avisoBien: 'rounded-lg border border-[#B7DEC9] bg-[#F1F8F4] px-3.5 py-2.5 text-sm text-[#1F5D43]',
  avisoMal: 'rounded-lg border border-[#F1C0BB] bg-[#FDF3F2] px-3.5 py-2.5 text-sm text-[#912018]',
  avisoNota: 'rounded-lg border border-[#DCE0E8] bg-[#F4F5F8] px-3.5 py-2.5 text-sm text-[#556072]',
} as const
