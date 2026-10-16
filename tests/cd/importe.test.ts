import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_BASE_COTIZACION_SS } from '../../lib/constants'
import { compararConDefecto, cursorTrasFormatear, explicarBasePorDefecto, formatearImporte, soloDigitos } from '../../lib/importe'

test('el importe se muestra con sus puntos, sin ceros a la izquierda', () => {
  assert.equal(formatearImporte('1750905'), '1.750.905')
  assert.equal(formatearImporte('999'), '999')
  assert.equal(formatearImporte('1000'), '1.000')
  assert.equal(formatearImporte('0004500000'), '4.500.000')
  assert.equal(formatearImporte(''), '')
  assert.equal(formatearImporte('abc'), '')
  assert.equal(formatearImporte('1.750.905'), '1.750.905')   // ya formateado: idempotente
})

test('solo se conservan los dígitos', () => {
  assert.equal(soloDigitos('$ 1.750.905,00'), '175090500')
  assert.equal(soloDigitos(''), '')
})

test('el cursor conserva cuántos dígitos tenía a su izquierda al reescribir con puntos', () => {
  // Se teclea un 2 al final de «175090» → «1750902»; el campo pasa a «1.750.902» y el cursor va al final.
  assert.equal(cursorTrasFormatear('1750902', 7, '1.750.902'), 9)
  // Se borra una cifra del medio: de «1.750.905» se borra el «5» y queda «1.70.905» con el cursor tras «1.7» (2 dígitos a
  // su izquierda): al reformatear a «170.905» el cursor queda entre el 7 y el 0.
  assert.equal(cursorTrasFormatear('1.70.905', 3, '170.905'), 2)
  // Se teclea una cifra al principio: «91750905» con el cursor tras el 9.
  assert.equal(cursorTrasFormatear('91750905', 1, '91.750.905'), 1)
  // Un cursor delante de todo se queda delante de todo.
  assert.equal(cursorTrasFormatear('1750905', 0, '1.750.905'), 0)
  // Un cursor tras el punto de millar queda tras él (cuenta dígitos, no posiciones).
  assert.equal(cursorTrasFormatear('1.750.905', 5, '1.750.905'), 5)
})

test('lo escrito se compara con el valor por defecto', () => {
  const D = 2_000_000
  assert.deepEqual(compararConDefecto(0, D), { tipo: 'vacio' })
  assert.deepEqual(compararConDefecto(NaN, D), { tipo: 'vacio' })
  assert.deepEqual(compararConDefecto(2_000_000, D), { tipo: 'igual' })
  assert.deepEqual(compararConDefecto(2_500_000, D), { tipo: 'mayor', diferencia: 500_000 })
  assert.deepEqual(compararConDefecto(1_900_000, D), { tipo: 'menor', diferencia: 100_000 })
})

test('por debajo del piso se avisa, aunque el valor por defecto sea otro', () => {
  const r = compararConDefecto(1_000_000, 2_000_000)
  assert.equal(r.tipo, 'bajo_piso')
  if (r.tipo === 'bajo_piso') {
    assert.equal(r.piso, DEFAULT_BASE_COTIZACION_SS)
    assert.equal(r.diferencia, 1_000_000)
  }
  assert.equal(compararConDefecto(DEFAULT_BASE_COTIZACION_SS, DEFAULT_BASE_COTIZACION_SS).tipo, 'igual')   // justo el piso no es «bajo»
})

test('el valor por defecto se explica con la misma regla que el acta', () => {
  const bajo = explicarBasePorDefecto(4_000_000)               // 40 % = 1.600.000 < piso
  assert.equal(bajo.valor, DEFAULT_BASE_COTIZACION_SS)
  assert.match(bajo.texto, /por debajo del piso/)
  const alto = explicarBasePorDefecto(6_000_000)               // 40 % = 2.400.000 > piso
  assert.equal(alto.valor, 2_400_000)
  assert.match(alto.texto, /40 %/)
  assert.doesNotMatch(alto.texto, /piso/)
  const sin = explicarBasePorDefecto(0)
  assert.equal(sin.valor, DEFAULT_BASE_COTIZACION_SS)
  assert.match(sin.texto, /Sin valor mensual/)
})
