/**
 * lib/redaccion.ts — Corrección de redacción via LanguageTool (API pública).
 *
 * Client-side only: la petición sale del NAVEGADOR del usuario directo a
 * api.languagetool.org (CORS habilitado por ellos). Ventajas de ese diseño:
 *  - Gratis y sin API key; el rate limit (20 req/min) aplica por IP del
 *    usuario, no por las IPs compartidas de Vercel → escala por sí solo.
 *  - Cero carga y cero costo en nuestro servidor.
 *
 * Qué corrige: ortografía, tildes, mayúsculas, puntuación y concordancia
 * gramatical. Por diseño NO parafrasea ni reescribe: cada cambio es un
 * reemplazo determinista sobre un error detectado — imposible que invente
 * contenido o cambie el significado (la restricción clave para informes
 * contractuales).
 */

export interface SegmentoCorreccion {
  texto: string
  /** true si este tramo fue modificado respecto al original */
  cambiado: boolean
}

export interface ResultadoCorreccion {
  textoCorregido: string
  /** Número de correcciones aplicadas */
  cambios: number
  /** Texto corregido partido en tramos, para resaltar los cambios en la UI */
  segmentos: SegmentoCorreccion[]
}

interface LTMatch {
  offset: number
  length: number
  replacements: { value: string }[]
}

const LT_ENDPOINT = 'https://api.languagetool.org/v2/check'
const TIMEOUT_MS = 10_000

/** Distancia de Levenshtein — los textos aquí son cortos (< 40 chars). */
function distancia(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[a.length][b.length]
}

/**
 * Elige el reemplazo más CERCANO al texto original (mínima distancia de
 * edición), no el primero de la lista. Ejemplo real: para "los informe",
 * LanguageTool ofrece ["el informe", "los informes"] — el primero cambia el
 * número (contradice la intención del usuario) y además produce "de el";
 * el segundo solo agrega la 's' que faltaba. Preservar la intención del
 * autor es la regla de oro de esta funcionalidad.
 */
function mejorReemplazo(original: string, replacements: { value: string }[]): string {
  const candidatos = replacements.slice(0, 5).map(r => r.value)
  let mejor = candidatos[0]
  let mejorDist = Infinity
  for (const c of candidatos) {
    const d = distancia(original.toLowerCase(), c.toLowerCase())
    if (d < mejorDist) { mejorDist = d; mejor = c }
  }
  return mejor
}

/**
 * Corrige el texto con LanguageTool y devuelve la versión sugerida con los
 * cambios marcados. Devuelve `cambios: 0` si el texto ya está bien.
 * Lanza Error con mensaje legible si el servicio no responde.
 */
export async function corregirRedaccion(texto: string): Promise<ResultadoCorreccion> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let matches: LTMatch[]
  try {
    const res = await fetch(LT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        text: texto,
        language: 'es',
        // 'default' evita reglas de estilo agresivas; solo errores reales
        level: 'default',
      }),
      signal: controller.signal,
    })
    if (res.status === 429) {
      throw new Error('Demasiadas correcciones seguidas — espera un minuto e intenta de nuevo')
    }
    if (!res.ok) throw new Error('El corrector no está disponible en este momento')
    const json = (await res.json()) as { matches?: LTMatch[] }
    matches = json.matches ?? []
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('El corrector tardó demasiado — verifica tu conexión')
    }
    throw e instanceof Error ? e : new Error('Error al corregir el texto')
  } finally {
    clearTimeout(timer)
  }

  // Solo matches con reemplazo concreto, ordenados por posición y sin solapes
  const aplicables = matches
    .filter(m => m.replacements?.[0]?.value != null && m.length > 0)
    .sort((a, b) => a.offset - b.offset)
    .filter((m, i, arr) => i === 0 || m.offset >= arr[i - 1].offset + arr[i - 1].length)

  if (!aplicables.length) {
    return { textoCorregido: texto, cambios: 0, segmentos: [{ texto, cambiado: false }] }
  }

  // Construir texto corregido + segmentos para resaltado, en una sola pasada
  const segmentos: SegmentoCorreccion[] = []
  let cursor = 0
  for (const m of aplicables) {
    if (m.offset > cursor) {
      segmentos.push({ texto: texto.slice(cursor, m.offset), cambiado: false })
    }
    const original = texto.slice(m.offset, m.offset + m.length)
    segmentos.push({ texto: mejorReemplazo(original, m.replacements), cambiado: true })
    cursor = m.offset + m.length
  }
  if (cursor < texto.length) {
    segmentos.push({ texto: texto.slice(cursor), cambiado: false })
  }

  return {
    textoCorregido: segmentos.map(s => s.texto).join(''),
    cambios: aplicables.length,
    segmentos,
  }
}
