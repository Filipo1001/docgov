/**
 * lib/storage-firmado.ts — Signed URLs for private Storage buckets.
 *
 * Server-only. The DB keeps storing canonical "public-form" URLs
 * (/storage/v1/object/public/<bucket>/<path>) as stable identifiers; every
 * display surface converts them to short-lived signed URLs through this module.
 *
 * Speed notes:
 * - firmarUrls() uses createSignedUrls (ONE storage API call per bucket for N
 *   objects), so SSR pages pay ~50-100 ms once instead of N round-trips.
 * - Signing uses the admin client: no RLS evaluation, and pages have already
 *   enforced access (requireContractAccess / role checks) before calling this.
 */

import 'server-only'
import { createAdminSupabaseClient } from './supabase-admin'

/** Default expiry: 6 h — covers a full work session; regenerated on each SSR. */
export const EXPIRACION_FIRMA_SEG = 21600

/**
 * Extract the object path from a Supabase Storage URL for the given bucket.
 * Handles public URLs, previously-signed URLs, and raw paths.
 * Returns null if the URL doesn't belong to the bucket.
 */
export function extraerPath(url: string, bucket: string): string | null {
  if (!url) return null
  // Raw path (no protocol) — already what we need
  if (!url.includes('://')) return url.replace(/^\/+/, '') || null
  for (const marker of [`/object/public/${bucket}/`, `/object/sign/${bucket}/`]) {
    const idx = url.indexOf(marker)
    if (idx !== -1) {
      const path = url.slice(idx + marker.length).split('?')[0]
      return decodeURIComponent(path) || null
    }
  }
  return null
}

/**
 * Batch-sign a list of stored URLs from one bucket.
 * Returns a map original URL → signed URL. URLs that don't belong to the
 * bucket or fail to sign are omitted (callers fall back to the original).
 */
export async function firmarUrls(
  bucket: string,
  urls: (string | null | undefined)[],
  expiresIn: number = EXPIRACION_FIRMA_SEG,
): Promise<Record<string, string>> {
  const unicas = [...new Set(urls.filter((u): u is string => !!u))]
  if (!unicas.length) return {}

  const paths: string[] = []
  const urlPorPath = new Map<string, string[]>()
  for (const u of unicas) {
    const p = extraerPath(u, bucket)
    if (!p) continue
    if (!urlPorPath.has(p)) {
      paths.push(p)
      urlPorPath.set(p, [])
    }
    urlPorPath.get(p)!.push(u)
  }
  if (!paths.length) return {}

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, expiresIn)
  if (error || !data) return {}

  const out: Record<string, string> = {}
  for (const item of data) {
    if (!item.signedUrl || !item.path) continue
    for (const original of urlPorPath.get(item.path) ?? []) {
      out[original] = item.signedUrl
    }
  }
  return out
}

/** Sign a single stored URL. Returns the original URL as fallback on failure. */
export async function firmarUrl(
  bucket: string,
  url: string | null | undefined,
  expiresIn: number = EXPIRACION_FIRMA_SEG,
): Promise<string | null> {
  if (!url) return null
  const map = await firmarUrls(bucket, [url], expiresIn)
  return map[url] ?? url
}

/**
 * Batch-sign a list of stored URLs with an on-the-fly resize transform
 * (Supabase Storage image transformations, Pro plan). Used for thumbnail
 * grids: a 3-8 MB evidencia photo becomes a ~10-20 KB 160×160 JPEG instead of
 * shipping the full-resolution file to paint an 80×80 px thumbnail.
 *
 * createSignedUrls (plural) has no transform parameter, so each URL is
 * signed individually via createSignedUrl — but all requests run in
 * parallel (Promise.all), so wall-clock cost stays close to one round-trip
 * regardless of how many images are on the page.
 */
export async function firmarUrlsMiniatura(
  bucket: string,
  urls: (string | null | undefined)[],
  transform: { width: number; height: number; resize?: 'cover' | 'contain' | 'fill'; quality?: number },
  expiresIn: number = EXPIRACION_FIRMA_SEG,
): Promise<Record<string, string>> {
  const unicas = [...new Set(urls.filter((u): u is string => !!u))]
  if (!unicas.length) return {}

  const admin = createAdminSupabaseClient()
  const entries = await Promise.all(
    unicas.map(async (u): Promise<[string, string] | null> => {
      const path = extraerPath(u, bucket)
      if (!path) return null
      try {
        const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresIn, { transform })
        if (error || !data?.signedUrl) return null
        return [u, data.signedUrl]
      } catch {
        return null
      }
    }),
  )
  return Object.fromEntries(entries.filter((e): e is [string, string] => e !== null))
}

/**
 * Download an object from a private bucket given its stored URL.
 * Server-side replacement for `fetch(publicUrl)`. Returns null on any failure
 * so callers can treat the file as optional.
 */
export async function descargarObjeto(bucket: string, url: string): Promise<Buffer | null> {
  const path = extraerPath(url, bucket)
  if (!path) return null
  try {
    const admin = createAdminSupabaseClient()
    const { data: blob } = await admin.storage.from(bucket).download(path)
    if (!blob) return null
    return Buffer.from(await blob.arrayBuffer())
  } catch {
    return null
  }
}
