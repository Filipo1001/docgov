'use server'

/**
 * Diagnóstico del canal de WhatsApp, para administradores.
 *
 * Existe porque cuando un mensaje no llega hay cinco causas posibles y desde
 * fuera se ven idénticas: faltan variables de entorno, el token venció, el
 * nombre de la plantilla no coincide con el registrado en Meta, el número no
 * está en la lista de prueba de la app, o el teléfono está mal escrito. Sin
 * esta pantalla, descartarlas una por una exige un despliegue por intento.
 *
 * Devuelve el error de Meta tal cual: sus mensajes son específicos y dicen
 * exactamente cuál de las cinco es.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enviarPlantillaWhatsApp, registrarNumeroWhatsApp, whatsappDisponible } from '@/lib/whatsapp-cloud'
import { normalizarTelefono, motivoTelefonoInvalido } from '@/lib/telefono'
import { plantillaPara, tiposConWhatsApp } from '@/lib/whatsapp'

async function exigirAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const { data: yo } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if ((yo as { rol?: string } | null)?.rol !== 'admin') {
    return { ok: false, error: 'Solo un administrador puede usar el diagnóstico' }
  }
  return { ok: true }
}

export interface EstadoWhatsApp {
  configurado: boolean
  faltantes: string[]
  tiposDisponibles: string[]
}

/** Qué hay configurado en ESTE entorno. Nunca devuelve el token, solo si existe. */
export async function estadoWhatsApp(): Promise<EstadoWhatsApp | { error: string }> {
  const permiso = await exigirAdmin()
  if (!permiso.ok) return { error: permiso.error }

  const faltantes: string[] = []
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID) faltantes.push('WHATSAPP_PHONE_NUMBER_ID')
  if (!process.env.WHATSAPP_TOKEN) faltantes.push('WHATSAPP_TOKEN')

  return {
    configurado: whatsappDisponible(),
    faltantes,
    // `hello_world` va primero a propósito: es la prueba que hay que hacer
    // ANTES que ninguna otra, porque valida la conexión sin depender de que
    // Meta haya aprobado ya nuestras plantillas.
    tiposDisponibles: ['hello_world', ...tiposConWhatsApp()],
  }
}

/**
 * Envía una plantilla real al número indicado.
 *
 * Usa exactamente el mismo camino que una notificación de verdad —misma
 * normalización, misma plantilla, mismo cliente— para que una prueba que pasa
 * signifique que el envío real también va a pasar.
 */
export async function probarWhatsApp(
  telefono: string,
  tipo: string,
): Promise<{ ok: boolean; detalle: string }> {
  const permiso = await exigirAdmin()
  if (!permiso.ok) return { ok: false, detalle: permiso.error }

  if (!whatsappDisponible()) {
    return { ok: false, detalle: 'Faltan las variables de entorno de WhatsApp en este entorno.' }
  }

  const tel = normalizarTelefono(telefono)
  if (!tel.ok) {
    return { ok: false, detalle: motivoTelefonoInvalido(tel.motivo) }
  }

  // Prueba de conexión pura, con la plantilla que Meta trae aprobada de
  // fábrica. Separa dos preguntas que de otro modo se confunden: «¿funcionan
  // el token, el número y el destinatario?» y «¿ya aprobaron NUESTRAS
  // plantillas?». Sin esto, un fallo mientras Meta revisa nuestras plantillas
  // es indistinguible de una credencial mal puesta, y no habría forma de
  // avanzar hasta que terminara la revisión.
  if (tipo === 'hello_world') {
    const res = await enviarPlantillaWhatsApp(tel.e164, 'hello_world', [], 'en_US')
    return res.ok
      ? { ok: true, detalle: `Conexión correcta. Mensaje de prueba enviado a +${tel.e164} (id: ${res.id}).` }
      : { ok: false, detalle: `Meta rechazó el envío${res.codigo ? ` (código ${res.codigo})` : ''}: ${res.error}` }
  }

  const plantilla = plantillaPara(tipo, {
    nombreDestinatario: 'Prueba',
    mes: 'Enero',
    anio: new Date().getFullYear(),
    contrato: '000-PRUEBA',
  })
  if (!plantilla) {
    return { ok: false, detalle: `El tipo «${tipo}» no tiene plantilla de WhatsApp definida.` }
  }

  const res = await enviarPlantillaWhatsApp(
    tel.e164,
    plantilla.nombre,
    plantilla.parametros,
    plantilla.idioma,
  )

  if (res.ok) {
    return { ok: true, detalle: `Enviado a +${tel.e164} con la plantilla «${plantilla.nombre}». Id: ${res.id}` }
  }
  return {
    ok: false,
    detalle: `Meta rechazó el envío${res.codigo ? ` (código ${res.codigo})` : ''}: ${res.error}`,
  }
}

/**
 * Registra el número en la API de la nube.
 *
 * Existe porque el paso está escondido en sitios distintos según la cuenta de
 * Meta, y sin él todo envío responde 133010 «Account not registered» aunque el
 * token y el identificador sean correctos. El PIN lo elige quien administra;
 * no se guarda aquí.
 */
export async function registrarNumero(pin: string): Promise<{ ok: boolean; detalle: string }> {
  const permiso = await exigirAdmin()
  if (!permiso.ok) return { ok: false, detalle: permiso.error }

  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, detalle: 'El PIN debe ser exactamente 6 dígitos.' }
  }
  if (!whatsappDisponible()) {
    return { ok: false, detalle: 'Faltan las variables de entorno de WhatsApp en este entorno.' }
  }

  const res = await registrarNumeroWhatsApp(pin)
  return res.ok
    ? { ok: true, detalle: 'Número registrado. Ya puedes enviar la prueba de conexión.' }
    : { ok: false, detalle: `Meta rechazó el registro${res.codigo ? ` (código ${res.codigo})` : ''}: ${res.error}` }
}
