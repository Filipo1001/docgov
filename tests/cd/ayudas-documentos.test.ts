import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AYUDA_DOCUMENTO, LARGO_MAXIMO_AYUDA } from '../../lib/ayudas-documentos'

test('cada documento del formulario de envío tiene su explicación', () => {
  for (const clave of ['planilla', 'numeroPlanilla', 'soportePago', 'factura'] as const) {
    assert.ok(AYUDA_DOCUMENTO[clave].trim().length > 0, clave)
  }
})

test('ninguna explicación se alarga tanto que deje de leerse de un vistazo', () => {
  for (const [clave, texto] of Object.entries(AYUDA_DOCUMENTO)) {
    assert.ok(texto.length <= LARGO_MAXIMO_AYUDA, `${clave}: ${texto.length} caracteres`)
  }
})

test('dos documentos distintos no se explican con la misma frase', () => {
  const textos = Object.values(AYUDA_DOCUMENTO)
  assert.equal(new Set(textos).size, textos.length)
})

test('el soporte del pago se explica como lo que es: el comprobante, y que Hacienda lo pide', () => {
  assert.match(AYUDA_DOCUMENTO.soportePago, /comprobante/i)
  assert.match(AYUDA_DOCUMENTO.soportePago, /Hacienda/)
  assert.match(AYUDA_DOCUMENTO.planilla, /PILA/)
})
