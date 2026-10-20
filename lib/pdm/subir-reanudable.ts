/**
 * Subir un archivo GRANDE (un video) al almacenamiento por partes, de modo que una conexión que se cae no lo empiece de cero.
 *
 * ── Por qué existe además de `subir.ts` ──────────────────────────────────
 *
 * `subir.ts` manda el archivo entero en una sola petición. Para un PDF de unos MB basta; para un video de 100 MB por la conexión de
 * una oficina (medida: ~1 MB/s), son minutos en los que cualquier corte lo tira todo y vuelve a empezar. Aquí el archivo viaja en
 * trozos de 6 MB (protocolo TUS, el que habla el almacenamiento de Supabase): si algo falla, se pregunta cuánto llegó y se sigue
 * desde ahí.
 *
 * ── La seguridad no cambia ───────────────────────────────────────────────
 *
 * El navegador no recibe permiso sobre el espacio de archivos. Recibe una FIRMA que el servidor creó para UNA ruta: no sirve para
 * otra (medido: el almacenamiento la rechaza) y vence sola. El tipo y el tamaño los vuelve a comprobar `reportar` leyendo el
 * almacenamiento, igual que con cualquier otro archivo.
 *
 * ── Qué se cuida ─────────────────────────────────────────────────────────
 *
 *   · Igual que `subirArchivo`: avisa del avance (0–1, nunca 1 hasta que el almacenamiento confirma) y corta si pasan 30 s SIN
 *     que avance un byte —pero aquí cortar es PAUSAR: se retoma desde lo que ya llegó, hasta dos veces.
 *   · Los fallos de red se reintentan solos con pausa creciente (lo hace la biblioteca, retomando donde iba).
 *   · Los mensajes dicen qué pasó en palabras de persona, con las mismas palabras que `subirArchivo`.
 *   · La biblioteca se carga SOLO cuando hay un video que subir: el resto de las pantallas no la descargan.
 *   · No se guarda en el navegador el rastro de subidas a medias: cada intento lleva su propia firma y su propia ruta, y retomar
 *     una subida con la firma de otra no serviría.
 */

import { ErrorDeSubida, MS_SIN_AVANCE, rechazo } from './subir'
import type { SubidaReanudable } from './seguimiento-acciones'

/** El tamaño de cada parte. El almacenamiento exige exactamente 6 MiB. */
export const BYTES_POR_PARTE = 6 * 1024 * 1024

/** Pausas entre reintentos de red (ms): la primera, enseguida. */
export const PAUSAS_DE_REINTENTO = [0, 1500, 4000, 10_000, 20_000]

/** Cuántas veces se retoma una subida que dejó de avanzar antes de rendirse. */
export const REANUDACIONES_MAXIMAS = 2

/**
 * La dirección que recibe las partes. Para archivos grandes Supabase recomienda su servidor directo de almacenamiento
 * (`<proyecto>.storage.supabase.co`); si la dirección del proyecto no tiene esa forma, se usa tal cual.
 */
export function direccionReanudable(urlProyecto: string): string {
  const u = new URL(urlProyecto)
  const proyecto = /^([a-z0-9]+)\.supabase\.co$/.exec(u.hostname)
  return `${u.protocol}//${proyecto ? `${proyecto[1]}.storage.supabase.co` : u.host}/storage/v1/upload/resumable/sign`
}

/** Lo mínimo que se usa de la subida de la biblioteca: así las pruebas ponen una de juguete. */
export interface SubidaTus {
  start(): void
  abort(shouldTerminate?: boolean): Promise<void>
}

export interface OpcionesTus {
  endpoint: string
  headers: Record<string, string>
  metadata: Record<string, string>
  chunkSize: number
  retryDelays: number[]
  uploadDataDuringCreation: boolean
  removeFingerprintOnSuccess: boolean
  storeFingerprintForResuming: boolean
  onProgress: (enviados: number, total: number) => void
  onSuccess: () => void
  onError: (error: Error) => void
}

export type CrearSubidaTus = (archivo: Blob, opciones: OpcionesTus) => Promise<SubidaTus>

/** La biblioteca de verdad, cargada cuando hace falta. */
const crearSubidaTusReal: CrearSubidaTus = async (archivo, opciones) => {
  const tus = await import('tus-js-client')
  return new tus.Upload(archivo, opciones) as unknown as SubidaTus
}

/** El estado HTTP de un error de la biblioteca, si lo trae (una respuesta del almacenamiento); `null` si fue la red. */
function estadoDe(error: Error): number | null {
  const r = (error as { originalResponse?: { getStatus?: () => number } | null }).originalResponse
  const estado = r?.getStatus?.()
  return typeof estado === 'number' && estado > 0 ? estado : null
}

export async function subirReanudable(
  destino: SubidaReanudable, ruta: string, archivo: Blob, tipo: string,
  { alProgreso, crear = crearSubidaTusReal, msSinAvance = MS_SIN_AVANCE, pausas = PAUSAS_DE_REINTENTO }: {
    alProgreso?: (fraccion: number) => void
    /** Solo para pruebas: la biblioteca, el silencio que se tolera y las pausas entre reintentos. */
    crear?: CrearSubidaTus
    msSinAvance?: number
    pausas?: number[]
  } = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let terminada = false
    let guardia: ReturnType<typeof setTimeout> | undefined
    let reanudaciones = 0
    let subida: SubidaTus | null = null

    const terminar = (fin: () => void) => {
      if (terminada) return
      terminada = true
      clearTimeout(guardia)
      fin()
    }

    const armar = () => {
      clearTimeout(guardia)
      guardia = setTimeout(() => {
        if (terminada || !subida) return
        // Dejó de avanzar: se PAUSA y se retoma desde lo que ya llegó (no desde cero).
        const actual = subida
        void actual.abort(false).catch(() => {}).finally(() => {
          if (terminada) return
          if (reanudaciones >= REANUDACIONES_MAXIMAS) {
            terminar(() => reject(new ErrorDeSubida('Dejó de avanzar. Revisa tu conexión.', false)))
            return
          }
          reanudaciones++
          armar()
          actual.start()
        })
      }, msSinAvance)
    }

    crear(archivo, {
      endpoint: destino.endpoint,
      headers: { 'x-signature': destino.firma, apikey: destino.apikey },
      metadata: { bucketName: destino.bucket, objectName: ruta, contentType: tipo, cacheControl: '3600' },
      chunkSize: BYTES_POR_PARTE,
      retryDelays: pausas,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: false,
      onProgress: (enviados, total) => {
        if (terminada) return
        armar()
        // Nunca 100 % hasta que el almacenamiento confirma (`onSuccess`): enviar todos los bytes no es haber terminado.
        if (total > 0) alProgreso?.(Math.min(0.99, enviados / total))
      },
      onSuccess: () => terminar(() => { alProgreso?.(1); resolve() }),
      onError: error => {
        const estado = estadoDe(error)
        terminar(() => reject(
          estado !== null
            ? new ErrorDeSubida(rechazo(estado), true)
            : new ErrorDeSubida('No se pudo subir. Revisa tu conexión.', false),
        ))
      },
    }).then(s => {
      if (terminada) return
      subida = s
      armar()
      s.start()
    }).catch(() => terminar(() => reject(new ErrorDeSubida('No se pudo preparar la subida del video. Recarga la página e intenta de nuevo.', false))))
  })
}
