import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cajasDe, leerTexto, type PaginaPdf } from '../../lib/pdf-texto'

// Multiplicación de matrices de pdf.js (Util.transform): m1 · m2.
const transform = (m1: number[], m2: number[]) => [
  m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
]

/** Una página de 200 × 100 con un solo trozo de texto de 10 de alto y 80 de ancho, con su baseline en (20, 50) de PDF. */
function pagina(viewTransform: number[], ancho = 200, alto = 100): PaginaPdf {
  return {
    getViewport: () => ({ width: ancho, height: alto, transform: viewTransform }),
    getTextContent: async () => ({ items: [{ str: 'IBC 2.320.000 fin', transform: [10, 0, 0, 10, 20, 50], width: 80 }, { str: '  ', transform: [10, 0, 0, 10, 0, 0], width: 3 }] }),
  }
}

test('el texto se lee con su posición como fracción de la página, y los espacios vacíos se descartan', async () => {
  // Vista normal: el eje Y de PDF sube, el de pantalla baja.
  const items = await leerTexto(pagina([1, 0, 0, -1, 0, 100]), { transform })
  assert.equal(items.length, 1)
  assert.equal(items[0].str, 'IBC 2.320.000 fin')
  // Baseline en x=20 (0,10 de 200) e y = 100 − 50 = 50 (0,5 de 100); ancho 80 (0,4); altura 10 hacia arriba (−0,1).
  assert.deepEqual(items[0].p.map(n => +n.toFixed(3)), [0.1, 0.5])
  assert.deepEqual(items[0].d.map(n => +n.toFixed(3)), [0.4, 0])
  assert.deepEqual(items[0].u.map(n => +n.toFixed(3)), [0, -0.1])
})

test('la caja resalta SOLO el fragmento, no todo el trozo de texto', async () => {
  const items = await leerTexto(pagina([1, 0, 0, -1, 0, 100]), { transform })
  const [caja] = cajasDe(items, [{ id: 'ibc', fragmento: '2.320.000', tono: 'ok' }])
  // «2.320.000» ocupa del carácter 4 al 13 de 17: de 0,1 + 0,4·(4/17) a 0,1 + 0,4·(13/17), en el 0,4–0,5 de alto.
  assert.ok(caja.izq > 0.1 + 0.4 * (4 / 17) - 0.01 && caja.izq < 0.1 + 0.4 * (4 / 17))
  assert.ok(Math.abs(caja.izq + caja.ancho - (0.1 + 0.4 * (13 / 17))) < 0.02)
  assert.ok(caja.arr < 0.4 && caja.arr + caja.alto > 0.5)
  assert.equal(caja.id, 'ibc')
})

test('una página girada 90° da cajas dentro de la página y con la forma girada', async () => {
  // Página 100 × 200 tras girarla: x' = y, y' = x (giro con la misma matriz de pdf.js para rotate=90: [0,1,1,0,0,0]).
  const items = await leerTexto(pagina([0, 1, 1, 0, 0, 0], 100, 200), { transform })
  const [caja] = cajasDe(items, [{ id: 'ibc', fragmento: '2.320.000', tono: 'ok' }])
  assert.ok(caja.izq >= 0 && caja.arr >= 0 && caja.izq + caja.ancho <= 1 && caja.arr + caja.alto <= 1)
  // El texto corre en vertical: la caja es más alta que ancha.
  assert.ok(caja.alto > caja.ancho)
})

test('sin el fragmento, o con un fragmento vacío, no hay cajas', async () => {
  const items = await leerTexto(pagina([1, 0, 0, -1, 0, 100]), { transform })
  assert.deepEqual(cajasDe(items, [{ id: 'x', fragmento: 'no está', tono: 'ok' }]), [])
  assert.deepEqual(cajasDe(items, [{ id: 'x', fragmento: '', tono: 'ok' }]), [])
})
