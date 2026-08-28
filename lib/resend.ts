import { Resend } from 'resend'

let resendClient: Resend | null = null

export function getResendClient(): Resend | null {
  if (resendClient) return resendClient

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null

  resendClient = new Resend(apiKey)
  return resendClient
}

export const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'Contratista Digital <notificaciones@contratistadigital.com>'

/**
 * Control de ritmo de envío — la causa de que la radicación rápida no
 * notificara por correo.
 *
 * Resend limita a 2 peticiones por segundo. Los flujos masivos disparaban
 * TODOS los correos en paralelo (`Promise.allSettled` sobre 30 periodos), así
 * que la mayoría volvía con 429 y se descartaba en silencio: la notificación
 * en la campana sí quedaba grabada, el correo no salía, y nadie se enteraba.
 * No era exclusivo de la radicación rápida — el mismo patrón está en los
 * recordatorios masivos, el correo masivo del asesor y las aprobaciones y
 * rechazos en lote.
 *
 * Por eso el control vive AQUÍ y no en cada llamador: es la única puerta por
 * la que salen todos los correos de la aplicación. Un llamador nuevo queda
 * protegido sin acordarse de nada.
 *
 * Dos mecanismos, y hacen falta los dos:
 *   1. Una cola con espaciado fijo: nunca se emite más rápido que el límite.
 *   2. Reintento con espera creciente ante un 429: si el límite real cambia,
 *      o si otro proceso está gastando cupo a la vez, el correo se reintenta
 *      en vez de perderse.
 */
const MS_ENTRE_ENVIOS = 550        // < 2/s con margen
const REINTENTOS_429 = 3

let colaLibreEn = 0

function esperar(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

/** Reserva el siguiente turno de la cola global y espera a que llegue. */
async function turno(): Promise<void> {
  const ahora = Date.now()
  const salida = Math.max(ahora, colaLibreEn)
  colaLibreEn = salida + MS_ENTRE_ENVIOS
  const espera = salida - ahora
  if (espera > 0) await esperar(espera)
}

export interface ResultadoCorreo {
  ok: boolean
  id?: string
  error?: string
}

/**
 * Envía un correo respetando el ritmo permitido. Nunca lanza: devuelve el
 * resultado para que quien llama lo registre.
 */
export async function enviarCorreo(opciones: {
  to: string
  subject: string
  html: string
}): Promise<ResultadoCorreo> {
  const resend = getResendClient()
  if (!resend) return { ok: false, error: 'Resend no configurado (falta RESEND_API_KEY)' }

  for (let intento = 0; intento <= REINTENTOS_429; intento++) {
    await turno()
    try {
      const res = await resend.emails.send({ from: RESEND_FROM, ...opciones })
      if (!res.error) return { ok: true, id: res.data?.id }

      // 429: el límite sigue apretando. Esperar más y reintentar.
      const mensaje = res.error.message ?? String(res.error)
      const esLimite = /rate|429|too many/i.test(mensaje)
      if (esLimite && intento < REINTENTOS_429) {
        await esperar(1000 * (intento + 1))
        continue
      }
      return { ok: false, error: mensaje }
    } catch (e: unknown) {
      const mensaje = e instanceof Error ? e.message : String(e)
      if (intento < REINTENTOS_429 && /rate|429|too many/i.test(mensaje)) {
        await esperar(1000 * (intento + 1))
        continue
      }
      return { ok: false, error: mensaje }
    }
  }
  return { ok: false, error: 'límite de envío persistente tras varios reintentos' }
}
