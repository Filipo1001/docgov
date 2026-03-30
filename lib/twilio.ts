import twilio from 'twilio'

let twilioClient: ReturnType<typeof twilio> | null = null

export function getTwilioClient(): ReturnType<typeof twilio> | null {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null

  if (!twilioClient) {
    twilioClient = twilio(sid, token)
  }
  return twilioClient
}

export const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'
