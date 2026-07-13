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
import QRCode from 'qrcode'
import { createAdminSupabaseClient } from './supabase-admin'

/**
 * Origen público de la app en este deployment. En producción es el dominio
 * propio; en preview, Vercel expone la URL única del deployment por
 * VERCEL_URL — usarla evita que los QR/enlaces generados en preview apunten
 * a producción (donde esta ruta puede no existir todavía) y viceversa.
 */
function baseUrl(): string {
  if (process.env.VERCEL_ENV === 'production') return 'https://contratistadigital.com'
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export type TipoDocumento = 'informe' | 'cuenta-cobro' | 'acta-supervision' | 'acta-pago'

export const TIPO_LABEL: Record<TipoDocumento, string> = {
  'informe': 'Informe de Actividades',
  'cuenta-cobro': 'Cuenta de Cobro',
  'acta-supervision': 'Acta de Supervisión',
  'acta-pago': 'Acta de Pago',
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
}

// Crockford base32 sin caracteres ambiguos (sin I, L, O, U)
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function generarCodigo(): string {
  const rnd = (n: number) =>
    Array.from({ length: n }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('')
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
    .select('codigo, datos_verificacion, hash_sha256, updated_at')
    .eq('codigo', codigo.trim().toUpperCase())
    .maybeSingle()
  if (!data) return null
  return {
    codigo: data.codigo,
    datos: data.datos_verificacion as DatosVerificacion,
    hash: data.hash_sha256,
    emitidoEn: data.updated_at,
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
