'use server'

/**
 * Central notification dispatcher.
 * Handles in-app (DB), email (Resend), and WhatsApp (Twilio) channels.
 */

import { createAdminSupabaseClient } from './supabase-admin'
import { enviarCorreo } from './resend'
import { EMAIL_TEMPLATES } from './emails/templates'
import { plantillaPara } from './whatsapp'
import { enviarPlantillaWhatsApp, whatsappDisponible } from './whatsapp-cloud'
import { normalizarTelefono } from './telefono'
import { capitalizarNombre } from './format'

export interface NotificationPayload {
  destinatarioId: string
  tipo: string
  titulo: string
  mensaje: string
  /** Opcional: las alertas de contrato (vencimiento) o agregadas no tienen periodo */
  periodoId?: string
  // Context for external channels
  mes?: string
  anio?: number
  contrato?: string
  motivo?: string
  numeroRadicado?: string
  nombreRemitente?: string
  /** Texto libre para plantillas de alertas agregadas */
  detalle?: string
}

/**
 * Send a notification through all enabled channels.
 * Never throws — logs errors silently to avoid breaking the main flow.
 */
export async function enviarNotificacion(payload: NotificationPayload): Promise<void> {
  const adminClient = createAdminSupabaseClient()

  // 1. Always save to database (in-app notification)
  // Se recupera el id para poder anotar después cómo le fue al correo: sin ese
  // registro, un correo rechazado es indistinguible de uno entregado, que es
  // justo lo que dejó pasar semanas el fallo de la radicación rápida.
  const { data: notif } = await adminClient
    .from('notificaciones')
    .insert({
      usuario_id: payload.destinatarioId,
      tipo: payload.tipo,
      titulo: payload.titulo,
      mensaje: payload.mensaje,
      periodo_id: payload.periodoId ?? null,
      leida: false,
    })
    .select('id')
    .single()

  const anotarCorreo = async (
    estado: 'enviado' | 'omitido' | 'fallido',
    extra: { id?: string; error?: string } = {},
  ) => {
    if (!notif?.id) return
    await adminClient
      .from('notificaciones')
      .update({
        email_estado: estado,
        email_id: extra.id ?? null,
        email_error: extra.error?.slice(0, 500) ?? null,
        email_at: new Date().toISOString(),
      })
      .eq('id', notif.id)
      .then(undefined, () => {})
  }

  // 2. Get user contact info and preferences
  const { data: usuario } = await adminClient
    .from('usuarios')
    .select('email, telefono, nombre_completo')
    .eq('id', payload.destinatarioId)
    .single()

  if (!usuario) return

  // Check notification preferences
  const { data: prefs } = await adminClient
    .from('preferencias_notificacion')
    .select('canal, habilitado')
    .eq('usuario_id', payload.destinatarioId)

  const prefMap = new Map(prefs?.map(p => [p.canal, p.habilitado]) ?? [])
  const emailEnabled = prefMap.get('email') !== false // default: true

  // WhatsApp pasa a comportarse como el correo: activo salvo que la persona lo
  // desactive. Antes exigía un «sí» explícito y la tabla de preferencias está
  // vacía —cero filas en producción—, así que el canal no habría enviado nada
  // nunca. Además había un problema de origen: la bienvenida es el primer
  // contacto, cuando la persona todavía no tiene cuenta donde marcar una
  // preferencia; pedir opt-in previo hacía imposible justo el mensaje que más
  // se necesita.
  //
  // Es defendible porque solo se usan plantillas de UTILIDAD sobre un trámite
  // que la persona ya inició con el municipio, y porque el teléfono lo entregó
  // ella misma al firmar el contrato. No se envía nada promocional.
  //
  // Lo que contiene el alcance real no es esta bandera sino `whatsappDisponible()`:
  // sin las variables de entorno de Meta no sale ni un mensaje. Mientras esas
  // variables existan solo en Preview, producción permanece en silencio.
  const whatsappEnabled = prefMap.get('whatsapp') !== false

  const templateData = {
    // Los nombres se guardan en mayúsculas (normalizeName); un correo no es
    // un documento oficial, y "Hola JUAN" lee como si el sistema gritara.
    nombreDestinatario: capitalizarNombre(usuario.nombre_completo?.split(' ')[0]) || 'Usuario',
    mes: payload.mes || '',
    anio: payload.anio || 0,
    contrato: payload.contrato || '',
    motivo: payload.motivo,
    numeroRadicado: payload.numeroRadicado,
    nombreRemitente: payload.nombreRemitente,
    detalle: payload.detalle,
    email: usuario.email,
  }

  // 3. Send email (if enabled and configured)
  //
  // Los registros ya no incluyen el correo del destinatario. Cada notificación
  // dejaba la dirección escrita en los registros de Vercel, que se conservan y
  // consulta cualquiera con acceso al panel: es un dato personal de
  // contratistas del municipio y no hace falta para diagnosticar nada. El id
  // de usuario permite rastrear el mismo caso sin exponerlo.
  const emailReal = usuario.email && !usuario.email.endsWith('@pendiente.local') ? usuario.email : null
  if (!emailEnabled || !emailReal) {
    const motivo = !emailEnabled ? 'canal_desactivado' : 'sin_correo_real'
    console.log(`[Notif] correo omitido tipo=${payload.tipo} usuario=${payload.destinatarioId} motivo=${motivo}`)
    await anotarCorreo('omitido', { error: motivo })
  } else {
    const template = (EMAIL_TEMPLATES as Record<string, typeof EMAIL_TEMPLATES[string] | undefined>)[payload.tipo]
    if (!template) {
      console.error(`[Notif] sin plantilla de correo para tipo=${payload.tipo}`)
      await anotarCorreo('fallido', { error: `sin plantilla para tipo=${payload.tipo}` })
    } else {
      const { subject, html } = template(templateData)
      // enviarCorreo respeta el límite de Resend y reintenta ante un 429; antes
      // los envíos masivos salían todos a la vez y la mayoría se perdía.
      const res = await enviarCorreo({ to: emailReal, subject, html })
      if (res.ok) {
        console.log(`[Notif] correo enviado tipo=${payload.tipo} usuario=${payload.destinatarioId} id=${res.id ?? '-'}`)
        await anotarCorreo('enviado', { id: res.id })
      } else {
        console.error(`[Notif] correo fallido tipo=${payload.tipo} usuario=${payload.destinatarioId}: ${res.error}`)
        await anotarCorreo('fallido', { error: res.error })
      }
    }
  }

  // 4. WhatsApp — solo plantillas aprobadas por Meta (ver lib/whatsapp.ts)
  if (whatsappEnabled && whatsappDisponible()) {
    const tel = normalizarTelefono(usuario.telefono)
    const plantilla = plantillaPara(payload.tipo, {
      nombreDestinatario: templateData.nombreDestinatario,
      mes: payload.mes,
      anio: payload.anio,
      contrato: payload.contrato,
      motivo: payload.motivo,
      numeroRadicado: payload.numeroRadicado,
      nombreRemitente: payload.nombreRemitente,
      detalle: payload.detalle,
    })

    // Cada rama se registra distinto a propósito. Un número fijo o un tipo sin
    // plantilla no son fallos: son casos esperados, y anotarlos como error
    // manda a buscar una avería que no existe. Solo el envío rechazado por
    // Meta merece nivel de error.
    if (!tel.ok) {
      console.log(`[WhatsApp] omitido tipo=${payload.tipo} motivo=telefono_${tel.motivo}`)
    } else if (!plantilla) {
      console.log(`[WhatsApp] omitido tipo=${payload.tipo} motivo=sin_plantilla_aprobada`)
    } else {
      const res = await enviarPlantillaWhatsApp(
        tel.e164,
        plantilla.nombre,
        plantilla.parametros,
        plantilla.idioma,
      )
      if (res.ok) {
        console.log(`[WhatsApp] enviado tipo=${payload.tipo} plantilla=${plantilla.nombre} id=${res.id}`)
      } else {
        console.error(`[WhatsApp] fallo tipo=${payload.tipo} plantilla=${plantilla.nombre} codigo=${res.codigo ?? '-'}: ${res.error}`)
      }
    }
  }
}

/**
 * Send notifications to multiple recipients at once.
 */
export async function enviarNotificacionMultiple(
  destinatarioIds: string[],
  payload: Omit<NotificationPayload, 'destinatarioId'>
): Promise<void> {
  await Promise.allSettled(
    destinatarioIds.map(id =>
      enviarNotificacion({ ...payload, destinatarioId: id })
    )
  )
}
