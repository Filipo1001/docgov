'use server'

/**
 * Server Actions: expediente documental del contrato.
 *
 * Mismo patrón que los anexos del informe (URL prefirmada + PUT directo del
 * navegador a Storage, y verificación del contenido REAL después de subir,
 * porque el MIME que declara el navegador lo controla el cliente).
 *
 * Diferencia de fondo con los anexos: aquí el TIPO es lo que da sentido al
 * archivo. Un anexo del informe se identifica por su orden; un documento del
 * contrato se busca por lo que es —"la certificación bancaria"— y por eso el
 * expediente se presenta por categorías y no como una lista plana.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { firmarUrl } from '@/lib/storage-firmado'
import { esGestorContratos } from '@/lib/constants'
import {
  validarPDF, type LimitesPDF,
  ADJUNTO_MAX_BYTES, ADJUNTO_MAX_PAGINAS,
  ADICIONAL_MAX_BYTES, ADICIONAL_MAX_PAGINAS,
} from '@/lib/pdf-validacion'
import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import type { ActionResult, Rol } from '@/lib/types'
import {
  TIPOS_DOCUMENTO_IDS,
  type TipoDocumento, type DocumentoContratoDTO,
} from '@/lib/documentos-contrato'

const BUCKET = 'adjuntos'

/**
 * Topes según el tipo. Los «Documentos adicionales» —el tipo `otro`— admiten
 * el triple, porque ahí van los otrosíes y los conceptos jurídicos, que son
 * los documentos largos del expediente. Los demás tipos son piezas cortas y
 * conocidas: un RUT o una certificación bancaria no llegan a 15 MB.
 */
function limitesPara(tipo: TipoDocumento): LimitesPDF {
  return tipo === 'otro'
    ? { maxBytes: ADICIONAL_MAX_BYTES, maxPaginas: ADICIONAL_MAX_PAGINAS }
    : { maxBytes: ADJUNTO_MAX_BYTES, maxPaginas: ADJUNTO_MAX_PAGINAS }
}

/** Gestiona el expediente quien gestiona el contrato. */
async function requireGestor(): Promise<{ userId: string; municipioId: string } | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('usuarios').select('rol, municipio_id').eq('id', user.id).single()
  if (!esGestorContratos(data?.rol as Rol)) return null
  return { userId: user.id, municipioId: data!.municipio_id as string }
}

// ── Paso 1: URL prefirmada ───────────────────────────────────────────────────

export async function prepararUploadDocumento(
  contratoId: string,
  fileName: string,
  fileSize: number,
  tipo: TipoDocumento,
): Promise<ActionResult<{ signedUrl: string; path: string }>> {
  try {
    if (!TIPOS_DOCUMENTO_IDS.has(tipo)) return { error: 'Tipo de documento no válido.' }
    if (!fileName.toLowerCase().endsWith('.pdf')) return { error: 'Solo se permiten archivos PDF.' }
    const limites = limitesPara(tipo)
    if (fileSize > limites.maxBytes) {
      return { error: `El archivo supera el máximo de ${Math.round(limites.maxBytes / 1024 / 1024)} MB.` }
    }

    const gestor = await requireGestor()
    if (!gestor) return { error: 'No autorizado' }

    const admin = createAdminSupabaseClient()
    const { data: contrato } = await admin
      .from('contratos').select('id').eq('id', contratoId).single()
    if (!contrato) return { error: 'Contrato no encontrado' }

    // Prefijo propio: mantiene el expediente del contrato separado de los
    // anexos del informe, que cuelgan del id de periodo.
    const path = `contratos/${contratoId}/${tipo}-${Date.now()}.pdf`
    const { data: signed, error } = await admin.storage
      .from(BUCKET).createSignedUploadUrl(path, { upsert: false })

    if (error || !signed) return { error: 'No se pudo preparar la subida. Intenta de nuevo.' }
    return { data: { signedUrl: signed.signedUrl, path } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ── Paso 2: registro + verificación del contenido real ───────────────────────

export async function registrarDocumento(
  contratoId: string,
  storagePath: string,
  nombreOriginal: string,
  tipo: TipoDocumento,
): Promise<ActionResult<DocumentoContratoDTO>> {
  const admin = createAdminSupabaseClient()
  try {
    const gestor = await requireGestor()
    if (!gestor) {
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
      return { error: 'No autorizado' }
    }
    if (!TIPOS_DOCUMENTO_IDS.has(tipo)) return { error: 'Tipo de documento no válido.' }
    if (!storagePath.startsWith(`contratos/${contratoId}/`)) {
      return { error: 'Ruta de archivo inválida.' }
    }

    const { data: blob, error: dlError } = await admin.storage.from(BUCKET).download(storagePath)
    if (dlError || !blob) return { error: 'No se encontró el archivo subido. Intenta de nuevo.' }

    const buf = Buffer.from(await blob.arrayBuffer())
    const validacion = await validarPDF(buf, limitesPara(tipo))
    if (!validacion.ok) {
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
      return { error: validacion.error ?? 'PDF inválido.' }
    }

    const { data: fila, error: insErr } = await admin
      .from('documentos_adjuntos')
      .insert({
        entidad_tipo: 'contrato',
        entidad_id: contratoId,
        tipo_documento: tipo,
        municipio_id: gestor.municipioId,
        storage_path: storagePath,
        nombre_original: nombreOriginal.slice(0, 200),
        bytes: buf.length,
        sha256: createHash('sha256').update(buf).digest('hex'),
        paginas: validacion.paginas ?? null,
        // El expediente no se numera: cada documento vale por su tipo.
        orden: 0,
        estado: 'limpio',
        verificado_at: new Date().toISOString(),
        subido_por: gestor.userId,
      })
      .select('id, nombre_original, bytes, paginas, tipo_documento, created_at')
      .single()

    if (insErr || !fila) {
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
      return { error: `No se pudo registrar el documento: ${insErr?.message ?? 'error desconocido'}` }
    }

    revalidatePath(`/dashboard/contratos/${contratoId}`)
    const urlFirmada = (await firmarUrl(BUCKET, storagePath)) ?? undefined
    return { data: { ...(fila as any), subido_por_nombre: null, urlFirmada } }
  } catch (e: unknown) {
    await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    return { error: e instanceof Error ? e.message : 'Error inesperado al registrar el documento' }
  }
}

// ── Listado ──────────────────────────────────────────────────────────────────

export async function listarDocumentosContrato(contratoId: string): Promise<DocumentoContratoDTO[]> {
  try {
    // Lectura con la sesión del usuario: RLS decide quién ve el expediente.
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await supabase
      .from('documentos_adjuntos')
      .select('id, nombre_original, bytes, paginas, tipo_documento, created_at, storage_path, subido_por:usuarios!documentos_adjuntos_subido_por_fkey(nombre_completo)')
      .eq('entidad_tipo', 'contrato')
      .eq('entidad_id', contratoId)
      .is('eliminado_at', null)
      .order('created_at', { ascending: false })

    return await Promise.all(((data ?? []) as any[]).map(async f => ({
      id: f.id,
      nombre_original: f.nombre_original,
      bytes: Number(f.bytes),
      paginas: f.paginas,
      tipo_documento: f.tipo_documento as TipoDocumento,
      created_at: f.created_at,
      subido_por_nombre: f.subido_por?.nombre_completo ?? null,
      urlFirmada: (await firmarUrl(BUCKET, f.storage_path)) ?? undefined,
    })))
  } catch {
    return []
  }
}

// ── Eliminación (lógica) ─────────────────────────────────────────────────────

export async function eliminarDocumentoContrato(
  contratoId: string,
  documentoId: string,
): Promise<ActionResult> {
  try {
    const gestor = await requireGestor()
    if (!gestor) return { error: 'No autorizado' }

    const admin = createAdminSupabaseClient()
    // Borrado lógico, igual que en los anexos: conserva la traza de que el
    // soporte estuvo en el expediente.
    const { error } = await admin
      .from('documentos_adjuntos')
      .update({ eliminado_at: new Date().toISOString() })
      .eq('id', documentoId)
      .eq('entidad_id', contratoId)
      .eq('entidad_tipo', 'contrato')
      .is('eliminado_at', null)

    if (error) return { error: error.message }
    revalidatePath(`/dashboard/contratos/${contratoId}`)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
