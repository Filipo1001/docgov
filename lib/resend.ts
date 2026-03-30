import { Resend } from 'resend'

let resendClient: Resend | null = null

export function getResendClient(): Resend | null {
  if (resendClient) return resendClient

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null

  resendClient = new Resend(apiKey)
  return resendClient
}

export const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'DocGov <notificaciones@docgov.co>'
