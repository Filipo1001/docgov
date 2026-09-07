/**
 * lib/dictado.ts — Motor de dictado por voz.
 *
 * ── Qué usa y por qué ────────────────────────────────────────────────────
 *
 * La API de reconocimiento de voz del propio navegador. Es la única opción
 * que cumple las tres condiciones a la vez: gratuita, en tiempo real y sin
 * instalar nada. Las descartadas, para que no se vuelvan a proponer: Whisper
 * en el navegador (40-75 MB y no alcanza tiempo real en un gama media) y
 * Whisper propio, Deepgram, AssemblyAI o Google STT (cuestan por uso).
 *
 * A CAMBIO, EL AUDIO NO ES LOCAL: Chrome lo manda a Google y Safari a Apple.
 * Es lo que lo hace gratis, y por eso se dice en vez de dejarlo implícito.
 *
 * ── Lo que se midió en aparatos reales ───────────────────────────────────
 *
 * Con la traza de eventos, sobre esta misma aplicación:
 *
 *   iPhone · webkitSpeechRecognition → 14 resultados en 7 s, TODOS
 *     provisionales. Ni un definitivo: WebKit confirma al cerrar la sesión.
 *   Mac · SpeechRecognition (sin prefijo) → toma el micrófono y no produce
 *     ni un evento de sonido ni un resultado. Muerto.
 *
 * De ahí las tres reglas que gobiernan este archivo:
 *
 *  1. SE PREFIERE LA INTERFAZ PREFIJADA. Parece al revés y no lo es: la sin
 *     prefijo es la nueva, puede resolver en el dispositivo y depende de que
 *     haya paquete de idioma instalado. La prefijada lleva años funcionando
 *     y es la única que existe en WebKit.
 *  2. SI LA ELEGIDA NO TRANSCRIBE, SE PRUEBA LA OTRA SOLA. Quien dicta no
 *     tiene por qué saber qué es una interfaz prefijada: el arreglo le toca
 *     al programa, no al usuario.
 *  3. NADA DE LO DICHO SE PIERDE AL CORTAR. Cada cierre de sesión avisa por
 *     `onCorte` para que quien escucha vuelque lo provisional antes de que
 *     el siguiente tramo lo reemplace.
 *
 * ── Los tiempos, sacados de la dinámica real ─────────────────────────────
 *
 * Un contratista dicta dos o tres frases, se calla a pensar, sigue. Puede
 * distraerse y dejar el teléfono encendido en el bolsillo. Los plazos salen
 * de eso y no de números redondos: ver la sección de constantes.
 */

/** Resultado parcial (gris, aún puede cambiar) o definitivo (ya confirmado). */
export type TrozoDictado = { texto: string; definitivo: boolean }

export type MotivoFin =
  | 'usuario'         // lo detuvo la persona
  | 'silencio'        // se cerró solo tras mucho rato sin voz
  | 'limite'          // se alcanzó el techo de sesión
  | 'sin-permiso'     // negó el micrófono
  | 'sin-microfono'   // no hay dispositivo de entrada
  | 'sin-red'         // la API necesita conexión
  | 'sin-resultados'  // ningún motor logró transcribir
  | 'error'

type Opciones = {
  onTrozo: (t: TrozoDictado) => void
  onFin: (motivo: MotivoFin, detalle?: string) => void
  /**
   * La sesión se cortó y va a reanudarse. Quien escucha debe volcar lo
   * provisional AQUÍ: en WebKit los resultados solo se confirman al cerrar,
   * así que sin este aviso cada reinicio se llevaría por delante la última
   * frase dictada.
   */
  onCorte?: () => void
  /** Traza de los eventos crudos, para diagnosticar sin adivinar. */
  onEvento?: (linea: string) => void
}

// ── Tiempos ────────────────────────────────────────────────────────────────

/**
 * Sin un solo resultado en este plazo, el motor no está transcribiendo y se
 * prueba el siguiente. Ocho segundos dan margen a que la persona se acomode
 * antes de hablar, y siguen siendo poco para descubrir que algo va mal.
 */
const SIN_TRANSCRIBIR_MS = 8_000

/**
 * Silencio con el micrófono abierto. Treinta segundos: quien dicta se queda
 * pensando cinco o diez, no treinta. Pasado eso lo más probable es que se
 * haya distraído, y dejar el micrófono caliente gasta batería y es feo.
 */
const SILENCIO_MS = 30_000

/** Techo de sesión. Una actividad dictada rara vez pasa de dos minutos. */
const MAX_SESION_MS = 180_000

/** Margen para que llegue el último resultado tras pedir el cierre. */
const GRACIA_CIERRE_MS = 1_800

/** Reinicios encadenados sin resultado antes de rendirse. */
const MAX_REINICIOS = 12

/**
 * Tipos mínimos de la API. No están en el TypeScript del DOM porque la
 * especificación nunca salió de borrador — de ahí el prefijo webkit.
 */
type ResultadoReconocimiento = { isFinal: boolean; 0: { transcript: string } }
type EventoReconocimiento = {
  resultIndex: number
  results: { length: number; [i: number]: ResultadoReconocimiento }
}
type Reconocedor = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: EventoReconocimiento) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  onaudiostart: (() => void) | null
  onsoundstart: (() => void) | null
  onspeechstart: (() => void) | null
}

type Motor = { nombre: string; Ctor: new () => Reconocedor }

/** Motores disponibles, el prefijado primero (ver cabecera). */
function motores(): Motor[] {
  if (typeof window === 'undefined') return []
  const w = window as unknown as {
    SpeechRecognition?: new () => Reconocedor
    webkitSpeechRecognition?: new () => Reconocedor
  }
  const lista: Motor[] = []
  if (w.webkitSpeechRecognition) lista.push({ nombre: 'webkit', Ctor: w.webkitSpeechRecognition })
  if (w.SpeechRecognition) lista.push({ nombre: 'estándar', Ctor: w.SpeechRecognition })
  return lista
}

/**
 * ¿Este navegador puede dictar?
 *
 * Firefox no implementa la API: ahí el botón no debe aparecer, en vez de
 * aparecer y fallar.
 */
export function hayDictado(): boolean {
  return motores().length > 0
}

export function iniciarDictado({ onTrozo, onFin, onCorte, onEvento }: Opciones): () => void {
  const traza = (l: string) => onEvento?.(l)
  const lista = motores()

  if (lista.length === 0) {
    onFin('error', 'Este navegador no permite dictar')
    return () => {}
  }

  let rec: Reconocedor | null = null
  let indiceMotor = 0
  let activo = true
  let finalizado = false
  let reinicios = 0
  let huboResultado = false
  let cierrePendiente: MotivoFin | null = null

  // Los plazos se registran para poder cancelarlos todos al cerrar: si no,
  // el techo de sesión seguiría vivo y dispararía sobre un motor ya muerto.
  const plazos = new Set<ReturnType<typeof setTimeout>>()
  const plazo = (ms: number, fn: () => void) => {
    const t = setTimeout(() => { plazos.delete(t); fn() }, ms)
    plazos.add(t)
    return t
  }
  const limpiarPlazos = () => {
    for (const t of plazos) clearTimeout(t)
    plazos.clear()
  }

  /** onFin se llama una sola vez, venga de donde venga el cierre. */
  const terminar = (motivo: MotivoFin, detalle?: string) => {
    if (finalizado) return
    finalizado = true
    activo = false
    limpiarPlazos()
    try { rec?.abort() } catch { /* ya estaba cerrado */ }
    traza(`FIN: ${motivo}`)
    onFin(motivo, detalle)
  }

  /**
   * Cierre ordenado: `stop()` y NO `abort()`.
   *
   * Es la diferencia entre recuperar lo dictado y perderlo. `abort()` descarta
   * el audio que el motor todavía no transcribió, y en WebKit los resultados
   * solo se confirman al cerrar la sesión — así que abortar tira justo el
   * texto que la persona acaba de ver en pantalla.
   */
  const pedirCierre = (motivo: MotivoFin) => {
    if (finalizado || cierrePendiente) return
    activo = false
    cierrePendiente = motivo
    traza(`cierre solicitado (${motivo})`)
    try { rec?.stop() } catch { traza('stop() lanzó excepción') }
    // Si el navegador no dispara onend, se cierra igual: el botón no puede
    // quedarse en «Detener» para siempre.
    plazo(GRACIA_CIERRE_MS, () => terminar(motivo))
  }

  /** Vigilante de silencio; se rearma con cada resultado. */
  let vigilanteSilencio: ReturnType<typeof setTimeout> | null = null
  const rearmarSilencio = () => {
    if (vigilanteSilencio) { clearTimeout(vigilanteSilencio); plazos.delete(vigilanteSilencio) }
    vigilanteSilencio = plazo(SILENCIO_MS, () => { if (activo) pedirCierre('silencio') })
  }

  function arrancar() {
    const motor = lista[indiceMotor]
    traza(`motor: ${motor.nombre}`)

    const r = new motor.Ctor()
    rec = r
    r.lang = 'es-CO'
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1

    // Estos cuatro dicen dónde se rompe la cadena: sesión abierta, micrófono
    // tomado, sonido oído, voz reconocida. Si llega a «voz» y no hay
    // onresult, falla la transcripción y no el micrófono.
    r.onstart = () => traza('· sesión abierta')
    r.onaudiostart = () => traza('· micrófono tomado')
    r.onsoundstart = () => traza('· sonido detectado')
    r.onspeechstart = () => traza('· voz detectada')

    r.onresult = (e) => {
      traza(`onresult: ${e.results.length - e.resultIndex} tramo(s)`)
      huboResultado = true
      reinicios = 0
      rearmarSilencio()
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const texto = res[0]?.transcript ?? ''
        if (texto) onTrozo({ texto, definitivo: res.isFinal })
      }
    }

    r.onerror = (e) => {
      traza(`onerror: ${e.error}`)
      // Ruido normal del ciclo de reinicio: la API los lanza cada vez que un
      // tramo acaba en silencio. Cortar aquí sería cortar cada vez que la
      // persona se queda pensando.
      if (e.error === 'no-speech' || e.error === 'aborted') return

      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') terminar('sin-permiso')
      else if (e.error === 'audio-capture') terminar('sin-microfono')
      else if (e.error === 'network') terminar('sin-red')
      else terminar('error', e.error)
    }

    r.onend = () => {
      traza(`onend (activo=${activo}, reinicios=${reinicios})`)

      // Cierre pedido: para aquí ya llegó el último resultado, que en WebKit
      // es donde se confirma lo dictado.
      if (!activo) { terminar(cierrePendiente ?? 'usuario'); return }

      // Se cortó sola y va a continuar: hay que volcar lo provisional antes
      // de que el próximo tramo lo reemplace.
      onCorte?.()

      if (reinicios >= MAX_REINICIOS) {
        terminar(huboResultado ? 'error' : 'sin-resultados')
        return
      }
      reinicios++
      try { r.start() } catch { /* aún cerrando; el siguiente onend reintenta */ }
    }

    try {
      r.start()
      traza('start() aceptado')
    } catch {
      traza('start() lanzó excepción')
      terminar('error', 'No se pudo iniciar el micrófono')
      return
    }

    // Si este motor no transcribe, se prueba el siguiente antes de rendirse.
    // Es el fallo medido en el Mac, y resolverlo cambiando de motor evita
    // tener que pedirle al usuario que cambie de navegador.
    plazo(SIN_TRANSCRIBIR_MS, () => {
      if (finalizado || huboResultado || !activo) return
      const siguiente = indiceMotor + 1
      if (siguiente >= lista.length) { terminar('sin-resultados'); return }

      traza(`sin transcribir en ${SIN_TRANSCRIBIR_MS / 1000} s → probando motor «${lista[siguiente].nombre}»`)
      indiceMotor = siguiente
      reinicios = 0
      // Se desconecta el onend del motor viejo: si no, su cierre reiniciaría
      // el que acabamos de descartar.
      r.onend = null
      try { r.abort() } catch { /* ya cerrado */ }
      arrancar()
    })
  }

  // El techo de sesión corre una sola vez: limita cuánto tiempo total puede
  // quedar abierto el micrófono, no cuánto dura cada tramo.
  plazo(MAX_SESION_MS, () => { if (activo) pedirCierre('limite') })
  rearmarSilencio()
  arrancar()

  return () => pedirCierre('usuario')
}
