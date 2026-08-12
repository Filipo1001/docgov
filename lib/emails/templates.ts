/**
 * Email templates for Contratista Digital notifications.
 * Returns { subject, html } for each notification type.
 */

import { ORIGEN_APP } from '@/lib/dominio'
import { MARCA } from '@/lib/marca'

interface TemplateData {
  nombreDestinatario: string
  mes: string
  anio: number
  contrato: string
  motivo?: string
  numeroRadicado?: string
  nombreRemitente?: string
  /** Texto libre para alertas agregadas (lista de cuentas, días restantes, etc.) */
  detalle?: string
  /** Correo de acceso — solo lo usa la bienvenida, para mostrarlo como usuario. */
  email?: string
}

const APP_URL = `${ORIGEN_APP}/`

/**
 * El folleto de marca (icono-96.png, ya usado por el manifest y el favicon)
 * en su color navy natural, sobre una franja clara. En ningún lugar de la
 * app aparece invertido en blanco —LogoCD nunca recibe `color="#fff"`—, así
 * que va sobre fondo claro aquí también, no sobre la barra de color.
 */
const LOGO_URL = `${ORIGEN_APP}/marca/icono-96.png`

/**
 * `conLogo` es aparte del rediseño completo de las plantillas —pendiente—:
 * solo la bienvenida lo pide por ahora. Las otras diez no pasan el parámetro,
 * así que su salida no cambia ni un byte.
 */
function baseHtml(titulo: string, contenido: string, color: string, conLogo = false): string {
  const encabezadoLogo = conLogo ? `
    <div style="background:#fff;padding:22px 32px 14px;text-align:center;border-bottom:1px solid #f0f0f0;">
      <img src="${LOGO_URL}" width="36" height="36" alt="Contratista Digital" style="display:block;margin:0 auto 6px;border-radius:8px;" />
      <p style="color:#192031;font-size:13px;font-weight:700;margin:0;">Contratista Digital</p>
    </div>` : ''

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    ${encabezadoLogo}
    <div style="background:${color};padding:24px 32px;">
      <h1 style="color:#fff;font-size:18px;margin:0;">${titulo}</h1>
    </div>
    <div style="padding:32px;">
      ${contenido}
      <div style="margin-top:28px;text-align:center;">
        <a href="${APP_URL}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:13px 32px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.3px;">
          Abrir Contratista Digital
        </a>
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #eee;text-align:center;">
      <p style="color:#999;font-size:12px;margin:0;">Contratista Digital</p>
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

export function emailEnvioConfirmacion(data: TemplateData) {
  return {
    subject: `Informe enviado exitosamente — ${data.mes} ${data.anio} (Contrato ${data.contrato})`,
    html: baseHtml(
      '¡Tu informe fue enviado!',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola <strong>${data.nombreDestinatario}</strong>,</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Tu informe de actividades de <strong>${data.mes} ${data.anio}</strong>
         del contrato <strong>${data.contrato}</strong> fue enviado exitosamente.
       </p>
       <div style="background:#f0fdf4;border:2px solid #16a34a;padding:16px 20px;margin:20px 0;border-radius:12px;text-align:center;">
         <p style="color:#166534;font-size:13px;margin:0 0 4px;">Estado actual</p>
         <p style="color:#16a34a;font-size:18px;font-weight:700;margin:0;">En revisión</p>
       </div>
       <p style="color:#555;font-size:13px;line-height:1.6;">
         Nuestro equipo revisará tu informe y te notificaremos cuando haya una actualización.
         Si necesitas hacer algún ajuste antes de que sea aprobado, podrás hacerlo desde la plataforma.
       </p>`,
      '#16a34a'
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
         Ingresa a Contratista Digital, registra tus actividades y envía tu informe a tiempo.
       </p>`,
      '#d97706'
    ),
  }
}

export function emailRecordatorioUrgente(data: TemplateData) {
  return {
    subject: `⏰ Quedan pocos días — informe de ${data.mes} ${data.anio}`,
    html: baseHtml(
      'El plazo está por vencer',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         El mes está por terminar y aún no has enviado tu informe de
         <strong>${data.mes} ${data.anio}</strong> del contrato <strong>${data.contrato}</strong>.
       </p>
       <div style="background:#fff7ed;border-left:4px solid #ea580c;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;">
         <p style="color:#9a3412;font-size:13px;margin:0;">
           Si no lo envías antes de fin de mes, el periodo se cerrará y necesitarás
           que tu supervisor habilite el envío tardío.
         </p>
       </div>`,
      '#ea580c'
    ),
  }
}

export function emailRecordatorioVencido(data: TemplateData) {
  return {
    subject: `Informe vencido — ${data.mes} ${data.anio}`,
    html: baseHtml(
      'El plazo de tu informe venció',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         El plazo para enviar tu informe de <strong>${data.mes} ${data.anio}</strong>
         del contrato <strong>${data.contrato}</strong> ya venció y el periodo quedó cerrado.
       </p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Contacta a tu supervisor para que habilite el <strong>envío tardío</strong> y
         puedas completar tu informe.
       </p>`,
      '#dc2626'
    ),
  }
}

export function emailRadicacionPendiente(data: TemplateData) {
  return {
    subject: `Cuentas aprobadas esperando radicación`,
    html: baseHtml(
      'Cuentas pendientes de radicar',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         ${data.detalle ?? 'Hay cuentas aprobadas que llevan varios días esperando radicación.'}
       </p>
       <p style="color:#555;font-size:13px;line-height:1.6;">
         Puedes radicarlas todas de una vez con <strong>Radicación rápida</strong> en la
         pestaña Aprobados de Informes.
       </p>`,
      '#4f46e5'
    ),
  }
}

export function emailBienvenida(data: TemplateData) {
  return {
    subject: 'Bienvenido a Contratista Digital',
    html: baseHtml(
      // El nombre completo ya lo dice el logo de arriba — repetirlo en la
      // barra sería el mismo texto dos veces en la altura de una pantalla.
      '¡Bienvenido!',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Ya tienes una cuenta en Contratista Digital, la plataforma donde se gestionan
         los informes, documentos y pagos de tu contrato con el municipio.
       </p>
       <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:16px 20px;margin:20px 0;border-radius:12px;">
         <p style="color:#64748b;font-size:12px;margin:0 0 4px;">Tu usuario</p>
         <p style="color:#0f172a;font-size:15px;font-weight:700;margin:0 0 14px;">${data.email ?? ''}</p>
         <p style="color:#64748b;font-size:12px;margin:0 0 4px;">Contraseña inicial</p>
         <p style="color:#0f172a;font-size:14px;margin:0;">Tu número de documento, sin puntos ni espacios.</p>
       </div>
       <p style="color:#555;font-size:13px;line-height:1.6;">
         Por seguridad, puedes cambiarla cuando quieras desde Configuración,
         una vez inicies sesión.
       </p>`,
      MARCA,
      true,
    ),
  }
}

export function emailContratoVencimiento(data: TemplateData) {
  return {
    subject: `Contrato ${data.contrato} próximo a vencer`,
    html: baseHtml(
      'Contrato próximo a vencer',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         ${data.detalle ?? `El contrato ${data.contrato} está próximo a su fecha de finalización.`}
       </p>
       <p style="color:#555;font-size:13px;line-height:1.6;">
         Si el contrato continuará, es momento de tramitar la prórroga u otrosí
         correspondiente para no interrumpir la ejecución.
       </p>`,
      '#b45309'
    ),
  }
}

export type EmailTemplate = (data: TemplateData) => { subject: string; html: string }

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  enviado: emailPeriodoEnviado,
  enviado_confirmacion: emailEnvioConfirmacion,
  revision: emailPeriodoAprobadoAsesor,
  aprobado: emailPeriodoAprobado,
  rechazado: emailPeriodoRechazado,
  radicado: emailPeriodoRadicado,
  recordatorio: emailRecordatorioInforme,
  recordatorio_urgente: emailRecordatorioUrgente,
  recordatorio_vencido: emailRecordatorioVencido,
  radicacion_pendiente: emailRadicacionPendiente,
  contrato_vencimiento: emailContratoVencimiento,
  bienvenida: emailBienvenida,
}
