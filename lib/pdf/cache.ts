/**
 * PDF Cache utility
 *
 * Strategy:
 * - Cache PDFs in Supabase Storage bucket `pdf-cache`
 * - Key: `{tipo}/{periodoId}.pdf`  (one file per tipo per periodo)
 * - Only cache estados where content is stable (enviado, revision, aprobado, radicado)
 * - borrador / rechazado → never cached (content changes frequently)
 * - Cache is invalidated by `invalidarCachePDF` whenever periodo estado changes
 *   or activities/evidences are modified
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { prepararVerificacionPDF, type VerificacionPDF } from '@/lib/pdf/verificacion-pdf'
import type { TipoDocumento } from '@/lib/verificacion'

const BUCKET = 'pdf-cache'

// The pdf-cache bucket is private (contains actas with cédulas and bank data).
// All storage operations run through the admin client; the calling routes have
// already enforced access via verificarAccesoPeriodo.

/**
 * Error de datos incompletos: lanzado por `generate()` cuando faltan campos
 * obligatorios. getOrGeneratePDF lo convierte en un 422 con mensaje legible,
 * en vez de un 500 críptico.
 */
export class PDFDatosIncompletosError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PDFDatosIncompletosError'
  }
}

// States where PDF content won't change until the next state transition
export const ESTADOS_CACHEABLES = new Set(['enviado', 'revision', 'aprobado', 'radicado'])

/**
 * Serve a PDF from cache if available, otherwise generate, cache and serve.
 * Cached PDFs are served via public-URL redirect (zero server bandwidth).
 *
 * Optimization notes:
 * - `estado` is fetched with a lightweight single-column query (not buildPDFData)
 *   so expensive PDF data loading only happens on cache miss.
 * - Cache existence check uses storage.list() (direct storage API, no CDN layer)
 *   so it always reflects the true file state — not a potentially-stale CDN response.
 * - `generate` is called only on cache miss; it returns both the buffer and
 *   the filename so buildPDFData can live entirely inside the closure.
 */
export async function getOrGeneratePDF({
  supabase,
  tipo,
  periodoId,
  generate,
}: {
  supabase: any
  tipo: string
  periodoId: string
  generate: (verif: VerificacionPDF | null) => Promise<{ buffer: Buffer; filename: string }>
}): Promise<NextResponse> {
  const cacheKey = `${tipo}/${periodoId}.pdf`

  // Lightweight estado check — single column, single row
  const { data: periodoRow } = await supabase
    .from('periodos')
    .select('estado')
    .eq('id', periodoId)
    .single()

  const estado = periodoRow?.estado ?? ''
  const shouldCache = ESTADOS_CACHEABLES.has(estado)

  if (shouldCache) {
    try {
      // createSignedUrl doubles as existence check (errors on missing objects)
      // AND produces the redirect target. Bucket is private: the browser needs
      // a signed URL. Short expiry — the redirect is consumed immediately.
      // no-store on the REDIRECT so the browser re-validates on every open and
      // regenerations are visible at once (the real CPU-saving cache lives in
      // Storage, not in the browser's memory of the redirect target).
      const admin = createAdminSupabaseClient()
      const { data: signedData } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(cacheKey, 300)

      if (signedData?.signedUrl) {
        return NextResponse.redirect(signedData.signedUrl, {
          status: 302,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'X-PDF-Cache': 'HIT',
          },
        })
      }
    } catch {
      // Cache check failed — fall through to generate
    }
  }

  // Cache miss (or non-cacheable estado) — generate PDF now
  // buildPDFData is called inside generate(), so it's skipped on cache hits.
  // La verificación (código + QR) se prepara aquí, centralizada, para que TODO
  // documento la lleve de forma coherente y comparta el mismo caché.
  const verif = await prepararVerificacionPDF(tipo as TipoDocumento, periodoId)
  let buffer: Buffer
  let filename: string
  try {
    ;({ buffer, filename } = await generate(verif))
  } catch (e) {
    // Datos incompletos → 422 con mensaje legible (no un 500 críptico)
    if (e instanceof PDFDatosIncompletosError) {
      return NextResponse.json({ error: e.message }, { status: 422 })
    }
    throw e
  }

  if (shouldCache) {
    // Fire and forget — don't block the response
    createAdminSupabaseClient().storage
      .from(BUCKET)
      .upload(cacheKey, buffer, { contentType: 'application/pdf', upsert: true })
      .catch(() => { /* non-critical — next request will regenerate */ })
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-PDF-Cache': 'MISS',
    },
  })
}

/**
 * Same cache logic as getOrGeneratePDF but returns a raw Buffer instead of a
 * NextResponse. Used by ZIP/paquete and actas routes so they can assemble
 * multiple PDFs without spawning separate HTTP responses.
 *
 * Cache hits are fetched via a single GET to the public CDN URL — the GET both
 * confirms existence and downloads the content, replacing the old two-step
 * storage.list() + separate fetch pattern.
 */
export async function getOrGeneratePDFBuffer({
  supabase,
  tipo,
  periodoId,
  estado,
  generate,
}: {
  supabase: any
  tipo: string
  periodoId: string
  estado: string
  generate: (verif: VerificacionPDF | null) => Promise<Buffer>
}): Promise<Buffer> {
  const cacheKey = `${tipo}/${periodoId}.pdf`
  const shouldCache = ESTADOS_CACHEABLES.has(estado)
  const admin = createAdminSupabaseClient()

  if (shouldCache) {
    try {
      // Direct storage download: existence check + content fetch in one call,
      // no CDN staleness, works on the private bucket.
      const { data: blob } = await admin.storage.from(BUCKET).download(cacheKey)
      if (blob) return Buffer.from(await blob.arrayBuffer())
    } catch {
      // Cache fetch failed — fall through to regenerate
    }
  }

  const verif = await prepararVerificacionPDF(tipo as TipoDocumento, periodoId)
  const buffer = await generate(verif)

  if (shouldCache) {
    admin.storage
      .from(BUCKET)
      .upload(cacheKey, buffer, { contentType: 'application/pdf', upsert: true })
      .catch(() => { /* non-critical */ })
  }

  return buffer
}

/**
 * Invalidate all cached PDFs for a given periodo.
 * Call this (fire-and-forget) whenever periodo estado changes.
 * Uses the admin client to bypass RLS on storage.
 */
export async function invalidarCachePDF(adminSupabase: any, periodoId: string): Promise<void> {
  const tipos = ['informe', 'cuenta-cobro', 'acta-pago', 'acta-supervision']
  const paths = tipos.map(t => `${t}/${periodoId}.pdf`)
  await adminSupabase.storage.from(BUCKET).remove(paths)
}
