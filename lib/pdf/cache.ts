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
    try {
      // Use storage.list() instead of a CDN HEAD request.
      // A HEAD to the public CDN URL can return stale 200s for minutes after
      // the file is deleted (CDN cache TTL), causing us to redirect to an old
      // PDF even after invalidarCachePDF has run.  storage.list() queries the
      // storage service directly — no CDN layer, always reflects true state.
      const { data: fileList } = await supabase.storage
        .from(BUCKET)
        .list(tipo, { limit: 1, search: `${periodoId}.pdf` })

      if (fileList?.some((f: { name: string }) => f.name === `${periodoId}.pdf`)) {
        const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(cacheKey)
        // Redirect to Supabase CDN — instant delivery, zero server CPU.
        // IMPORTANTE: no-store en el REDIRECT (no en el PDF). Antes usaba
        // max-age=3600, lo que hacía que el navegador recordara el redirect a
        // la versión vieja hasta 1 h: tras editar un dato (planilla, mes de
        // cotización…) e invalidar el caché del servidor, el usuario seguía
        // viendo el PDF anterior. Con no-store el navegador revalida el redirect
        // en cada apertura, así que la regeneración se ve de inmediato. El
        // caché real (que ahorra CPU) sigue viviendo en Storage; esto solo
        // afecta a que el navegador no memorice a dónde apuntaba el redirect.
        return NextResponse.redirect(publicUrl, {
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
  // buildPDFData is called inside generate(), so it's skipped on cache hits
  let buffer: Buffer
  let filename: string
  try {
    ;({ buffer, filename } = await generate())
  } catch (e) {
    // Datos incompletos → 422 con mensaje legible (no un 500 críptico)
    if (e instanceof PDFDatosIncompletosError) {
      return NextResponse.json({ error: e.message }, { status: 422 })
    }
    throw e
  }

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
