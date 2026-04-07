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
 */
export async function getOrGeneratePDF({
  supabase,
  tipo,
  periodoId,
  estado,
  generate,
  filename,
}: {
  supabase: any
  tipo: string
  periodoId: string
  estado: string
  generate: () => Promise<Buffer>
  filename: string
}): Promise<NextResponse> {
  const cacheKey = `${tipo}/${periodoId}.pdf`
  const shouldCache = ESTADOS_CACHEABLES.has(estado)

  if (shouldCache) {
    // Check for cached file (metadata only — no download)
    const { data: files } = await supabase.storage
      .from(BUCKET)
      .list(tipo, { search: `${periodoId}.pdf`, limit: 1 })

    const hit = (files ?? []).find((f: any) => f.name === `${periodoId}.pdf`)
    if (hit) {
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(cacheKey)
      // Redirect to Supabase CDN — instant delivery, zero server CPU
      return NextResponse.redirect(publicUrl, {
        status: 302,
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'X-PDF-Cache': 'HIT',
        },
      })
    }
  }

  // Generate PDF
  const buffer = await generate()

  if (shouldCache) {
    // Upload to cache — fire and forget (don't block response)
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
 * Invalidate all cached PDFs for a given periodo.
 * Call this (fire-and-forget) whenever periodo estado changes.
 * Uses the admin client to bypass RLS on storage.
 */
export async function invalidarCachePDF(adminSupabase: any, periodoId: string): Promise<void> {
  const tipos = ['informe', 'cuenta-cobro', 'acta-pago', 'acta-supervision']
  const paths = tipos.map(t => `${t}/${periodoId}.pdf`)
  await adminSupabase.storage.from(BUCKET).remove(paths)
}
