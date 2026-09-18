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
  /**
   * Datos estructurados. Solo lo usan los consolidados, que necesitan pintar
   * una tabla y unas barras: el resto de plantillas se apañan con cadenas.
   * Llega como `unknown` desde el despachador y cada plantilla lo estrecha.
   */
  datos?: unknown
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
 * Exportada: app/actions/correos.ts (el correo masivo del asesor) la usa
 * también, en vez de mantener su propia copia casi idéntica de este layout
 * —que ya había empezado a divergir en el color de la barra (#1a1a1a en vez
 * de MARCA). Un solo lugar que arma el sobre del correo, para toda la app.
 */
export function baseHtml(titulo: string, contenido: string, color: string): string {
  const encabezadoLogo = `
    <div style="background:#fff;padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f0f0f0;">
      <img src="${LOGO_URL}" width="72" height="72" alt="Contratista Digital" style="display:block;margin:0 auto;border-radius:16px;" />
    </div>`

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

/**
 * `detalle` en este correo son las OBSERVACIONES de la supervisión: notas
 * sobre obligaciones que SÍ se aprobaron —un llamado de atención que no llegó
 * a ser motivo de devolución, o una constancia— y que no tenían ningún otro
 * camino hasta la contratista: guardarlas no notifica a nadie y, al aprobarse
 * el informe, tampoco hay correo de devolución que las lleve.
 *
 * Van después del «aprobado» a propósito: la aprobación es la noticia, la
 * observación es el matiz. Ver `notasPorObligacion` en app/actions/periodos.ts.
 */
export function emailPeriodoAprobado(data: TemplateData) {
  return {
    subject: `Informe aprobado — ${data.mes} ${data.anio}`,
    html: baseHtml(
      'Informe aprobado',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Tu informe de <strong>${data.mes} ${data.anio}</strong> del contrato <strong>${data.contrato}</strong>
         ha sido <strong>aprobado</strong>. Ya puedes descargar tus documentos.
       </p>
       ${data.detalle ?? ''}
       ${data.detalle ? `<p style="color:#6b7280;font-size:13px;line-height:1.6;">
         No tienes que hacer nada con estas observaciones para este informe: quedan
         registradas en el Acta de Supervisión. Tenlas en cuenta para los próximos.
       </p>` : ''}`,
      '#059669'
    ),
  }
}

/**
 * `detalle` en este correo son los HALLAZGOS: notas sobre obligaciones que NO
 * se aprobaron, es decir lo que hay que corregir, cada una junto a su
 * obligación. Ver `notasPorObligacion` en app/actions/periodos.ts.
 */
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
       ${/* Los hallazgos por obligación, cada uno junto a la obligación a la
            que pertenece. Antes este correo solo llevaba el motivo general y
            la contratista tenía que adivinar a cuál de sus obligaciones se
            refería: las notas que el revisor escribía sobre cada una no
            salían nunca de la pantalla. Lo arma
            `hallazgosPorObligacion` en app/actions/periodos.ts. */ ''}
       ${data.detalle ?? ''}
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
       </div>`,
      MARCA,
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

/**
 * Habilitación de envío tardío.
 *
 * Antes esto viajaba con la plantilla `enviado`, que está escrita para avisar
 * al SUPERVISOR de que un contratista le mandó algo: «{remitente} envió su
 * informe de {mes} para tu revisión». El destinatario aquí es el contratista y
 * el hecho es el contrario —se le abre un plazo, no se le entrega nada—, así
 * que recibía un correo que decía justo lo que no era. El aviso dentro de la
 * aplicación siempre estuvo bien redactado; el que salía por correo, no.
 *
 * Ámbar y no verde: no es un logro ni una aprobación, es un permiso con una
 * fecha detrás. El mismo tono que usan los recordatorios.
 */
export function emailEnvioTardioHabilitado(data: TemplateData) {
  return {
    subject: `Habilitado el envío de ${data.mes} ${data.anio} — Contrato ${data.contrato}`,
    html: baseHtml(
      'Envio tardio habilitado',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Se habilito el envio de tu informe de <strong>${data.mes} ${data.anio}</strong>
         del contrato <strong>${data.contrato}</strong>, cuyo plazo ya habia vencido.
       </p>
       <div style="background:#fffbeb;border-left:4px solid #d97706;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;">
         <p style="color:#92400e;font-size:13px;margin:0;">
           Ya puedes completarlo y enviarlo: registra tus actividades, adjunta las
           evidencias y la planilla de seguridad social, y envialo a revision.
         </p>
       </div>
       ${data.nombreRemitente ? `<p style="color:#666;font-size:13px;line-height:1.6;">
         Habilitado por ${data.nombreRemitente}.
       </p>` : ''}`,
      '#d97706'
    ),
  }
}

/** La contraparte: el plazo se vuelve a cerrar. */
export function emailEnvioTardioCancelado(data: TemplateData) {
  return {
    subject: `Se cerro el envio de ${data.mes} ${data.anio} — Contrato ${data.contrato}`,
    html: baseHtml(
      'Habilitacion cancelada',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         La habilitacion para enviar el informe de <strong>${data.mes} ${data.anio}</strong>
         del contrato <strong>${data.contrato}</strong> fue cancelada. El periodo vuelve a
         estar fuera de plazo.
       </p>
       <p style="color:#666;font-size:13px;line-height:1.6;">
         Si necesitas enviarlo, comunicate con tu supervisor.
       </p>`,
      '#6b7280'
    ),
  }
}

export type EmailTemplate = (data: TemplateData) => { subject: string; html: string }

/**
 * Planilla de seguridad social devuelta.
 *
 * Existe aparte de emailPeriodoRechazado a propósito: antes este aviso
 * reutilizaba aquella plantilla y le decía al contratista que su INFORME
 * había sido devuelto para correcciones, cuando lo devuelto era solo un
 * soporte. La diferencia importa: aquí no hay que rehacer actividades ni
 * evidencias, basta con subir una planilla nueva.
 */
export function emailPlanillaRechazada(data: TemplateData) {
  return {
    subject: `Planilla de seguridad social devuelta — ${data.mes} ${data.anio}`,
    html: baseHtml(
      'Planilla de seguridad social devuelta',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         La planilla de seguridad social que adjuntaste al informe de
         <strong>${data.mes} ${data.anio}</strong> del contrato <strong>${data.contrato}</strong>
         fue devuelta para corrección.
       </p>
       ${data.motivo ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;">
         <p style="color:#991b1b;font-size:13px;margin:0;"><strong>Motivo:</strong> ${data.motivo}</p>
       </div>` : ''}
       <p style="color:#333;font-size:14px;line-height:1.6;">
         Tu informe sigue su curso: solo tienes que entrar al periodo y subir una
         planilla nueva. No hace falta rehacer actividades ni evidencias.
       </p>`,
      '#dc2626'
    ),
  }
}

/**
 * Resumen diario para quien revisa.
 *
 * Sustituye al correo por informe. Antes, cada envío avisaba al supervisor y a
 * todos los asesores de la dependencia: ~380 correos al mes con el 82%
 * concentrado en ocho días. Sesenta correos en una semana no se leen, se
 * archivan, y arrastran con ellos los avisos que sí piden una acción.
 *
 * Este llega como mucho una vez al día, y solo cuando hay algo que hacer.
 */
export function emailRevisionPendiente(data: TemplateData) {
  // El correo cubre las dos cosas que pueden quedarse quietas en sus manos, y
  // el asunto tiene que decir cuál de ellas es: `titulo` lo trae ya resuelto
  // desde la regla, que es la única que sabe si hay una, la otra o ambas.
  // «Informes esperando tu revisión» encima de un correo que solo habla de
  // cuentas sin radicar es una promesa que el cuerpo no cumple.
  const asunto = data.motivo?.trim() || 'Informes esperando tu revisión'
  return {
    subject: asunto,
    html: baseHtml(
      'El estado de tu bandeja',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         ${data.detalle ?? 'Tienes informes esperando revisión.'}
       </p>
       <p style="color:#555;font-size:13px;line-height:1.6;">
         Los informes por revisar están en <strong>Informes</strong>, pestaña
         Enviados. Las cuentas aprobadas se radican desde la pestaña Aprobados,
         y ahí puedes hacerlo en bloque con Radicación rápida.
       </p>`,
      '#4f46e5'
    ),
  }
}

/**
 * Recordatorio de informe devuelto que sigue sin corregirse.
 *
 * Existe porque era el único punto del circuito donde algo podía quedarse
 * quieto para siempre: el cron de recordatorios filtra por estado `borrador`,
 * y un informe devuelto está en `rechazado`, así que no entraba en ninguna
 * regla. En producción había uno devuelto desde abril — cinco meses sin que
 * sonara una sola alarma, y sin que el panel se lo dijera tampoco.
 */
export function emailDevueltoSinCorregir(data: TemplateData) {
  return {
    subject: `Tu informe de ${data.mes} sigue esperando corrección`,
    html: baseHtml(
      'Pendiente de corregir',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         ${data.motivo ?? `Tu informe de ${data.mes} ${data.anio} fue devuelto y todavía no se ha corregido.`}
       </p>
       ${data.detalle ?? ''}
       <p style="color:#555;font-size:13px;line-height:1.6;">
         Corrige lo señalado y vuelve a enviarlo desde Contratista Digital. Mientras
         siga devuelto, tu cuenta de ese mes no puede tramitarse.
       </p>`,
      '#dc2626'
    ),
  }
}

/**
 * El mismo caso, pero para quien supervisa: a partir de dos semanas deja de
 * ser un despiste de la contratista y pasa a ser un contrato atascado.
 */
export function emailDevueltoEstancado(data: TemplateData) {
  return {
    subject: 'Informes devueltos que llevan semanas sin corregir',
    html: baseHtml(
      'Devoluciones sin movimiento',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         ${data.detalle ?? 'Hay informes devueltos que llevan más de dos semanas sin corregirse.'}
       </p>
       <p style="color:#555;font-size:13px;line-height:1.6;">
         Un informe devuelto no avanza solo. Si la persona no puede corregirlo —por
         ejemplo, porque el periodo ya venció— tendrás que habilitarle el envío tardío.
       </p>`,
      '#dc2626'
    ),
  }
}

/**
 * Documentación que falta antes de que salga un acta.
 *
 * Es la única alerta del sistema que PREVIENE en vez de perseguir. Un acta de
 * supervisión imprime una fila por cada periodo del contrato con su número de
 * planilla, y donde no hay número imprime «—». Cuando se detecta ya es tarde:
 * por la regla 3 del proyecto, un documento emitido no se reescribe. Había 4
 * contratos con actas ya emitidas arrastrando un hueco dentro.
 */
export function emailExpedienteIncompleto(data: TemplateData) {
  return {
    subject: 'Documentación pendiente antes de emitir actas',
    html: baseHtml(
      'Expediente incompleto',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         ${data.detalle ?? 'Hay contratos con documentación pendiente.'}
       </p>
       <p style="color:#555;font-size:13px;line-height:1.6;">
         Conviene resolverlo antes de que se emitan las actas del mes: un documento
         ya emitido no se reescribe, así que lo que falte hoy queda impreso.
       </p>`,
      '#f59e0b'
    ),
  }
}

/**
 * Contratistas que nunca han enviado su primer informe, para el supervisor.
 *
 * Sustituye al «tu informe venció» que esas personas habrían recibido. Al
 * medirlo, de los 95 avisos que iba a mandar el día 2 había 39 dirigidos a
 * gente que no había enviado un solo informe en su vida, 36 de ella contratada
 * en agosto o septiembre —la tanda que entró sin capacitación—. Habría sido su
 * primer contacto con el sistema: un correo rojo diciéndoles que fallaron en
 * algo que nadie les enseñó y que, además, ya no pueden hacer.
 *
 * Va al supervisor porque es quien tiene la llave: el periodo vencido está
 * bloqueado y solo él levanta el envío tardío.
 */
export function emailPrimerInformePendiente(data: TemplateData) {
  return {
    subject: `Contratistas sin su primer informe — ${data.mes}`,
    html: baseHtml(
      'Primer informe sin enviar',
      `<p style="color:#333;font-size:14px;line-height:1.6;">Hola ${data.nombreDestinatario},</p>
       <p style="color:#333;font-size:14px;line-height:1.6;">
         ${data.detalle ?? 'Hay contratistas que aún no han enviado su primer informe.'}
       </p>
       <p style="color:#555;font-size:13px;line-height:1.6;">
         No les hemos escrito a ellos: el periodo ya está cerrado y no podrían enviarlo
         aunque quisieran. Para que puedan hacerlo tienes que <strong>habilitarles el envío
         tardío</strong> desde la página de su informe. Si es gente que entró hace poco,
         conviene acompañar la habilitación de una explicación de cómo se usa.
       </p>`,
      '#0ea5e9'
    ),
  }
}


// ════════════════════════════════════════════════════════════════════════
//  Consolidados mensuales
// ════════════════════════════════════════════════════════════════════════

/**
 * Los nombres salen de la base de datos y van dentro de HTML. Ninguno lleva
 * hoy un carácter conflictivo, pero un apellido con «&» basta para romper la
 * maqueta, y quien escribe ese nombre es el municipio, no nosotros.
 */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Pesos colombianos sin decimales: en las cuentas de cobro no existen. */
function cop(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO')
}

interface FilaBarra {
  nombre: string
  valor: number
  /** Cifra a la derecha, ya formateada. */
  etiqueta: string
  /** Resaltar la fila propia del destinatario. */
  propia?: boolean
}

/**
 * La distribución, en barras de tabla.
 *
 * ── Por qué no es una torta ──────────────────────────────────────────────
 *
 * Gmail y Outlook eliminan `<svg>` de los correos, así que una torta real solo
 * puede entrar como PNG servido desde una URL pública sin autenticación —y
 * serviría cifras de dinero del municipio desde un endpoint abierto, que
 * además Google cachea en su proxy—. Las barras se arman con tablas anidadas,
 * que es lo único que renderiza igual en todos los clientes desde hace veinte
 * años, y llevan la cifra escrita al lado: se leen aunque el cliente ignore
 * los colores de fondo, cosa que una torta no hace.
 *
 * El ancho va como atributo `width` Y como estilo: Outlook ignora el estilo.
 */
function barras(filas: FilaBarra[]): string {
  const total = filas.reduce((s, f) => s + f.valor, 0)
  if (total <= 0) return ''
  return filas.map(f => {
    const pct = Math.round((100 * f.valor) / total)
    // Una franja de 0% no se ve y parece un error de maqueta; 2% se lee como
    // «casi nada», que es la verdad.
    const ancho = Math.max(2, pct)
    const tinta = f.propia ? '#192031' : '#94a3b8'
    const peso = f.propia ? '700' : '400'
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:0 0 10px;">
        <tr>
          <td style="font-size:13px;color:#334155;font-weight:${peso};padding:0 0 4px;">${esc(f.nombre)}</td>
          <td align="right" style="font-size:13px;color:#64748b;font-weight:${peso};padding:0 0 4px;white-space:nowrap;">${esc(f.etiqueta)} &middot; ${pct}%</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#eef2f7;border-radius:5px;">
              <tr>
                <td width="${ancho}%" style="width:${ancho}%;background:${tinta};height:9px;line-height:9px;font-size:1px;border-radius:5px;">&nbsp;</td>
                <td style="font-size:1px;line-height:9px;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`
  }).join('')
}

/** Rótulo de sección: la misma jerarquía en los dos consolidados. */
function seccion(titulo: string, cuerpo: string): string {
  return `
    <p style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;margin:26px 0 10px;">${esc(titulo)}</p>
    ${cuerpo}`
}

/** Una cifra grande con su explicación debajo. */
function cifra(valor: string, pie: string): string {
  return `
    <td style="padding:0 8px 0 0;vertical-align:top;">
      <p style="color:#192031;font-size:22px;font-weight:700;margin:0;line-height:1.2;">${esc(valor)}</p>
      <p style="color:#64748b;font-size:12px;margin:3px 0 0;line-height:1.4;">${esc(pie)}</p>
    </td>`
}

function lista(items: string[], vacio: string): string {
  if (!items.length) {
    return `<p style="color:#64748b;font-size:13px;margin:0;">${esc(vacio)}</p>`
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
    ${items.map((t, i) => `<tr><td style="font-size:13px;color:#334155;padding:7px 0;${i ? 'border-top:1px solid #f1f5f9;' : ''}line-height:1.5;">${t}</td></tr>`).join('')}
  </table>`
}

/** Lo que el correo de una dependencia necesita saber. Ver lib/reportes/consolidado.ts */
export interface DatosConsolidadoDependencia {
  mes: string
  anio: number
  mesPrevio: string
  dependencia: string
  fila: { contratos: number; cerrados: number; pct: number; contratistas: number; valor: number; enviados: number }
  previo: { cerrados: number; contratos: number; pct: number } | null
  notaPrevio: string | null
  cambioPoblacion: boolean
  tramiteDias: number | null
  sinPlanilla: { contrato: string; nombre: string; meses: string[] }[]
  reparos: { contrato: string; nombre: string; motivo: string }[]
  /**
   * El reparto del municipio, solo para quien tiene competencia sobre el
   * presupuesto entero. Llega `null` para el resto: a Desarrollo Territorial
   * no le incumbe cuánto está ejecutando Gobierno. Ver la migración 047.
   */
  municipio: {
    valor: number
    informes: number
    filas: { dependenciaId: string; nombre: string; valor: number; cerrados: number; contratos: number }[]
  } | null
  dependenciaId: string
  /** URL absoluta del PNG de la torta; `null` si no se pudo firmar. */
  urlTorta: string | null
}

/**
 * Consolidado mensual de UNA dependencia.
 *
 * Sustituye a la alerta de cuentas sin radicar que salía global: el 17 de
 * septiembre la misma lista de tres nombres —dos de Gobierno, uno de
 * Hacienda— llegó a los cuatro secretarios, y para dos de ellos no había
 * nada suyo dentro.
 *
 * La regla de este correo: los NOMBRES son solo de su dependencia; las CIFRAS
 * agregadas del municipio sí se comparten, porque son ejecución presupuestal
 * pública y sitúan lo propio en contexto.
 *
 * Y nunca dice «pagado». El sistema llega hasta `radicado` —la cuenta salió
 * hacia Hacienda—; si tesorería giró, no lo sabe.
 */
export function emailConsolidadoDependencia(data: TemplateData) {
  const d = data.datos as DatosConsolidadoDependencia | undefined
  if (!d) {
    return {
      subject: `Consolidado de ${data.mes} ${data.anio}`,
      html: baseHtml('Consolidado mensual', `<p style="color:#333;font-size:14px;">${esc(data.detalle ?? '')}</p>`, '#192031'),
    }
  }

  const tendencia = d.previo
    ? `En ${esc(d.mesPrevio)} fueron <strong>${d.previo.cerrados} de ${d.previo.contratos}</strong>.` +
      (d.cambioPoblacion
        ? ` <span style="color:#92400e;">El número de contratos cambió bastante entre los dos meses, así que no son equipos comparables.</span>`
        : '')
    : `<span style="color:#64748b;">${esc(d.notaPrevio ?? '')}</span>`

  // La torta: contratos activos contra informes enviados. Va como <img> y no
  // como <svg> porque Gmail y Outlook eliminan el SVG del cuerpo del correo.
  // Se pide a la mitad del tamaño al que se dibuja, que es como se ve nítida
  // en una pantalla de densidad doble.
  const torta = d.urlTorta
    ? `<img src="${esc(d.urlTorta)}" width="420" height="190" alt="De ${d.fila.contratos} contratos activos, ${d.fila.enviados} enviaron su informe." style="display:block;width:100%;max-width:420px;height:auto;border:0;margin:0 auto;" />`
    : `<p style="color:#64748b;font-size:13px;margin:0;">${d.fila.enviados} de ${d.fila.contratos} contratos activos enviaron su informe.</p>`

  const planillas = d.sinPlanilla.length
    ? seccion('Actas que saldrán sin número de planilla', `
        <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 10px;">
          Estos meses ya cerraron sin planilla de seguridad social, y el acta de
          supervisión los imprime como «—». Para que puedan subirla hay que
          habilitarles el envío tardío en ese periodo.
        </p>
        ${lista(d.sinPlanilla.map(s =>
          `<strong>${esc(s.nombre)}</strong> &middot; contrato ${esc(s.contrato)} <span style="color:#64748b;">— ${esc(s.meses.join(', '))}</span>`), '')}`)
    : ''

  const reparos = d.reparos.length
    ? seccion('Datos que impiden cuadrar la cifra', lista(d.reparos.map(r =>
        `<strong>${esc(r.nombre)}</strong> &middot; contrato ${esc(r.contrato)} <span style="color:#64748b;">— ${esc(r.motivo)}</span>`), ''))
    : ''

  const reparto = d.municipio
    ? seccion(
        `Reparto en el municipio · ${cop(d.municipio.valor)} en ${d.municipio.informes} informes`,
        barras(d.municipio.filas.map(f => ({
          nombre: f.nombre,
          valor: f.valor,
          etiqueta: cop(f.valor),
          propia: f.dependenciaId === d.dependenciaId,
        }))) +
        `<p style="color:#94a3b8;font-size:11px;line-height:1.6;margin:2px 0 0;">
           Cifras agregadas, sin nombres. Te llega porque Hacienda tramita las
           cuentas de todas las secretarías.
         </p>`,
      )
    : ''


  return {
    subject: `${esc(d.dependencia)} — consolidado de ${esc(d.mes)} ${d.anio}`,
    html: baseHtml(
      `Consolidado de ${esc(d.mes)} ${d.anio}`,
      `<p style="color:#333;font-size:14px;line-height:1.6;margin:0 0 4px;">Hola ${esc(data.nombreDestinatario)},</p>
       <p style="color:#334155;font-size:14px;line-height:1.6;margin:0;">
         Así cerró <strong>${esc(d.mes)}</strong> en ${esc(d.dependencia)}.
       </p>

       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:22px 0 0;">
         <tr>
           ${cifra(`${d.fila.cerrados} de ${d.fila.contratos}`, 'contratos cerraron el ciclo')}
           ${cifra(String(d.fila.contratistas), d.fila.contratistas === 1 ? 'contratista presentó' : 'contratistas presentaron')}
           ${cifra(cop(d.fila.valor), 'radicado hacia Hacienda')}
         </tr>
       </table>

       <p style="color:#475569;font-size:13px;line-height:1.6;margin:16px 0 0;">${tendencia}</p>
       ${d.tramiteDias !== null ? `<p style="color:#475569;font-size:13px;line-height:1.6;margin:6px 0 0;">
         Entre el envío del contratista y la radicación pasaron <strong>${d.tramiteDias} días</strong> de media.
       </p>` : ''}

       ${seccion('Contratos activos y envío de informes', torta)}
       ${planillas}
       ${reparos}
       ${reparto}`,
      '#192031',
    ),
  }
}

/** Lo que ve quien responde por el municipio entero. */
export interface DatosConsolidadoMunicipio {
  mes: string
  anio: number
  informes: number
  contratistas: number
  valor: number
  filas: { nombre: string; valor: number; cerrados: number; contratos: number; pct: number; contratistas: number }[]
  /** Dependencias cuyo cumplimiento quedó por debajo del umbral. */
  rezagadas: { nombre: string; cerrados: number; contratos: number }[]
}

/**
 * Consolidado del municipio: alcalde, admin y contratación.
 *
 * Es el único correo que compara dependencias entre sí, y por eso no lleva un
 * solo nombre propio: quien necesite saber QUIÉN no presentó lo tiene en el
 * consolidado de su secretaría. Aquí se responde «cómo va el municipio», no
 * «a quién hay que llamar».
 */
export function emailConsolidadoMunicipio(data: TemplateData) {
  const d = data.datos as DatosConsolidadoMunicipio | undefined
  if (!d) {
    return {
      subject: `Consolidado del municipio — ${data.mes} ${data.anio}`,
      html: baseHtml('Consolidado del municipio', `<p style="color:#333;font-size:14px;">${esc(data.detalle ?? '')}</p>`, '#192031'),
    }
  }

  const porValor = barras(d.filas.map(f => ({ nombre: f.nombre, valor: f.valor, etiqueta: cop(f.valor) })))
  const porGente = barras(d.filas.map(f => ({
    nombre: f.nombre, valor: f.contratistas,
    etiqueta: `${f.contratistas} ${f.contratistas === 1 ? 'contratista' : 'contratistas'}`,
  })))

  const cumplimiento = lista(
    d.filas.map(f => {
      const color = f.pct >= 90 ? '#15803d' : f.pct >= 70 ? '#b45309' : '#b91c1c'
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="font-size:13px;color:#334155;">${esc(f.nombre)}</td>
          <td align="right" style="font-size:13px;color:${color};font-weight:700;white-space:nowrap;">${f.cerrados} de ${f.contratos}</td>
        </tr>
      </table>`
    }),
    '',
  )

  const alerta = d.rezagadas.length
    ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;margin:22px 0 0;border-radius:0 8px 8px 0;">
         <p style="color:#92400e;font-size:13px;margin:0;line-height:1.6;">
           ${d.rezagadas.map(r => `<strong>${esc(r.nombre)}</strong> cerró ${r.cerrados} de ${r.contratos}`).join('. ')}.
         </p>
       </div>`
    : ''

  return {
    subject: `Municipio de Fredonia — consolidado de ${esc(d.mes)} ${d.anio}`,
    html: baseHtml(
      `Consolidado de ${esc(d.mes)} ${d.anio}`,
      `<p style="color:#333;font-size:14px;line-height:1.6;margin:0 0 4px;">Hola ${esc(data.nombreDestinatario)},</p>
       <p style="color:#334155;font-size:14px;line-height:1.6;margin:0;">
         Resumen de <strong>${esc(d.mes)}</strong> en las secretarías del municipio.
       </p>

       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:22px 0 0;">
         <tr>
           ${cifra(String(d.informes), d.informes === 1 ? 'informe cerró el ciclo' : 'informes cerraron el ciclo')}
           ${cifra(String(d.contratistas), 'contratistas')}
           ${cifra(cop(d.valor), 'radicado hacia Hacienda')}
         </tr>
       </table>
       ${alerta}

       ${seccion('Reparto del valor radicado', porValor)}
       ${seccion('Reparto de los contratistas', porGente)}
       ${seccion('Cumplimiento del ciclo', cumplimiento)}

       <p style="color:#94a3b8;font-size:11px;line-height:1.6;margin:20px 0 0;">
         «Radicado» significa que la cuenta salió hacia Hacienda. Contratista
         Digital no registra el giro de tesorería, así que esta cifra no es lo
         pagado. Cada secretaría recibe hoy el detalle de sus propios contratos.
       </p>`,
      '#192031',
    ),
  }
}

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  enviado: emailPeriodoEnviado,
  enviado_confirmacion: emailEnvioConfirmacion,
  revision: emailPeriodoAprobadoAsesor,
  aprobado: emailPeriodoAprobado,
  rechazado: emailPeriodoRechazado,
  planilla_rechazada: emailPlanillaRechazada,
  reporte_mensual: emailConsolidadoDependencia,
  consolidado_municipio: emailConsolidadoMunicipio,
  radicado: emailPeriodoRadicado,
  recordatorio: emailRecordatorioInforme,
  recordatorio_urgente: emailRecordatorioUrgente,
  recordatorio_vencido: emailRecordatorioVencido,
  revision_pendiente: emailRevisionPendiente,
  devuelto_sin_corregir: emailDevueltoSinCorregir,
  devuelto_estancado: emailDevueltoEstancado,
  expediente_incompleto: emailExpedienteIncompleto,
  primer_informe_pendiente: emailPrimerInformePendiente,
  contrato_vencimiento: emailContratoVencimiento,
  bienvenida: emailBienvenida,
  envio_tardio_habilitado: emailEnvioTardioHabilitado,
  envio_tardio_cancelado: emailEnvioTardioCancelado,
}
