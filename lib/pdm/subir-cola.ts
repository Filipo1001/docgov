/**
 * Sube una lista de archivos con un máximo de subidas a la vez, y cada uno por su cuenta.
 *
 * ── Por qué así ──────────────────────────────────────────────────────────
 *
 * Antes se lanzaban TODAS juntas (`Promise.all`): con cinco archivos de varios MB compartiendo la misma conexión, cada
 * uno tardaba cinco veces más y el primero que fallaba tumbaba el envío entero, dejando subidos y perdidos a los demás.
 * Ahora:
 *
 *   · Como mucho `concurrencia` a la vez (3): rápido sin ahogar una conexión de oficina o de teléfono.
 *   · El fallo de uno NO frena a los otros: cada archivo termina en «subido» o en «error» con su propio mensaje, y quien
 *     envió reintenta solo los que fallaron.
 *   · Cada cambio de estado se avisa (`alCambio`) para que la pantalla muestre el progreso de cada archivo.
 *
 * No sabe de `XMLHttpRequest` ni de React: recibe una función `subir` y la usa. Así se prueba con una de juguete.
 */

export type CambioDeSubida =
  | { estado: 'subiendo'; progreso: number }
  | { estado: 'subido'; progreso: 1 }
  | { estado: 'error'; error: string }

export type ResultadoDeSubida = { ok: true } | { ok: false; error: string }

export async function subirCola<T extends { clave: string }>(
  pendientes: readonly T[],
  subir: (item: T, alProgreso: (fraccion: number) => void) => Promise<void>,
  { concurrencia = 3, alCambio }: { concurrencia?: number; alCambio: (clave: string, cambio: CambioDeSubida) => void },
): Promise<Map<string, ResultadoDeSubida>> {
  const resultados = new Map<string, ResultadoDeSubida>()
  let siguiente = 0

  async function trabajador() {
    for (;;) {
      const k = siguiente++
      if (k >= pendientes.length) return
      const item = pendientes[k]
      alCambio(item.clave, { estado: 'subiendo', progreso: 0 })
      try {
        await subir(item, fraccion => alCambio(item.clave, { estado: 'subiendo', progreso: Math.min(1, Math.max(0, fraccion)) }))
        resultados.set(item.clave, { ok: true })
        alCambio(item.clave, { estado: 'subido', progreso: 1 })
      } catch (e) {
        const error = e instanceof Error && e.message ? e.message : 'No se pudo subir el archivo.'
        resultados.set(item.clave, { ok: false, error })
        alCambio(item.clave, { estado: 'error', error })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrencia, pendientes.length)) }, trabajador))
  return resultados
}
