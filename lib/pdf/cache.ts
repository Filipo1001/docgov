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

const BUCKET = 'pdf-cache'

// States where PDF content won't change until the next state transition
export const ESTADOS_CACHEABLES = new Set(['enviado', 'revision', 'aprobado', 'radicado'])

/**
 * Serve a PDF from cache if available, otherwise generate, cache and serve.
 * Cached PDFs are served via public-URL redirect (zero server bandwidth).
 *
 * Optimization notes:
 * - `estado` is fetched with a lightweight single-column query (not buildPDFData)
 *   so expensive PDF data loading only happens on cache miss.
 * - Cache existence check uses a HEAD request instead of storage.list(),
 *   which avoids an extra Supabase API round-trip on every cache hit.
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
  generate: () => Promise<{ buffer: Buffer; filename: string }>
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
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(cacheKey)
    try {
      // HEAD request: existence check without downloading the file
      const headRes = await fetch(publicUrl, { method: 'HEAD' })
      if (headRes.ok) {
        // Redirect to Supabase CDN — instant delivery, zero server CPU
        return NextResponse.redirect(publicUrl, {
          status: 302,
          headers: {
            'Cache-Control': 'public, max-age=3600',
            'X-PDF-Cache': 'HIT',
          },
        })
      }
    } catch {
      // Cache check failed — fall through to generate
    }
  }

  // Cache miss (or non-cacheable estado) — generate PDF now
  // buildPDFData is called inside generate(), so it's skipped on cache hits
  const { buffer, filename } = await generate()

  if (shouldCache) {
    // Fire and forget — don't block the response
    supabase.storage
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
  generate: () => Promise<Buffer>
}): Promise<Buffer> {
  const cacheKey = `${tipo}/${periodoId}.pdf`
  const shouldCache = ESTADOS_CACHEABLES.has(estado)

  if (shouldCache) {
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(cacheKey)
    try {
      // Single GET: existence check + content fetch combined (no storage.list() needed)
      const res = await fetch(publicUrl)
      if (res.ok) return Buffer.from(await res.arrayBuffer())
    } catch {
      // Cache fetch failed — fall through to regenerate
    }
  }

  const buffer = await generate()

  if (shouldCache) {
    supabase.storage
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
