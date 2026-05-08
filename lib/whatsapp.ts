/**
 * WhatsApp message builder for Contratista Digital notifications.
 */

interface WhatsAppData {
  mes: string
  anio: number
  contrato: string
  motivo?: string
  numeroRadicado?: string
  nombreRemitente?: string
}

const templates: Record<string, (d: WhatsAppData) => string> = {
  enviado: (d) =>
    `Contratista Digital: ${d.nombreRemitente || 'Un contratista'} envio su informe de ${d.mes} ${d.anio} (Contrato ${d.contrato}) para revision.`,

  revision: (d) =>
    `Contratista Digital: Tu informe de ${d.mes} ${d.anio} (Contrato ${d.contrato}) fue revisado por el asesor y esta en revision por la secretaria.`,

  aprobado: (d) =>
    `Contratista Digital: Tu informe de ${d.mes} ${d.anio} (Contrato ${d.contrato}) fue aprobado. Ya puedes descargar tus documentos.`,

  rechazado: (d) =>
    `Contratista Digital: Tu informe de ${d.mes} ${d.anio} (Contrato ${d.contrato}) requiere correcciones.${d.motivo ? ` Motivo: ${d.motivo}` : ''} Ingresa a Contratista Digital para mas detalles.`,

  radicado: (d) =>
    `Contratista Digital: Tu informe de ${d.mes} ${d.anio} (Contrato ${d.contrato}) fue radicado${d.numeroRadicado ? ` con el No. ${d.numeroRadicado}` : ''}.`,
}

export function getWhatsAppMessage(tipo: string, data: WhatsAppData): string {
  const template = templates[tipo]
  if (template) return template(data)
  return `Contratista Digital: Tienes una nueva notificacion sobre tu contrato ${data.contrato}. Ingresa a contratistadigital.com para mas detalles.`
}
