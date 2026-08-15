import 'server-only'

/**
 * Cliente de la API de WhatsApp Cloud (Meta), directo y sin intermediario.
 *
 * Se eligió sobre Twilio por dos razones: cuesta menos —Meta no cobra
 * plataforma, solo los mensajes, y las plantillas de utilidad son gratis
 * dentro de la ventana de servicio— y porque un tercero menos es un tercero
 * menos viendo los teléfonos y el contenido de los mensajes de contratistas
 * del municipio.
 *
 * LO QUE HAY QUE ENTENDER DE WHATSAPP, y que el código anterior con Twilio
 * ignoraba: fuera de una ventana de 24 h desde el último mensaje del usuario,
 * NO se puede enviar texto libre. Solo plantillas previamente aprobadas por
 * Meta, referenciadas por nombre. Todas nuestras notificaciones las inicia el
 * sistema, así que TODAS deben ser plantillas. Los mensajes de texto libre que
 * construía `lib/whatsapp.ts` habrían sido rechazados en producción.
 */

// Meta mantiene varias versiones vivas a la vez y las va retirando por fecha.
// Se deja configurable para poder subirla sin desplegar código el día que la
// actual quede obsoleta; el valor por defecto es el que la propia consola de
// Meta genera hoy en sus ejemplos.
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v25.0'

export interface ParametroPlantilla {
  type: 'text'
  text: string
}

export type ResultadoWhatsApp =
  | { ok: true; id: string }
  | { ok: false; error: string; codigo?: number }

function configurado(): { phoneNumberId: string; token: string } | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_TOKEN
  if (!phoneNumberId || !token) return null
  return { phoneNumberId, token }
}

/** ¿Está el canal habilitado en este entorno? */
export function whatsappDisponible(): boolean {
  return configurado() !== null
}

/**
 * Envía una plantilla aprobada.
 *
 * @param telefonoE164 número en formato `573001234567` (sin «+»), ya normalizado
 * @param plantilla    nombre EXACTO registrado en WhatsApp Manager
 * @param parametros   valores de {{1}}, {{2}}… en orden
 * @param idioma       código de idioma de la plantilla en Meta
 */
export async function enviarPlantillaWhatsApp(
  telefonoE164: string,
  plantilla: string,
  parametros: string[],
  idioma = 'es',
): Promise<ResultadoWhatsApp> {
  const cfg = configurado()
  if (!cfg) return { ok: false, error: 'WhatsApp no configurado en este entorno' }

  const componentes = parametros.length
    ? [{
        type: 'body',
        parameters: parametros.map((text): ParametroPlantilla => ({ type: 'text', text })),
      }]
    : []

  try {
    // Timeout explícito: sin él, una API que no responde deja colgada la
    // función serverless hasta que la mata la plataforma.
    const control = new AbortController()
    const timer = setTimeout(() => control.abort(), 10_000)

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${cfg.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefonoE164,
          type: 'template',
          template: {
            name: plantilla,
            language: { code: idioma },
            components: componentes,
          },
        }),
        signal: control.signal,
      },
    ).finally(() => clearTimeout(timer))

    const cuerpo = await res.json().catch(() => null)

    if (!res.ok) {
      const err = cuerpo?.error
      return {
        ok: false,
        // El mensaje de Meta es específico y útil (plantilla no aprobada,
        // número fuera de la lista de prueba, token vencido). Se conserva
        // tal cual para que el diagnóstico no exija abrir su panel.
        error: err?.message ?? `HTTP ${res.status}`,
        codigo: err?.code,
      }
    }

    const id = cuerpo?.messages?.[0]?.id
    return id ? { ok: true, id } : { ok: false, error: 'Meta no devolvió id de mensaje' }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: 'Tiempo de espera agotado al contactar WhatsApp' }
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
