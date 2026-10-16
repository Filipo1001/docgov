import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  esNombrePdf, esRutaDeSoportePago, NOMBRE_ARCHIVO_SOPORTE_PAGO, prefijoSoportePago, rutaNuevaSoportePago,
} from '../../lib/soporte-pago'

const P = '11111111-2222-3333-4444-555555555555'
const OTRO = '99999999-2222-3333-4444-555555555555'

test('la ruta nueva cuelga de la carpeta del periodo y se reconoce como suya', () => {
  const r = rutaNuevaSoportePago(P, 1_790_000_000_000)
  assert.equal(r, `soportes-pago/${P}/1790000000000.pdf`)
  assert.equal(esRutaDeSoportePago(P, r), true)
})

test('una ruta de otro periodo, de otra carpeta o con trucos se rechaza', () => {
  assert.equal(esRutaDeSoportePago(P, `soportes-pago/${OTRO}/1.pdf`), false)
  assert.equal(esRutaDeSoportePago(P, `planillas/${P}/1.pdf`), false)
  assert.equal(esRutaDeSoportePago(P, `facturas/${P}/1.pdf`), false)
  assert.equal(esRutaDeSoportePago(P, `soportes-pago/${P}/../${OTRO}/1.pdf`), false)
  assert.equal(esRutaDeSoportePago(P, `soportes-pago/${P}/sub/1.pdf`), false)
  assert.equal(esRutaDeSoportePago(P, `soportes-pago/${P}/1.exe`), false)
  assert.equal(esRutaDeSoportePago(P, `soportes-pago/${P}/`), false)
  assert.equal(esRutaDeSoportePago(P, ''), false)
})

test('solo PDF', () => {
  assert.equal(esNombrePdf('comprobante.pdf'), true)
  assert.equal(esNombrePdf('COMPROBANTE.PDF'), true)
  assert.equal(esNombrePdf('comprobante.png'), false)
  assert.equal(esNombrePdf('comprobante'), false)
})

test('en el listado del paquete el soporte va después de la planilla', () => {
  // Orden alfabético dentro del ZIP: Planilla_… < Soporte_…; además se inserta justo después de la planilla.
  assert.ok('Planilla_Seguridad_Social.pdf' < NOMBRE_ARCHIVO_SOPORTE_PAGO)
  assert.equal(NOMBRE_ARCHIVO_SOPORTE_PAGO, 'Soporte_Pago_Seguridad_Social.pdf')
  assert.equal(prefijoSoportePago(P), `soportes-pago/${P}/`)
})
