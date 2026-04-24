/**
 * Email templates for DocGov notifications.
 * Returns { subject, html } for each notification type.
 */

interface TemplateData {
  nombreDestinatario: string
  mes: string
  anio: number
  contrato: string
  motivo?: string
  numeroRadicado?: string
  nombreRemitente?: string
}

const APP_URL = 'https://docgov-black.vercel.app/'

function baseHtml(titulo: string, contenido: string, color: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:${color};padding:24px 32px;">
      <h1 style="color:#fff;font-size:18px;margin:0;">${titulo}</h1>
    </div>
    <div style="padding:32px;">
      ${contenido}
      <div style="margin-top:28px;text-align:center;">
        <a href="${APP_URL}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:13px 32px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.3px;">
          Abrir DocGov
        </a>
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #eee;text-align:center;">
      <p style="color:#999;font-size:12px;margin:0;">DocGov — Sistema de Gestion Documental</p>
    </div>
  </div>
</body>
</html>`
}

export function emailPeriodoEnviado(data: TemplateData) {
  return {
    subject: `Nuevo informe enviado — ${data.mes} ${data.anio} (Contrato ${data.contrato})`,
    html: baseHtml(
      'Nuevo informe para revision',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         <strong>${data.nombreRemitente}</strong> envio su informe de <strong>${data.mes} ${data.anio}</strong>
         del contrato <strong>${data.contrato}</strong> para tu revision.
       </p>`,
      '#2563eb'
    ),
  }
}

export function emailPeriodoAprobadoAsesor(data: TemplateData) {
  return {
    subject: `Informe pre-aprobado — ${data.mes} ${data.anio}`,
    html: baseHtml(
      'Informe pre-aprobado por asesor',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Tu informe de <strong>${data.mes} ${data.anio}</strong> del contrato <strong>${data.contrato}</strong>
         ha sido pre-aprobado por el asesor juridico. Ahora esta en espera de aprobacion final por la secretaria.
       </p>`,
      '#4f46e5'
    ),
  }
}

export function emailPeriodoAprobado(data: TemplateData) {
  return {
    subject: `Informe aprobado — ${data.mes} ${data.anio}`,
    html: baseHtml(
      'Informe aprobado',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Tu informe de <strong>${data.mes} ${data.anio}</strong> del contrato <strong>${data.contrato}</strong>
         ha sido <strong>aprobado</strong>. Ya puedes descargar tus documentos.
       </p>`,
      '#059669'
    ),
  }
}

export function emailPeriodoRechazado(data: TemplateData) {
  return {
    subject: `Informe requiere correcciones — ${data.mes} ${data.anio}`,
    html: baseHtml(
      'Informe devuelto para correcciones',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Tu informe de <strong>${data.mes} ${data.anio}</strong> del contrato <strong>${data.contrato}</strong>
         ha sido devuelto para correcciones.
       </p>
       ${data.motivo ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;">
         <p style="color:#991b1b;font-size:13px;margin:0;"><strong>Motivo:</strong> ${data.motivo}</p>
       </div>` : ''}
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Por favor revisa las observaciones y vuelve a enviar tu informe.
       </p>`,
      '#dc2626'
    ),
  }
}

export function emailPeriodoRadicado(data: TemplateData) {
  return {
    subject: `Informe radicado${data.numeroRadicado ? ` No. ${data.numeroRadicado}` : ''} — ${data.mes} ${data.anio}`,
    html: baseHtml(
      'Informe radicado exitosamente',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Tu informe de <strong>${data.mes} ${data.anio}</strong> del contrato <strong>${data.contrato}</strong>
         ha sido radicado exitosamente.
       </p>
       ${data.numeroRadicado ? `<div style="background:#ecfdf5;border:2px solid #059669;padding:16px 20px;margin:16px 0;border-radius:12px;text-align:center;">
         <p style="color:#065f46;font-size:12px;margin:0 0 4px;">Numero de radicado</p>
         <p style="color:#059669;font-size:24px;font-weight:700;margin:0;">${data.numeroRadicado}</p>
       </div>` : ''}`,
      '#059669'
    ),
  }
}

export function emailRecordatorioInforme(data: TemplateData) {
  return {
    subject: `Recuerda enviar tu informe — ${data.mes} ${data.anio}`,
    html: baseHtml(
      'Informe pendiente de envío',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Te recordamos que aún no has enviado tu informe de actividades de
         <strong>${data.mes} ${data.anio}</strong> para el contrato <strong>${data.contrato}</strong>.
       </p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Ingresa a DocGov, registra tus actividades y envía tu informe a tiempo.
       </p>`,
      '#d97706'
    ),
  }
}

export type EmailTemplate = (data: TemplateData) => { subject: string; html: string }

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  enviado: emailPeriodoEnviado,
  revision: emailPeriodoAprobadoAsesor,
  aprobado: emailPeriodoAprobado,
  rechazado: emailPeriodoRechazado,
  radicado: emailPeriodoRadicado,
  recordatorio: emailRecordatorioInforme,
}
