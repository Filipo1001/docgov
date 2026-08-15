/**
 * Mapa de notificaciones → plantillas aprobadas de WhatsApp.
 *
 * Antes este archivo componía frases libres. Eso no funciona: fuera de la
 * ventana de 24 h, WhatsApp solo entrega plantillas previamente aprobadas por
 * Meta, y todas nuestras notificaciones las inicia el sistema. Los textos de
 * antes habrían sido rechazados en el momento de salir a producción.
 *
 * Ahora cada tipo se declara como el NOMBRE de una plantilla registrada en
 * WhatsApp Manager más el orden de sus parámetros. El texto real vive en Meta,
 * no aquí: si alguien lo cambia allá sin re-aprobar, Meta rechaza el envío.
 *
 * ── Plantillas registradas ────────────────────────────────────────────────
 *
 *   bienvenida_contratista  (Utilidad · es)
 *     Hola {{1}}, su cuenta en Contratista Digital ya está activa. Ingrese con
 *     su correo y su número de documento como contraseña inicial.
 *     Acceda en: {{2}}
 *
 *   informe_enviado  (Utilidad · es)
 *     Hola {{1}}, su informe de {{2}} del contrato {{3}} fue enviado
 *     correctamente y está en revisión. Le avisaremos cuando sea aprobado.
 *
 * Los tipos que no aparecen aquí (aprobado, rechazado, radicado…) siguen
 * saliendo por correo y quedan sin enviar por WhatsApp — a propósito: se
 * habilitan a medida que sus plantillas se aprueben, no antes.
 */

import { HOST_APP } from '@/lib/dominio'

export interface DatosWhatsApp {
  nombreDestinatario: string
  mes?: string
  anio?: number
  contrato?: string
  motivo?: string
  numeroRadicado?: string
  nombreRemitente?: string
}

export interface PlantillaWhatsApp {
  nombre: string
  idioma: string
  parametros: string[]
}

type Constructor = (d: DatosWhatsApp) => PlantillaWhatsApp

const PLANTILLAS: Record<string, Constructor> = {
  bienvenida: (d) => ({
    nombre: 'bienvenida_contratista',
    idioma: 'es',
    parametros: [d.nombreDestinatario, HOST_APP],
  }),

  // La confirmación al propio contratista de que su informe salió.
  enviado_confirmacion: (d) => ({
    nombre: 'informe_enviado',
    idioma: 'es',
    parametros: [
      d.nombreDestinatario,
      `${d.mes ?? ''} ${d.anio ?? ''}`.trim(),
      d.contrato ?? '',
    ],
  }),
}

/**
 * Devuelve la plantilla para este tipo de notificación, o `null` si el tipo
 * todavía no tiene plantilla aprobada.
 *
 * `null` no es un error: significa «este aviso, por ahora, solo va por correo».
 * Quien llama debe tratarlo como una omisión deliberada y no como un fallo.
 */
export function plantillaPara(tipo: string, datos: DatosWhatsApp): PlantillaWhatsApp | null {
  const constructor = PLANTILLAS[tipo]
  return constructor ? constructor(datos) : null
}

/** Tipos con plantilla disponible — útil para la interfaz de administración. */
export function tiposConWhatsApp(): string[] {
  return Object.keys(PLANTILLAS)
}
