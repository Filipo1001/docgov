/**
 * Escáner de firma: de treinta cuadros por segundo a un PNG limpio.
 *
 * ── POR QUÉ NO BASTA UNA FOTO ────────────────────────────────────────────
 *
 * Lo que había antes tomaba UNA imagen, promediaba el color de sus cuatro
 * esquinas y borraba todo lo que se le pareciera. Eso funciona con un escáner
 * plano, donde la hoja está iluminada por igual. Con un celular no: siempre
 * hay sombra de un lado. Si el promedio de las esquinas cae del lado oscuro,
 * el papel claro sobrevive y sale un rectángulo gris sobre el documento; si
 * cae del lado claro, se lleva por delante los trazos. Y el contratista se
 * enteraba DESPUÉS de guardar, porque no había previsualización.
 *
 * Con la cámara en vivo hay dos cosas que una sola foto no puede dar:
 *
 *   1. VARIOS CUADROS DEL MISMO PAPEL. El reflejo de una ventana, el grano
 *      del sensor y cualquier brillo pasajero aparecen en un cuadro y no en
 *      los otros. Tomando el valor MEDIANO de cada píxel entre varios cuadros,
 *      eso desaparece solo. El trazo, que está en todos, queda intacto.
 *
 *   2. EL MOMENTO. Se puede esperar a que la mano deje de temblar en vez de
 *      aceptar lo que salga del primer disparo.
 *
 * ── Y EL FONDO SE MIDE POR ZONAS ─────────────────────────────────────────
 *
 * En vez de un color de fondo para toda la imagen, se estima el brillo del
 * papel PUNTO POR PUNTO con un desenfoque muy amplio: un trazo fino no
 * sobrevive a ese desenfoque, el papel sí. La resta entre el papel estimado y
 * la imagen real deja solo la tinta. Una hoja con sombra a la izquierda y luz
 * a la derecha sale igual de limpia en los dos lados, que es exactamente lo
 * que el método anterior no sabía hacer.
 *
 * ── SOBRE LOS UMBRALES ───────────────────────────────────────────────────
 *
 * Los números de abajo salieron de razonar sobre el problema, no de medir
 * cientos de fotos reales. Son el primer candidato, están todos juntos a
 * propósito y se esperan ajustes después de verlo en teléfonos de verdad.
 */

// ─── Medidas del resultado ────────────────────────────────────────────────

/**
 * TOPES del PNG resultante, no medidas fijas.
 *
 * Antes eran exactamente 600 × 200 y la firma se centraba dentro, con
 * transparencia rellenando lo que sobrara. Eso castigaba a quien tiene una
 * firma compacta o con rúbrica encima: su PNG salía con márgenes vacíos y,
 * como las actas la pintan con ajuste «contener» en un hueco de 150 × 50,
 * esos márgenes viajaban al PDF y la firma se imprimía más pequeña que la de
 * los demás sin que nadie entendiera por qué.
 *
 * Ahora el lienzo se recorta ajustado a la tinta y estos dos números solo
 * limitan el tamaño. Una firma apaisada sigue saliendo igual que siempre;
 * una cuadrada deja de salir encogida.
 */
export const FIRMA_ANCHO_MAX = 600
export const FIRMA_ALTO_MAX = 300

/** Proporción con la que ARRANCA el marco guía. Ajustable por quien escanea:
 *  una firma pequeña en una hoja grande no se puede encuadrar de otro modo,
 *  porque el teléfono no enfoca más cerca de unos diez centímetros. */
export const PROPORCION_MARCO = 3

/** Lado mayor del recorte que se analiza en vivo. Más que esto no aporta y
 *  hace que el móvil se caliente. */
export const ANCHO_ANALISIS = 320

/** Cuántos cuadros se superponen al capturar. Impar, para que la mediana sea
 *  un valor real y no un promedio entre dos. */
export const CUADROS_RAFAGA = 5

// ─── Umbrales ─────────────────────────────────────────────────────────────

const BRILLO_MINIMO      = 62   // por debajo, la foto sale con ruido
const TINTA_MINIMA       = 0.004 // menos que esto: no hay nada en el marco
const TINTA_SUFICIENTE   = 0.018 // menos que esto: la firma se ve muy pequeña
const TINTA_EXCESIVA     = 0.34  // más que esto: el dedo o una sombra tapan el marco
const NITIDEZ_MINIMA     = 4.2   // gradiente medio; por debajo está movida
const MOVIMIENTO_MAXIMO  = 3.2   // diferencia media entre cuadros consecutivos

/** Radio del desenfoque que estima el papel, como fracción del ancho. Tiene
 *  que ser bastante mayor que el grosor de un trazo. */
const RADIO_FONDO = 0.055

/** Diferencia con el papel a partir de la cual un píxel empieza a ser tinta,
 *  y a partir de la cual es tinta del todo. Entre ambas, el borde se suaviza
 *  — sin eso los trazos salen dentados. */
const TINTA_DESDE = 16
const TINTA_PLENA = 46

// ─── Diagnóstico en vivo ──────────────────────────────────────────────────

export type Consejo =
  | 'buscando'    // no se ve nada parecido a una firma
  | 'falta_luz'   // demasiado oscuro
  | 'acercate'    // la firma ocupa muy poco del marco
  | 'despeja'     // algo tapa el marco
  | 'quieto'      // movida o temblando
  | 'listo'       // se puede capturar

export interface Lectura {
  consejo: Consejo
  brillo: number
  tinta: number
  nitidez: number
  movimiento: number
}

/** Luminancia de un ImageData como array plano de un byte por píxel. */
export function aGris(img: ImageData): Uint8ClampedArray {
  const { data } = img
  const gris = new Uint8ClampedArray(img.width * img.height)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Coeficientes de luminancia perceptual (Rec. 601).
    gris[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
  }
  return gris
}

/**
 * Qué le pasa al cuadro que la cámara está viendo ahora mismo.
 *
 * Devuelve UN solo consejo, nunca una lista: quien está sosteniendo el
 * teléfono con una mano solo puede arreglar una cosa a la vez.
 */
export function analizar(
  gris: Uint8ClampedArray,
  w: number,
  h: number,
  previo: Uint8ClampedArray | null,
): Lectura {
  let suma = 0
  for (let i = 0; i < gris.length; i++) suma += gris[i]
  const brillo = suma / gris.length

  // Gradiente medio. Una foto movida lo tiene bajo aunque haya mucha tinta.
  let grad = 0
  for (let y = 1; y < h; y++) {
    const fila = y * w
    for (let x = 1; x < w; x++) {
      const i = fila + x
      grad += Math.abs(gris[i] - gris[i - 1]) + Math.abs(gris[i] - gris[i - w])
    }
  }
  const nitidez = grad / Math.max(1, (w - 1) * (h - 1))

  // Píxeles claramente más oscuros que el papel que los rodea.
  const corte = brillo - 28
  let oscuros = 0
  for (let i = 0; i < gris.length; i++) if (gris[i] < corte) oscuros++
  const tinta = oscuros / gris.length

  // Cuánto cambió respecto al cuadro anterior. Sin cuadro previo se asume
  // movimiento: más vale esperar una vuelta que capturar a ciegas.
  let movimiento = Number.POSITIVE_INFINITY
  if (previo && previo.length === gris.length) {
    let dif = 0
    for (let i = 0; i < gris.length; i++) dif += Math.abs(gris[i] - previo[i])
    movimiento = dif / gris.length
  }

  // El orden importa: es la prioridad de lo que se le dice a la persona.
  let consejo: Consejo
  if (tinta < TINTA_MINIMA)          consejo = 'buscando'
  else if (brillo < BRILLO_MINIMO)   consejo = 'falta_luz'
  else if (tinta > TINTA_EXCESIVA)   consejo = 'despeja'
  else if (tinta < TINTA_SUFICIENTE) consejo = 'acercate'
  else if (nitidez < NITIDEZ_MINIMA || movimiento > MOVIMIENTO_MAXIMO) consejo = 'quieto'
  else                               consejo = 'listo'

  return { consejo, brillo, tinta, nitidez, movimiento }
}

// ─── Consolidación de la ráfaga ───────────────────────────────────────────

/**
 * El valor mediano de cada píxel entre varios cuadros del mismo papel.
 *
 * Es lo que borra el brillo de la ventana y el ruido del sensor sin tocar el
 * trazo: un reflejo está en uno o dos cuadros de cinco, así que nunca queda
 * en el medio al ordenar.
 */
export function mediana(cuadros: Uint8ClampedArray[]): Uint8ClampedArray {
  const n = cuadros.length
  if (n === 1) return cuadros[0]
  const salida = new Uint8ClampedArray(cuadros[0].length)
  const buffer = new Array<number>(n)
  const medio = n >> 1
  for (let i = 0; i < salida.length; i++) {
    for (let k = 0; k < n; k++) buffer[k] = cuadros[k][i]
    buffer.sort((a, b) => a - b)
    salida[i] = buffer[medio]
  }
  return salida
}

/**
 * Brillo del papel estimado punto por punto: media de una ventana cuadrada
 * amplia alrededor de cada píxel, calculada con una tabla de sumas
 * acumuladas para que no dependa del tamaño de la ventana.
 */
export function fondoLocal(
  gris: Uint8ClampedArray,
  w: number,
  h: number,
  radio: number,
): Float32Array {
  // Tabla de sumas acumuladas, con una fila y una columna de ceros al inicio
  // para no tener que comprobar los bordes en el bucle de abajo.
  const acum = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let filaSuma = 0
    for (let x = 0; x < w; x++) {
      filaSuma += gris[y * w + x]
      acum[(y + 1) * (w + 1) + (x + 1)] = acum[y * (w + 1) + (x + 1)] + filaSuma
    }
  }

  const fondo = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radio)
    const y1 = Math.min(h - 1, y + radio)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radio)
      const x1 = Math.min(w - 1, x + radio)
      const suma =
        acum[(y1 + 1) * (w + 1) + (x1 + 1)] -
        acum[y0 * (w + 1) + (x1 + 1)] -
        acum[(y1 + 1) * (w + 1) + x0] +
        acum[y0 * (w + 1) + x0]
      fondo[y * w + x] = suma / ((y1 - y0 + 1) * (x1 - x0 + 1))
    }
  }
  return fondo
}

/**
 * Tinta negra sobre transparencia: cada píxel se compara con el papel que
 * tiene alrededor, no con un color global.
 */
export function aTinta(
  gris: Uint8ClampedArray,
  w: number,
  h: number,
): ImageData {
  const radio = Math.max(6, Math.round(w * RADIO_FONDO))
  const fondo = fondoLocal(gris, w, h, radio)
  const salida = new ImageData(w, h)
  const d = salida.data
  for (let i = 0, j = 0; i < gris.length; i++, j += 4) {
    const diferencia = fondo[i] - gris[i]
    let alfa: number
    if (diferencia <= TINTA_DESDE) alfa = 0
    else if (diferencia >= TINTA_PLENA) alfa = 255
    else alfa = Math.round(((diferencia - TINTA_DESDE) / (TINTA_PLENA - TINTA_DESDE)) * 255)
    // Tinta siempre negra: una firma azul fotografiada con luz cálida sale de
    // un azul que no es el suyo, y en el PDF se imprime en negro de todos modos.
    d[j] = 0; d[j + 1] = 0; d[j + 2] = 0; d[j + 3] = alfa
  }
  return salida
}

/**
 * Recuadro que ocupa la tinta, para que la firma no salga nadando en papel
 * en blanco. Devuelve `null` si no encontró nada.
 */
export function recuadroDeTinta(
  img: ImageData,
  minAlfa = 48,
): { x: number; y: number; w: number; h: number } | null {
  const { width: w, height: h, data } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= minAlfa) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  // Un poco de aire alrededor; sin él la firma toca el borde del PNG.
  const aire = Math.round(Math.max(w, h) * 0.02)
  x0 = Math.max(0, x0 - aire); y0 = Math.max(0, y0 - aire)
  x1 = Math.min(w - 1, x1 + aire); y1 = Math.min(h - 1, y1 + aire)
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/**
 * De la ráfaga al PNG final, del tamaño que esperan los documentos.
 *
 * `cuadros` son recortes YA hechos del área del marco guía, todos del mismo
 * tamaño. Devuelve `null` si no encontró ni un trazo — quien llama decide qué
 * decirle a la persona.
 */
export function consolidar(cuadros: ImageData[]): HTMLCanvasElement | null {
  if (!cuadros.length) return null
  const w = cuadros[0].width
  const h = cuadros[0].height

  const gris = mediana(cuadros.map(aGris))
  const tinta = aTinta(gris, w, h)

  const caja = recuadroDeTinta(tinta)
  if (!caja) return null

  // Lienzo intermedio con la tinta ya calculada, para poder recortar y
  // escalar en un solo paso con la interpolación del navegador.
  const intermedio = document.createElement('canvas')
  intermedio.width = w
  intermedio.height = h
  intermedio.getContext('2d')!.putImageData(tinta, 0, 0)

  // El lienzo ES el recuadro de la tinta, sin márgenes. Nunca se amplía —
  // estirar un recorte pequeño solo lo emborrona— así que la escala se limita
  // a 1: si la firma ya cabe, se copia tal cual.
  const escala = Math.min(FIRMA_ANCHO_MAX / caja.w, FIRMA_ALTO_MAX / caja.h, 1)
  const dw = Math.max(1, Math.round(caja.w * escala))
  const dh = Math.max(1, Math.round(caja.h * escala))

  const destino = document.createElement('canvas')
  destino.width = dw
  destino.height = dh
  const ctx = destino.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(intermedio, caja.x, caja.y, caja.w, caja.h, 0, 0, dw, dh)
  return destino
}

// ─── Camino alternativo: una imagen que ya existe ──────────────────────────

/**
 * La misma consolidación, aplicada a un archivo en vez de a una ráfaga.
 *
 * Se mantiene para quien no puede usar la cámara, y pasa por el MISMO
 * tratamiento: un solo cuadro no se beneficia de la mediana, pero sí del
 * fondo medido por zonas, que es lo que arregla las fotos con sombra. Antes
 * este camino usaba el promedio de las cuatro esquinas y era justo donde
 * fallaba.
 *
 * Lanza si el navegador no sabe decodificar el archivo — un HEIC en Chrome,
 * por ejemplo. Quien llama traduce eso a algo que se pueda leer.
 */
export async function desdeArchivo(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('formato'))
      el.src = url
    })

    const ancho = Math.min(1280, img.naturalWidth)
    const alto = Math.max(1, Math.round((ancho * img.naturalHeight) / img.naturalWidth))
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    const ctx = lienzo.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('canvas')
    ctx.drawImage(img, 0, 0, ancho, alto)

    const resultado = consolidar([ctx.getImageData(0, 0, ancho, alto)])
    if (!resultado) throw new Error('sin-trazo')

    const blob = await new Promise<Blob | null>(res => resultado.toBlob(res, 'image/png'))
    if (!blob) throw new Error('png')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
