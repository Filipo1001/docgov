/**
 * lib/pdf-texto.ts — El texto de una página de PDF con su POSICIÓN, y las cajas que resaltan un fragmento.
 *
 * Aparte del componente para poder probarlo con planillas reales sin navegador. Las posiciones son FRACCIÓN de la página
 * (0 a 1), no píxeles: el lienzo se muestra al ancho disponible y lo único que no cambia al redimensionar es la proporción.
 * La geometría sale de la matriz que combina la vista y el texto, así que vale con páginas giradas (90°, 270°).
 */

/** Lo mínimo que se usa de una página de pdf.js (así el módulo no depende de pdfjs-dist). */
export interface PaginaPdf {
  getViewport(o: { scale: number }): { width: number; height: number; transform: number[] }
  getTextContent(): Promise<{ items: unknown[] }>
}

export interface Marca {
  id: string
  /** El texto literal a resaltar, tal como aparece en el documento. */
  fragmento: string
  tono: 'ok' | 'aviso'
}

/** Un trozo de texto con su posición: punto de partida P, dirección d (todo el ancho) y altura u, en fracción de página. */
export interface ItemTexto {
  str: string
  p: [number, number]
  d: [number, number]
  u: [number, number]
}

export interface Caja { id: string; tono: Marca['tono']; izq: number; arr: number; ancho: number; alto: number }

export async function leerTexto(page: PaginaPdf, util: { transform: (a: number[], b: number[]) => number[] }): Promise<ItemTexto[]> {
  const vista = page.getViewport({ scale: 1 })
  const contenido = await page.getTextContent()
  const items: ItemTexto[] = []
  for (const crudo of contenido.items) {
    const it = crudo as { str?: string; transform?: number[]; width?: number }
    if (typeof it.str !== 'string' || !it.str.trim() || !it.transform) continue
    const tx = util.transform(vista.transform, it.transform)
    const largo = Math.hypot(tx[0], tx[1]) || 1
    const ancho = it.width ?? 0
    items.push({
      str: it.str,
      p: [tx[4] / vista.width, tx[5] / vista.height],
      d: [(tx[0] / largo) * ancho / vista.width, (tx[1] / largo) * ancho / vista.height],
      u: [tx[2] / vista.width, tx[3] / vista.height],
    })
  }
  return items
}

/** Las cajas (en fracción de página) de cada marca en una página: una por cada trozo de texto que contiene el fragmento. */
export function cajasDe(items: ItemTexto[], marcas: Marca[]): Caja[] {
  const cajas: Caja[] = []
  for (const marca of marcas) {
    const buscado = marca.fragmento.toLowerCase()
    if (!buscado) continue
    for (const it of items) {
      const donde = it.str.toLowerCase().indexOf(buscado)
      if (donde < 0) continue
      const a = donde / it.str.length
      const b = (donde + buscado.length) / it.str.length
      const A: [number, number] = [it.p[0] + it.d[0] * a, it.p[1] + it.d[1] * a]
      const B: [number, number] = [it.p[0] + it.d[0] * b, it.p[1] + it.d[1] * b]
      const xs = [A[0], B[0], A[0] + it.u[0], B[0] + it.u[0]]
      const ys = [A[1], B[1], A[1] + it.u[1], B[1] + it.u[1]]
      const holgura = 0.004
      const izq = Math.min(...xs) - holgura
      const arr = Math.min(...ys) - holgura
      cajas.push({ id: marca.id, tono: marca.tono, izq, arr, ancho: Math.max(...xs) - izq + holgura, alto: Math.max(...ys) - arr + holgura * 1.5 })
    }
  }
  return cajas
}

