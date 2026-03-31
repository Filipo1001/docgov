'use server'

/**
 * Central notification dispatcher.
 * Handles in-app (DB), email (Resend), and WhatsApp (Twilio) channels.
 */

import { createAdminSupabaseClient } from './supabase-admin'
import { getResendClient, RESEND_FROM } from './resend'
import { getTwilioClient, TWILIO_WHATSAPP_FROM } from './twilio'
import { EMAIL_TEMPLATES } from './emails/templates'
import { getWhatsAppMessage } from './whatsapp'

export interface NotificationPayload {
  destinatarioId: string
  tipo: string
  titulo: string
  mensaje: string
  periodoId: string
  // Context for external channels
  mes?: string
  anio?: number
  contrato?: string
  motivo?: string
  numeroRadicado?: string
  nombreRemitente?: string
}

/**
 * Send a notification through all enabled channels.
 * Never throws — logs errors silently to avoid breaking the main flow.
 */
export async function enviarNotificacion(payload: NotificationPayload): Promise<void> {
  const adminClient = createAdminSupabaseClient()

  // 1. Always save to database (in-app notification)
  await adminClient.from('notificaciones').insert({
    usuario_id: payload.destinatarioId,
    tipo: payload.tipo,
    titulo: payload.titulo,
    mensaje: payload.mensaje,
    periodo_id: payload.periodoId,
    leida: false,
  })

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
  const whatsappEnabled = prefMap.get('whatsapp') === true // default: false

  const templateData = {
    nombreDestinatario: usuario.nombre_completo?.split(' ')[0] || 'Usuario',
    mes: payload.mes || '',
    anio: payload.anio || 0,
    contrato: payload.contrato || '',
    motivo: payload.motivo,
    numeroRadicado: payload.numeroRadicado,
    nombreRemitente: payload.nombreRemitente,
  }

  // 3. Send email (if enabled and configured)
  console.log(`[Notif] tipo=${payload.tipo} to=${usuario.email} emailEnabled=${emailEnabled} RESEND_FROM=${RESEND_FROM}`)
  if (emailEnabled && usuario.email) {
    try {
      const resend = getResendClient()
      console.log(`[Notif] resend=${resend ? 'OK' : 'NULL (missing RESEND_API_KEY)'}`)
      if (resend) {
        const template = (EMAIL_TEMPLATES as Record<string, typeof EMAIL_TEMPLATES[string] | undefined>)[payload.tipo]
        console.log(`[Notif] template=${template ? 'found' : 'NOT FOUND for tipo=' + payload.tipo}`)
        if (template) {
          const { subject, html } = template(templateData)
          const result = await resend.emails.send({
            from: RESEND_FROM,
            to: usuario.email,
            subject,
            html,
          })
          console.log(`[Notif] Email result:`, JSON.stringify(result))
        }
      }
    } catch (err) {
      console.error('[Notif] Email failed:', err)
    }
  }

  // 4. Send WhatsApp (if enabled and configured)
  if (whatsappEnabled && usuario.telefono) {
    try {
      const twilio = getTwilioClient()
      if (twilio) {
        const body = getWhatsAppMessage(payload.tipo, templateData)
        const to = usuario.telefono.startsWith('whatsapp:')
          ? usuario.telefono
          : `whatsapp:+57${usuario.telefono.replace(/\D/g, '').replace(/^57/, '')}`
        await twilio.messages.create({
          body,
          from: TWILIO_WHATSAPP_FROM,
          to,
        })
      }
    } catch (err) {
      console.error('[Notification] WhatsApp failed:', err)
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
