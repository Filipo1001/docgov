/**
 * lib/dictado.ts — Motor de dictado por voz.
 *
 * ── Qué usa y por qué ────────────────────────────────────────────────────
 *
 * La API de reconocimiento de voz del propio navegador (`SpeechRecognition`,
 * prefijada `webkit` en casi todas partes). Es la única opción que cumple las
 * tres condiciones a la vez: gratuita, en tiempo real y sin instalar nada.
 *
 * Las descartadas, para que no se vuelvan a proponer:
 *  · Whisper en el navegador (WASM) — 40-75 MB de descarga y no alcanza
 *    tiempo real en un teléfono de gama media, que es el aparato real.
 *  · Whisper en nuestro servidor, o Deepgram / AssemblyAI / Google STT —
 *    todas cuestan por uso.
 *
 * A CAMBIO, EL AUDIO NO ES LOCAL. En Chrome el navegador lo envía a los
 * servidores de Google para transcribirlo; en Safari, a los de Apple. Es
 * gratis, pero no es privado, y por eso la interfaz lo dice en vez de
 * dejarlo implícito.
 *
 * ── El reinicio automático ───────────────────────────────────────────────
 *
 * La API no está pensada para dictado largo: se detiene sola en cuanto
 * detecta un silencio de unos segundos. Sin reiniciarla, el contratista que
 * se queda pensando a mitad de frase descubre que dejó de grabar. El bucle
 * de `onend` es lo que convierte una API de comandos cortos en un dictado
 * continuo, y es la pieza que de verdad hace funcionar esto.
 *
 * Se reinicia solo mientras `activo` siga en true; cuando el usuario para,
 * la bandera se apaga primero y el `onend` ya no vuelve a arrancar.
 */

/** Resultado parcial (gris, aún puede cambiar) o definitivo (ya confirmado). */
export type TrozoDictado = { texto: string; definitivo: boolean }

export type MotivoFin =
  | 'usuario'        // lo detuvo la persona
  | 'sin-permiso'    // negó el micrófono
  | 'sin-microfono'  // no hay dispositivo de entrada
  | 'sin-red'        // la API necesita conexión
  | 'error'

type Opciones = {
  onTrozo: (t: TrozoDictado) => void
  onFin: (motivo: MotivoFin, detalle?: string) => void
  /** Se dispara con cada resultado, para saber que sigue oyendo. */
  onActividad?: () => void
  /**
   * Traza de los eventos crudos de la API.
   *
   * Existe porque el comportamiento de esta API varía por navegador y por
   * versión, y sin ver los eventos reales cualquier arreglo es adivinanza.
   * La interfaz la muestra solo cuando el usuario abre el diagnóstico.
   */
  onEvento?: (linea: string) => void
}

/**
 * Tipos mínimos de la API. No están en el TypeScript estándar del DOM porque
 * la especificación nunca salió de borrador — de ahí el prefijo webkit.
 */
type ResultadoReconocimiento = {
  isFinal: boolean
  0: { transcript: string }
}
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

function constructor(): (new () => Reconocedor) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => Reconocedor
    webkitSpeechRecognition?: new () => Reconocedor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * ¿Este navegador puede dictar?
 *
 * Firefox no implementa la API, así que el botón no debe aparecer en vez de
 * aparecer y fallar. Se comprueba en el cliente: en el servidor no hay
 * `window` y devolver false ahí evitaría que el botón se pintara nunca.
 */
export function hayDictado(): boolean {
  return constructor() !== null
}

/**
 * Arranca el dictado. Devuelve la función para detenerlo.
 *
 * El contrato es deliberadamente pequeño —trozos de texto y un motivo de
 * fin— para que la limpieza y la interfaz no dependan de los detalles de la
 * API del navegador.
 */
export function iniciarDictado({ onTrozo, onFin, onActividad, onEvento }: Opciones): () => void {
  const traza = (l: string) => onEvento?.(l)
  const Ctor = constructor()
  if (!Ctor) {
    onFin('error', 'Este navegador no permite dictar')
    return () => {}
  }

  const w = window as unknown as { SpeechRecognition?: unknown }
  traza(`motor: ${w.SpeechRecognition ? 'SpeechRecognition' : 'webkitSpeechRecognition'}`)

  const rec = new Ctor()
  rec.lang = 'es-CO'
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1

  let activo = true
  let reinicios = 0
  let finalizado = false

  /** onFin se llama una sola vez, venga de donde venga el cierre. */
  const terminar = (motivo: MotivoFin, detalle?: string) => {
    if (finalizado) return
    finalizado = true
    onFin(motivo, detalle)
  }

  // Estos cuatro distinguen dónde se rompe la cadena: el navegador abrió la
  // sesión (start), tomó el micrófono (audiostart), oyó sonido (soundstart)
  // y lo reconoció como voz (speechstart). Si llega hasta speechstart y no
  // hay onresult, el problema es la transcripción, no el micrófono.
  rec.onstart = () => traza('· sesión abierta')
  rec.onaudiostart = () => traza('· micrófono tomado')
  rec.onsoundstart = () => traza('· sonido detectado')
  rec.onspeechstart = () => traza('· voz detectada')

  rec.onresult = (e) => {
    onActividad?.()
    traza(`onresult: ${e.results.length - e.resultIndex} tramo(s)`)
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      const texto = r[0]?.transcript ?? ''
      if (texto) onTrozo({ texto, definitivo: r.isFinal })
    }
    // Un resultado es señal de que el micrófono va bien: se perdona el
    // historial de reinicios para no agotar el tope en una sesión larga.
    reinicios = 0
  }

  rec.onerror = (e) => {
    // 'no-speech' y 'aborted' son ruido normal del ciclo de reinicio: la API
    // los lanza cada vez que un tramo termina en silencio. Cortar el dictado
    // ahí sería cortarlo cada vez que la persona piensa.
    traza(`onerror: ${e.error}`)
    if (e.error === 'no-speech' || e.error === 'aborted') return

    activo = false
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') terminar('sin-permiso')
    else if (e.error === 'audio-capture') terminar('sin-microfono')
    else if (e.error === 'network') terminar('sin-red')
    else terminar('error', e.error)
  }

  rec.onend = () => {
    traza(`onend (activo=${activo}, reinicios=${reinicios})`)
    // Cierre pedido por el usuario: aquí ya llegó el último onresult, que en
    // WebKit es donde se confirma lo dictado.
    if (!activo) { terminar('usuario'); return }
    // Tope de seguridad: si el navegador cierra la sesión una y otra vez sin
    // producir un solo resultado, reintentar en bucle sería quemar batería y
    // dejar al usuario mirando un micrófono encendido que no oye nada.
    if (reinicios >= 12) {
      activo = false
      terminar('error', 'El dictado se interrumpió repetidamente')
      return
    }
    reinicios++
    try {
      rec.start()
    } catch {
      // start() lanza si la sesión anterior aún no cerró del todo; el
      // siguiente onend vuelve a intentarlo.
    }
  }

  try {
    rec.start()
    traza('start() aceptado')
  } catch {
    activo = false
    traza('start() lanzó excepción')
    terminar('error', 'No se pudo iniciar el micrófono')
    return () => {}
  }

  return () => {
    // El orden importa: primero se apaga la bandera, para que el onend que
    // dispara el cierre no vuelva a arrancar el reconocedor.
    activo = false

    // stop() y NO abort(). Es la diferencia entre recuperar lo dictado y
    // perderlo: abort() descarta el audio que el motor aún no ha transcrito,
    // y en WebKit —todos los navegadores de iOS, Chrome incluido— los
    // resultados llegan como provisionales y solo se confirman al cerrar la
    // sesión. Con abort() se tiraba a la basura justo el texto que el usuario
    // acababa de ver en pantalla.
    try { rec.stop() } catch { traza('stop() lanzó excepción') }

    // Red de seguridad: si el navegador no dispara onend, se cierra igual
    // para que el botón no se quede en «Detener» para siempre.
    setTimeout(() => {
      if (!finalizado) { traza('cierre por tiempo (sin onend)'); terminar('usuario') }
    }, 1500)
  }
}
