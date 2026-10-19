import { createHash } from 'node:crypto'

/**
 * La HUELLA de una evidencia: el SHA-256 de su contenido (migración 070).
 *
 * Es lo que permite demostrar, meses después y ante un tercero, que el archivo que alguien tiene en la mano es
 * exactamente el que se subió: cambiar un solo bit del archivo cambia la huella.
 *
 * Aquí solo está lo PURO (sin servidor ni base): calcularla sobre un flujo de bytes y decirla en pantalla. Quién la
 * calcula y dónde se anota está en `huella-servidor.ts`.
 */

/** 64 caracteres hexadecimales en minúscula: la forma única en que se guarda (la base lo exige igual). */
export const FORMA_DE_HUELLA = /^[0-9a-f]{64}$/

export const esHuella = (v: unknown): v is string => typeof v === 'string' && FORMA_DE_HUELLA.test(v)

/**
 * El SHA-256 de un flujo de bytes y cuántos bytes tenía. Va consumiendo el flujo trozo a trozo: un archivo grande no se
 * carga entero en memoria.
 */
export async function huellaDeFlujo(flujo: AsyncIterable<Uint8Array>): Promise<{ sha256: string; bytes: number }> {
  const h = createHash('sha256')
  let bytes = 0
  for await (const trozo of flujo) {
    h.update(trozo)
    bytes += trozo.byteLength
  }
  return { sha256: h.digest('hex'), bytes }
}

/** Para decirla en una línea: «a3f9c2e1…81b4d6f0». La completa se copia con un clic; esta solo sirve para reconocerla. */
export function huellaCorta(sha256: string): string {
  return esHuella(sha256) ? `${sha256.slice(0, 8)}…${sha256.slice(-8)}` : ''
}
