/**
 * lib/pHash.ts — Client-side image hashing utilities for duplicate detection.
 *
 * Do NOT import from Server Components or Server Actions — uses Canvas + File API.
 *
 * computeFileHash:       SHA-256 of the raw file bytes (exact duplicate detection).
 * computePerceptualHash: 64-bit average hash (aHash) stored as 16-char hex string.
 *                        Processes 8 bytes directly — no BigInt, works with ES2017.
 * hammingDistance:       Bit-difference between two hex-encoded 8-byte hashes.
 *                        Threshold ≤ 10 → treat as "visually similar".
 */

export const PHASH_THRESHOLD = 10

/** SHA-256 of the raw file bytes, returned as a 64-char hex string. */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Average-hash (aHash) of the image.
 * Reduces the image to 8×8 grayscale, compares each pixel to the mean brightness.
 * Returns a 16-char hex string (8 bytes / 64 bits).
 * Images that look the same visually (screenshots, re-encodings, rescaled copies)
 * produce hashes with Hamming distance ≤ 10.
 */
export function computePerceptualHash(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    const objUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objUrl)

      const SIZE = 8
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, SIZE, SIZE)

      const data = ctx.getImageData(0, 0, SIZE, SIZE).data
      const gray = new Float32Array(SIZE * SIZE)
      for (let i = 0; i < SIZE * SIZE; i++) {
        // Rec. 601 luma
        gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
      }

      const mean = gray.reduce((a, b) => a + b, 0) / gray.length

      // Build hash as 8 bytes (each byte = 8 bits from 8 pixels)
      let hex = ''
      for (let byte = 0; byte < 8; byte++) {
        let val = 0
        for (let bit = 0; bit < 8; bit++) {
          if (gray[byte * 8 + bit] >= mean) val |= (1 << bit)
        }
        hex += val.toString(16).padStart(2, '0')
      }

      resolve(hex)
    }

    img.onerror = () => { URL.revokeObjectURL(objUrl); resolve('') }
    img.src = objUrl
  })
}

/**
 * Compute aHash from a public image URL.
 * Sets crossOrigin = 'anonymous' so Canvas can read the pixel data.
 * Used for silent backfill of historical evidencias.
 */
export function computePerceptualHashFromUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const SIZE = 8
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, SIZE, SIZE)

      const data = ctx.getImageData(0, 0, SIZE, SIZE).data
      const gray = new Float32Array(SIZE * SIZE)
      for (let i = 0; i < SIZE * SIZE; i++) {
        gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
      }
      const mean = gray.reduce((a, b) => a + b, 0) / gray.length

      let hex = ''
      for (let byte = 0; byte < 8; byte++) {
        let val = 0
        for (let bit = 0; bit < 8; bit++) {
          if (gray[byte * 8 + bit] >= mean) val |= (1 << bit)
        }
        hex += val.toString(16).padStart(2, '0')
      }
      resolve(hex)
    }

    img.onerror = () => resolve('')
    img.src = url
  })
}

/**
 * Number of bits that differ between two 16-char hex hashes (Hamming distance).
 * Processes byte-by-byte — no BigInt, compatible with ES2017.
 * Returns 64 on invalid input.
 */
export function hammingDistance(hexA: string, hexB: string): number {
  if (!hexA || !hexB || hexA.length !== 16 || hexB.length !== 16) return 64
  let count = 0
  for (let i = 0; i < 16; i += 2) {
    let xor = parseInt(hexA.slice(i, i + 2), 16) ^ parseInt(hexB.slice(i, i + 2), 16)
    while (xor) { xor &= xor - 1; count++ }
  }
  return count
}
