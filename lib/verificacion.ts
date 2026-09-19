/**
 * lib/verificacion.ts — Registro y verificación de documentos emitidos.
 *
 * Server-only. Cada PDF oficial (informe, cuenta de cobro, actas) lleva un
 * código único + QR que apunta a /verificar/{codigo}. Esa página pública
 * muestra los datos canónicos NO sensibles del documento, de modo que quien
 * recibe un papel o PDF pueda comprobar su autenticidad contra el sistema —
 * una firma robada y pegada en un documento falso pierde valor porque nadie
 * necesita confiar en la tinta, sino en la verificación.
 *
 * Seguridad: la tabla tiene RLS sin políticas → solo el service-role accede.
 * El código NO expone datos sensibles (sin cuenta bancaria, cédula completa,
 * dirección ni email) para que la página pública no filtre PII.
 */

import 'server-only'
import { randomInt } from 'crypto'
import QRCode from 'qrcode'
import { createAdminSupabaseClient } from './supabase-admin'
import { ORIGEN_APP } from './dominio'

/**
 * Origen que se graba en el QR de un documento emitido. SIEMPRE el dominio
 * propio, corra donde corra el código.
 *
 * ── Por qué ya no depende del deployment ─────────────────────────────────
 *
 * Antes, fuera de producción devolvía la URL única que Vercel da a cada
 * despliegue, con la idea de que un QR hecho en preview no mandara a
 * producción. El razonamiento falla por la base: preview y producción
 * COMPARTEN la base de datos y el depósito de archivos. Un documento que se
 * emite desde un preview no es una prueba — es una fila real en
 * `documentos_emitidos` con un código real, y su PDF real queda guardado en el
 * depósito de producción.
 *
 * Medido el 19 de septiembre de 2026: las CATORCE certificaciones de
 * retención existentes llevaban impreso un QR hacia
 * `docgov-…-projects.vercel.app`. Quien lo escaneaba aterrizaba en la pantalla
 * de acceso de Vercel, no en la verificación. El mismo código, pedido al
 * dominio propio, respondía «Documento auténtico»: el dato estaba bien, lo
 * impreso no.
 *
 * Como el código vive en la base de producción, el dominio propio SIEMPRE lo
 * resuelve —también el emitido desde un preview—, así que apuntar ahí es
 * correcto en los dos entornos. Y es lo único compatible con la regla 1 del
 * proyecto: el QR es inmutable una vez impreso, y la URL que lleva grabada
 * tiene que seguir respondiendo dentro de diez años.
 *
 * Los documentos emitidos antes de agosto de 2026 llevan el dominio anterior.
 * Siguen resolviendo por la redirección 301 del middleware. Ver lib/dominio.ts.
 */
function baseUrl(): string {
  return ORIGEN_APP
}

export type TipoDocumento = 'informe' | 'cuenta-cobro' | 'acta-supervision' | 'acta-pago' | 'certificacion-retencion' | 'acta-terminacion'

export const TIPO_LABEL: Record<TipoDocumento, string> = {
  'informe': 'Informe de Actividades',
  'cuenta-cobro': 'Cuenta de Cobro',
  'acta-supervision': 'Acta de Supervisión',
  'acta-pago': 'Acta de Pago',
  'certificacion-retencion': 'Certificación de Retención en la Fuente',
  'acta-terminacion': 'Acta de Terminación',
}

/** Datos NO sensibles que se muestran en la página pública de verificación. */
export interface DatosVerificacion {
  tipo: TipoDocumento
  contratoNumero: string
  contratoAnio: number
  contratistaNombre: string
  cedulaMasked: string          // solo últimos 4 dígitos: ****4846
  dependencia: string
  supervisorNombre: string
  mes: string
  anio: number
  valor: number
  estado: string
  fechaEmision: string          // ISO
  municipio?: string            // ej. "Fredonia (Antioquia)" — ausente en registros antiguos
}

// Crockford base32 sin caracteres ambiguos (sin I, L, O, U)
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function generarCodigo(): string {
  // crypto.randomInt: los códigos son la única llave de acceso a la página
  // pública — deben ser impredecibles, no solo únicos.
  const rnd = (n: number) =>
    Array.from({ length: n }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')
  return `CD-${rnd(4)}-${rnd(4)}`
}

/** Enmascara una cédula/NIT mostrando solo los últimos 4 dígitos. */
export function maskCedula(cedula: string | null | undefined): string {
  const c = (cedula ?? '').replace(/\D/g, '')
  if (c.length <= 4) return c ? `****${c}` : '—'
  return `****${c.slice(-4)}`
}

/**
 * Obtiene (o crea) el código estable del documento (tipo, periodo) y actualiza
 * su snapshot de verificación. Idempotente: el código no cambia entre
 * regeneraciones del PDF, así el código impreso sigue siendo válido.
 */
export async function registrarDocumento(params: {
  tipo: TipoDocumento
  periodoId: string
  datos: DatosVerificacion
  emitidoPor?: string | null
}): Promise<string> {
  const { tipo, periodoId, datos, emitidoPor } = params
  const admin = createAdminSupabaseClient()

  const { data: existing } = await admin
    .from('documentos_emitidos')
    .select('codigo')
    .eq('tipo', tipo)
    .eq('periodo_id', periodoId)
    .maybeSingle()

  if (existing?.codigo) {
    await admin
      .from('documentos_emitidos')
      .update({ datos_verificacion: datos, emitido_por: emitidoPor ?? null, updated_at: new Date().toISOString() })
      .eq('tipo', tipo)
      .eq('periodo_id', periodoId)
    return existing.codigo
  }

  // Insertar nuevo con reintento ante colisión de código (espacio ~10^12, raro)
  for (let i = 0; i < 5; i++) {
    const codigo = generarCodigo()
    const { error } = await admin.from('documentos_emitidos').insert({
      codigo, tipo, periodo_id: periodoId, datos_verificacion: datos, emitido_por: emitidoPor ?? null,
    })
    if (!error) return codigo
    // Puede ser: (a) carrera en (tipo,periodo) o (b) colisión de código
    const { data: race } = await admin
      .from('documentos_emitidos')
      .select('codigo')
      .eq('tipo', tipo)
      .eq('periodo_id', periodoId)
      .maybeSingle()
    if (race?.codigo) return race.codigo // otra emisión concurrente ganó
    // si no hay fila, fue colisión de código → reintentar
  }
  throw new Error('No se pudo generar un código de verificación único')
}

/** Guarda la huella (hash) de la última emisión del PDF. No bloqueante. */
export async function actualizarHashDocumento(codigo: string, hash: string): Promise<void> {
  const admin = createAdminSupabaseClient()
  await admin.from('documentos_emitidos').update({ hash_sha256: hash }).eq('codigo', codigo)
}

/** Registro completo para la página de verificación (o null si el código no existe). */
export async function getVerificacion(codigo: string): Promise<{
  codigo: string
  datos: DatosVerificacion
  hash: string | null
  emitidoEn: string
} | null> {
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('documentos_emitidos')
    .select('codigo, periodo_id, datos_verificacion, hash_sha256, created_at')
    .eq('codigo', codigo.trim().toUpperCase())
    .maybeSingle()
  if (!data) return null

  const datos = data.datos_verificacion as DatosVerificacion

  // Estado VIVO del periodo: el snapshot solo se refresca cuando el PDF se
  // regenera — si el acta pasó a "radicado" y nadie la volvió a abrir, el
  // snapshot quedaría diciendo "aprobado". La página pública debe reflejar
  // el estado actual del sistema, no el del último render.
  if (data.periodo_id) {
    const { data: p } = await admin
      .from('periodos')
      .select('estado')
      .eq('id', data.periodo_id)
      .maybeSingle()
    if (p?.estado) datos.estado = p.estado
  }

  return {
    codigo: data.codigo,
    datos,
    hash: data.hash_sha256,
    // created_at (primera emisión) y no updated_at: la fecha mostrada debe
    // ser estable — no cambiar cada vez que alguien re-descarga el PDF.
    emitidoEn: data.created_at,
  }
}

/** URL pública de verificación de un código. */
export function urlVerificacion(codigo: string): string {
  return `${baseUrl()}/verificar/${codigo}`
}

/** QR (data URL PNG) que apunta a la verificación del código. */
export async function qrDataUrl(codigo: string): Promise<string> {
  return QRCode.toDataURL(urlVerificacion(codigo), {
    margin: 0,
    width: 240,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#ffffff' },
  })
}
