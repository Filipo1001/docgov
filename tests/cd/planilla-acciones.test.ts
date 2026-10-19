import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// Guarda contra una puerta olvidada: toda acción del servidor que ESCRIBE la planilla, el soporte del pago o el número de
// planilla tiene que pasar por la regla de `lib/planilla-contratista.ts`. La regla en sí se prueba en planilla-contratista.test.ts;
// esto comprueba que nadie añada o cambie una acción dejándola fuera.

const fuente = readFileSync(new URL('../../app/actions/periodos.ts', import.meta.url), 'utf8')
const acciones = fuente.split(/\nexport async function /).slice(1).map(t => ({ nombre: t.slice(0, t.indexOf('(')), cuerpo: t }))
const ESCRIBE = /\.update\(\{[^}]*\b(planilla_ss_url|soporte_pago_url|numero_planilla)\b/
// El relleno de datos históricos es de administrador y supervisor y lo dice su propio comentario: nunca de la contratista.
const SIN_REGLA = new Set(['actualizarPlanillaHistorica'])

test('hay acciones que escriben los documentos de seguridad social (la guarda mira algo)', () => {
  const escriben = acciones.filter(a => ESCRIBE.test(a.cuerpo)).map(a => a.nombre)
  for (const esperada of ['confirmarUploadPlanilla', 'subirPlanilla', 'eliminarPlanilla', 'confirmarUploadSoportePago', 'eliminarSoportePago', 'guardarNumeroPlanilla']) {
    assert.ok(escriben.includes(esperada), `${esperada} debería contarse entre las que escriben`)
  }
})

test('toda acción que escribe planilla, soporte o número pasa por la regla de la contratista', () => {
  const sinRegla = acciones.filter(a => ESCRIBE.test(a.cuerpo) && !SIN_REGLA.has(a.nombre) && !a.cuerpo.includes('puedeCambiarDocumentosSS('))
  assert.deepEqual(sinRegla.map(a => a.nombre), [], 'estas acciones escriben documentos de seguridad social sin consultar puedeCambiarDocumentosSS')
})

test('quien prepara la subida de la planilla o del soporte también pasa por la regla', () => {
  for (const nombre of ['prepararUploadPlanilla', 'prepararUploadSoportePago']) {
    const a = acciones.find(x => x.nombre === nombre)
    assert.ok(a, nombre)
    assert.ok(a.cuerpo.includes('puedeCambiarDocumentosSS('), nombre)
  }
})

test('ya no queda la lista vieja de estados donde la contratista podía cambiarlo todo', () => {
  assert.ok(!fuente.includes('ESTADOS_PLANILLA_EDITABLE'))
})

test('la acción que reenvía la corrección exige la regla de reenvío y deja rastro en el historial', () => {
  const a = acciones.find(x => x.nombre === 'reenviarPlanillaARevision')
  assert.ok(a)
  assert.ok(a.cuerpo.includes('puedeReenviarPlanilla('))
  assert.ok(a.cuerpo.includes('insertHistorial('))
})
