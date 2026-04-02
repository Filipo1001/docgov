/**
 * WhatsApp message builder for DocGov notifications.
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
    `DocGov: ${d.nombreRemitente || 'Un contratista'} envio su informe de ${d.mes} ${d.anio} (Contrato ${d.contrato}) para revision.`,

  revision: (d) =>
    `DocGov: Tu informe de ${d.mes} ${d.anio} (Contrato ${d.contrato}) fue revisado por el asesor y esta en revision por la secretaria.`,

  aprobado: (d) =>
    `DocGov: Tu informe de ${d.mes} ${d.anio} (Contrato ${d.contrato}) fue aprobado. Ya puedes descargar tus documentos.`,

  rechazado: (d) =>
    `DocGov: Tu informe de ${d.mes} ${d.anio} (Contrato ${d.contrato}) requiere correcciones.${d.motivo ? ` Motivo: ${d.motivo}` : ''} Revisa DocGov para mas detalles.`,

  radicado: (d) =>
    `DocGov: Tu informe de ${d.mes} ${d.anio} (Contrato ${d.contrato}) fue radicado${d.numeroRadicado ? ` con el No. ${d.numeroRadicado}` : ''}.`,
}

export function getWhatsAppMessage(tipo: string, data: WhatsAppData): string {
  const template = templates[tipo]
  if (template) return template(data)
  return `DocGov: Tienes una nueva notificacion sobre tu contrato ${data.contrato}. Revisa DocGov para mas detalles.`
}
