/**
 * lib/compress.ts — Client-side image compression utilities
 *
 * All functions run in the browser using the Canvas API.
 * Do NOT import from Server Components or Server Actions.
 *
 * Compression targets:
 *   - Evidence photos  → WebP 1024×768 px  q=0.72  (~70–90 KB vs ~185 KB JPEG before)
 *   - Profile photos   → WebP 400×400 px   q=0.82  (~20–40 KB vs ~550 KB raw)
 *   - Signatures       → PNG  600×200 px   q=0.95, background removed (transparency for PDF)
 */

// ─── WebP detection (cached after first check) ───────────────────────────────

let _webpSupported: boolean | null = null

function supportsWebP(): boolean {
  if (_webpSupported !== null) return _webpSupported
  const c = document.createElement('canvas')
  c.width = 1; c.height = 1
  _webpSupported = c.toDataURL('image/webp').startsWith('data:image/webp')
  return _webpSupported
}

// ─── Base resize + encode ─────────────────────────────────────────────────────

/**
 * Resize a File to fit within maxW×maxH (never upscales) and encode as
 * WebP (or JPEG on browsers that don't support WebP encoding) at the given quality.
 * Returns the original File unchanged on any canvas error.
 */
export function comprimirImagen(
  file: File,
  maxW: number,
  maxH: number,
  quality: number,
): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const objUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objUrl)

      const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
      const w = Math.round(img.naturalWidth * ratio)
      const h = Math.round(img.naturalHeight * ratio)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)

      const mime = supportsWebP() ? 'image/webp' : 'image/jpeg'
      const ext  = mime === 'image/webp' ? 'webp' : 'jpg'
      const name = file.name.replace(/\.[^.]+$/, `.${ext}`)

      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], name, { type: mime }) : file),
        mime,
        quality,
      )
    }

    img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(file) }
    img.src = objUrl
  })
}

// ─── HEIC conversion helper ───────────────────────────────────────────────────

async function convertirHeic(file: File): Promise<File> {
  try {
    const heic2any = (await import('heic2any')).default
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
    const blob = Array.isArray(converted) ? converted[0] : converted
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file // Safari handles HEIC natively via canvas
  }
}

function isHeic(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'heic' || ext === 'heif'
    || file.type === 'image/heic' || file.type === 'image/heif'
}

// ─── Evidence photos ──────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tiff'])

/**
 * Compress an evidence photo to max 1024×768 px, WebP q=0.72.
 * HEIC/HEIF files are converted to JPEG first via heic2any.
 * Non-image files (PDFs, etc.) pass through unchanged.
 * Expected output: ~70–90 KB from a typical ~185 KB JPEG.
 */
export async function comprimirEvidencia(file: File): Promise<File> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const looksLikeImage = file.type.startsWith('image/') || IMAGE_EXTS.has(ext)
  if (!looksLikeImage) return file

  const source = isHeic(file) ? await convertirHeic(file) : file
  return comprimirImagen(source, 1024, 768, 0.72)
}

// ─── Profile photos ───────────────────────────────────────────────────────────

/**
 * Compress a profile/avatar photo to max 400×400 px, WebP q=0.82.
 * HEIC conversion is supported.
 * Expected output: ~20–40 KB from a typical raw phone photo.
 */
export async function comprimirFoto(file: File): Promise<File> {
  const source = isHeic(file) ? await convertirHeic(file) : file
  return comprimirImagen(source, 400, 400, 0.82)
}

// ─── Signature normalization ──────────────────────────────────────────────────

const SIG_MAX_W = 600
const SIG_MAX_H = 200
const SIG_HARD  = 40  // pixels within 40 color-distance units of background → fully transparent
const SIG_SOFT  = 80  // 40–80 units → smooth fade to transparent

/**
 * Normalize a signature image:
 *  1. Resize to max 600×200 px (never upscales)
 *  2. Remove background via adaptive corner sampling
 *  3. Export as PNG (preserves transparency required for PDF embedding)
 *
 * Extracted from perfil/page.tsx and FirmasAdminClient.tsx — single source of truth.
 */
export function normalizarFirma(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objUrl)

      const ratio = Math.min(SIG_MAX_W / img.naturalWidth, SIG_MAX_H / img.naturalHeight, 1)
      const w = Math.round(img.naturalWidth * ratio)
      const h = Math.round(img.naturalHeight * ratio)

      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, w, h)

      // Adaptive background removal: sample 8×8 patches from all 4 corners
      const imageData = ctx.getImageData(0, 0, w, h)
      const d = imageData.data
      const patch = Math.min(8, Math.floor(w / 4), Math.floor(h / 4))

      let rSum = 0, gSum = 0, bSum = 0, n = 0
      for (let py = 0; py < patch; py++) {
        for (let px = 0; px < patch; px++) {
          for (const i of [
            (py * w + px) * 4,                        // top-left
            (py * w + (w - 1 - px)) * 4,              // top-right
            ((h - 1 - py) * w + px) * 4,              // bottom-left
            ((h - 1 - py) * w + (w - 1 - px)) * 4,   // bottom-right
          ]) {
            rSum += d[i]; gSum += d[i + 1]; bSum += d[i + 2]; n++
          }
        }
      }
      const bgR = rSum / n, bgG = gSum / n, bgB = bSum / n

      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.sqrt(
          (d[i] - bgR) ** 2 + (d[i + 1] - bgG) ** 2 + (d[i + 2] - bgB) ** 2
        )
        if (dist < SIG_HARD) {
          d[i + 3] = 0
        } else if (dist < SIG_SOFT) {
          d[i + 3] = Math.round(((dist - SIG_HARD) / (SIG_SOFT - SIG_HARD)) * 255)
        }
      }
      ctx.putImageData(imageData, 0, 0)

      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('Error al procesar firma')) },
        'image/png',
        0.95,
      )
    }

    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Imagen inválida')) }
    img.src = objUrl
  })
}
