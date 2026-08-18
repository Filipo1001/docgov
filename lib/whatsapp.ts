/**
 * Mapa de notificaciones → plantillas aprobadas de WhatsApp.
 *
 * Antes este archivo componía frases libres. Eso no funciona: fuera de la
 * ventana de 24 h, WhatsApp solo entrega plantillas previamente aprobadas por
 * Meta, y todas nuestras notificaciones las inicia el sistema. Los textos de
 * antes habrían sido rechazados en el momento de salir a producción.
 *
 * Ahora cada tipo se declara como el NOMBRE de una plantilla registrada en
 * WhatsApp Manager más el orden de sus parámetros. El texto real vive en Meta,
 * no aquí: si alguien lo cambia allá sin re-aprobar, Meta rechaza el envío.
 *
 * ── Plantillas registradas ────────────────────────────────────────────────
 *
 * El tuteo no es un capricho: el resto del producto tutea —el correo dice «Tu
 * informe … fue enviado»— y un canal que trata de usted al mismo destinatario
 * suena a que lo escribió otra empresa.
 *
 * Todas van en categoría UTILIDAD e idioma es_CO. Los nombres de abajo deben
 * coincidir EXACTAMENTE con los registrados; el texto completo de cada una
 * está en la guía que se entregó para registrarlas.
 *
 *   bienvenida_contratista   {{1}} nombre · {{2}} dirección de la aplicación
 *   informe_enviado          {{1}} nombre · {{2}} periodo · {{3}} contrato
 *   informe_en_revision      {{1}} nombre · {{2}} periodo · {{3}} contrato
 *   informe_aprobado         {{1}} nombre · {{2}} periodo · {{3}} contrato
 *   informe_rechazado        {{1}} nombre · {{2}} periodo · {{3}} contrato · {{4}} motivo
 *
 * Son las CINCO activas en Meta, todas dirigidas al contratista. Los avisos
 * a supervisión y secretaría —y los recordatorios del cron— siguen saliendo
 * solo por correo.
 *
 * Un tipo que no figure en el mapa de abajo se omite en silencio, que es lo
 * correcto. Uno que figure sin plantilla APROBADA en Meta se intentaría enviar
 * y sería rechazado con 132001 en cada intento: por eso el mapa y esta lista
 * tienen que moverse juntos.
 */

import { HOST_APP } from '@/lib/dominio'

/**
 * Código de idioma de las plantillas, tal y como quedaron registradas en Meta.
 *
 * Tiene que coincidir EXACTAMENTE con el que se eligió al crearlas: si la
 * plantilla se registró como «Spanish (COL)» y aquí se envía `es`, Meta
 * responde 132001 «Template name does not exist» — el mismo error que si la
 * plantilla no existiera, lo que despista por completo. Se registraron como
 * es_CO, que además es el español que corresponde al municipio.
 *
 * Configurable porque el día que se atienda otro país habrá que registrar las
 * plantillas en su variante y no debería hacer falta desplegar código.
 */
const IDIOMA = process.env.WHATSAPP_TEMPLATE_LANG || 'es_CO'

export interface DatosWhatsApp {
  nombreDestinatario: string
  mes?: string
  anio?: number
  contrato?: string
  motivo?: string
  numeroRadicado?: string
  nombreRemitente?: string
  detalle?: string
}

/**
 * Limpia un valor antes de mandarlo como parámetro de plantilla.
 *
 * Meta rechaza los parámetros que traen saltos de línea o más de cuatro
 * espacios seguidos — y un motivo de rechazo lo escribe a mano el supervisor,
 * así que puede traer cualquier cosa. Sin esta limpieza, un supervisor que
 * pulse Enter al redactar tumba el envío con un error que no dice eso.
 *
 * El recorte a 300 caracteres evita el otro extremo: un motivo larguísimo que
 * empuje el cuerpo por encima del límite de la plantilla.
 */
function limpiar(valor: string | undefined | null, max = 300): string {
  if (!valor) return ''
  const plano = valor.replace(/\s+/g, ' ').trim()
  return plano.length > max ? `${plano.slice(0, max - 1)}…` : plano
}

/** «Septiembre 2026», o solo el mes si no hay año. */
function periodoTexto(d: DatosWhatsApp): string {
  return limpiar(`${d.mes ?? ''} ${d.anio ?? ''}`, 40) || 'el periodo'
}

export interface PlantillaWhatsApp {
  nombre: string
  idioma: string
  parametros: string[]
}

type Constructor = (d: DatosWhatsApp) => PlantillaWhatsApp

const PLANTILLAS: Record<string, Constructor> = {
  // ── Cuenta ──────────────────────────────────────────────────────────────
  bienvenida: (d) => ({
    nombre: 'bienvenida_contratista',
    idioma: IDIOMA,
    parametros: [d.nombreDestinatario, HOST_APP],
  }),

  // ── Ciclo del informe, hacia el contratista ─────────────────────────────
  enviado_confirmacion: (d) => ({
    nombre: 'informe_enviado',
    idioma: IDIOMA,
    parametros: [d.nombreDestinatario, periodoTexto(d), limpiar(d.contrato, 40)],
  }),

  revision: (d) => ({
    nombre: 'informe_en_revision',
    idioma: IDIOMA,
    parametros: [d.nombreDestinatario, periodoTexto(d), limpiar(d.contrato, 40)],
  }),

  aprobado: (d) => ({
    nombre: 'informe_aprobado',
    idioma: IDIOMA,
    parametros: [d.nombreDestinatario, periodoTexto(d), limpiar(d.contrato, 40)],
  }),

  rechazado: (d) => ({
    nombre: 'informe_rechazado',
    idioma: IDIOMA,
    // El motivo lo escribe el supervisor a mano: pasa por `limpiar` porque un
    // salto de línea suyo bastaría para que Meta rechace el envío.
    parametros: [
      d.nombreDestinatario,
      periodoTexto(d),
      limpiar(d.contrato, 40),
      limpiar(d.motivo) || 'Revisa las observaciones en la plataforma',
    ],
  }),

  // ── Sin plantilla registrada, a propósito ───────────────────────────────
  //
  // `radicado` estuvo aquí, pero su plantilla se registró en INGLÉS y quedó
  // pendiente de recrear en Spanish (COL). Mientras no exista con ese idioma,
  // mapearla no la haría funcionar: Meta respondería 132001 en cada radicación.
  // Para reactivarla basta con volver a añadir su entrada —los parámetros son
  // nombre · periodo · contrato · número de radicado— cuando esté aprobada.
  //
  // Tampoco están `enviado` (aviso al supervisor), los tres recordatorios del
  // cron, `radicacion_pendiente` ni `contrato_vencimiento`: sus plantillas
  // nunca se registraron.
  //
  // La ausencia es deliberada y no es lo mismo que un olvido: un tipo que no
  // figura en este mapa se omite en silencio y sigue saliendo por correo,
  // mientras que uno que figure sin plantilla aprobada intentaría enviarse y
  // sería rechazado con 132001 en cada intento. El recordatorio del cron corre
  // a diario sobre todos los borradores del municipio, así que mapearlo sin su
  // plantilla llenaría los registros de errores todas las mañanas.
  //
  // Para habilitar cualquiera de ellos: registrar la plantilla en Meta,
  // esperar la aprobación y añadir aquí su entrada.
}

/**
 * Devuelve la plantilla para este tipo de notificación, o `null` si el tipo
 * todavía no tiene plantilla aprobada.
 *
 * `null` no es un error: significa «este aviso, por ahora, solo va por correo».
 * Quien llama debe tratarlo como una omisión deliberada y no como un fallo.
 */
export function plantillaPara(tipo: string, datos: DatosWhatsApp): PlantillaWhatsApp | null {
  const constructor = PLANTILLAS[tipo]
  return constructor ? constructor(datos) : null
}

/** Tipos con plantilla disponible — útil para la interfaz de administración. */
export function tiposConWhatsApp(): string[] {
  return Object.keys(PLANTILLAS)
}
