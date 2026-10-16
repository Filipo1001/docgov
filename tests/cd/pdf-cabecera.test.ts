import assert from 'node:assert/strict'
import { test } from 'node:test'
import { esCabeceraPdf, tamanoTotalDeContentRange } from '../../lib/pdf-cabecera'

const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))

test('un PDF empieza por %PDF-', () => {
  assert.equal(esCabeceraPdf(bytes('%PDF-1.7\n%âãÏÓ')), true)
  assert.equal(esCabeceraPdf(bytes('%PDF-1.4')), true)
})

test('lo que no es un PDF se rechaza, aunque se llame .pdf', () => {
  assert.equal(esCabeceraPdf(bytes('MZ\x90\x00\x03')), false)            // un ejecutable de Windows
  assert.equal(esCabeceraPdf(bytes('PK\x03\x04')), false)                // un zip / docx
  assert.equal(esCabeceraPdf(bytes('<html><body>')), false)
  assert.equal(esCabeceraPdf(bytes('%PDF')), false)                      // demasiado corto
  assert.equal(esCabeceraPdf(new Uint8Array(0)), false)
  assert.equal(esCabeceraPdf(bytes(' %PDF-1.7')), false)                 // con un espacio delante
})

test('el tamaño total sale de Content-Range', () => {
  assert.equal(tamanoTotalDeContentRange('bytes 0-1023/2345678'), 2_345_678)
  assert.equal(tamanoTotalDeContentRange('bytes 0-1023/1024'), 1024)
  assert.equal(tamanoTotalDeContentRange('  bytes 0-0/10 '), 10)
})

test('sin Content-Range, o con uno que no se entiende, no hay tamaño', () => {
  assert.equal(tamanoTotalDeContentRange(null), null)
  assert.equal(tamanoTotalDeContentRange(undefined), null)
  assert.equal(tamanoTotalDeContentRange(''), null)
  assert.equal(tamanoTotalDeContentRange('bytes 0-1023/*'), null)       // tamaño desconocido
  assert.equal(tamanoTotalDeContentRange('items 0-1/5'), null)
  assert.equal(tamanoTotalDeContentRange('bytes 0-1023/abc'), null)
})
