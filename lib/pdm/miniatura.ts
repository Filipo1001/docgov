/**
 * La miniatura de una foto, sin decodificar la foto entera para dibujarla.
 *
 * ── Por qué ──────────────────────────────────────────────────────────────
 *
 * Antes la miniatura era un `<img>` apuntando al archivo: para pintar un cuadro de 36 px el navegador decodificaba la foto
 * COMPLETA. Una foto de teléfono de 12 megapíxeles ocupa ~48 MB ya decodificada (una de 48 MP, ~190 MB), y se conserva
 * mientras la miniatura está en pantalla: con cinco fotos, cientos de MB solo para los cuadritos. En un teléfono eso
 * basta para que el sistema cierre o recargue la pestaña, y la persona ve la pantalla en blanco.
 *
 * Aquí la imagen se decodifica YA reducida (`createImageBitmap` con `resizeWidth`), se dibuja en un lienzo pequeño y lo que
 * se guarda es un JPEG de unos pocos KB. Una foto a la vez (quien llama las encadena) y el mapa de bits se libera al
 * terminar. Si el navegador no sabe reducir al decodificar, se descarta el resultado y no hay miniatura (queda el icono):
 * mejor sin cuadrito que con un tropiezo de memoria.
 */

const LADO = 72 // el doble del cuadro de 36 px: nítido en pantallas de alta densidad

/** Una dirección temporal con la miniatura, o `null` si no se pudo hacer sin gastar memoria de más. */
export async function crearMiniatura(archivo: File): Promise<string | null> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
    const mapa = await createImageBitmap(archivo, { resizeWidth: LADO * 2, resizeQuality: 'low' })
    try {
      // Si el navegador ignoró la reducción, el mapa trae la foto entera: no se usa.
      if (mapa.width > LADO * 4) return null
      const lienzo = document.createElement('canvas')
      lienzo.width = LADO
      lienzo.height = LADO
      const ctx = lienzo.getContext('2d')
      if (!ctx) return null
      // «Cubrir» el cuadro (recortar lo que sobra), como `object-fit: cover`.
      const escala = Math.max(LADO / mapa.width, LADO / mapa.height)
      const w = mapa.width * escala
      const h = mapa.height * escala
      ctx.drawImage(mapa, (LADO - w) / 2, (LADO - h) / 2, w, h)
      const blob = await new Promise<Blob | null>(r => lienzo.toBlob(r, 'image/jpeg', 0.72))
      return blob ? URL.createObjectURL(blob) : null
    } finally {
      mapa.close()
    }
  } catch {
    return null
  }
}
