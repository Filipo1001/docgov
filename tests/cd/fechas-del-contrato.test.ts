import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { FECHAS_EN_ACTA_DESDE, actaConFechasDelContrato } from '@/lib/pdf/fechas-del-contrato'

const CORTE = '2026-10-27T15:00:00Z'

test('un periodo que todavía no está aprobado ni radicado lleva las fechas del contrato (su acta se emite de aquí en adelante)', () => {
  for (const estado of ['borrador', 'enviado', 'revision', 'rechazado']) {
    assert.equal(actaConFechasDelContrato({ estado, fecha_aprobacion: null }, CORTE), true, estado)
  }
  assert.equal(actaConFechasDelContrato({}, CORTE), true, 'sin estado, también: nada emitido que conservar')
})

test('lo aprobado o radicado ANTES del corte conserva su forma (regla 3: un documento emitido no se reescribe)', () => {
  assert.equal(actaConFechasDelContrato({ estado: 'aprobado', fecha_aprobacion: '2026-10-20T12:00:00Z' }, CORTE), false)
  assert.equal(actaConFechasDelContrato({ estado: 'radicado', fecha_aprobacion: '2026-09-02T12:00:00Z' }, CORTE), false)
  assert.equal(actaConFechasDelContrato({ estado: 'radicado', fecha_aprobacion: '2026-10-27T14:59:59Z' }, CORTE), false, 'un segundo antes del corte')
})

test('lo aprobado o radicado DESPUÉS del corte lleva las fechas, también en el instante exacto', () => {
  assert.equal(actaConFechasDelContrato({ estado: 'aprobado', fecha_aprobacion: '2026-10-27T15:00:00Z' }, CORTE), true)
  assert.equal(actaConFechasDelContrato({ estado: 'radicado', fecha_aprobacion: '2026-11-03T12:00:00Z' }, CORTE), true)
})

test('un radicado o aprobado sin fecha de aprobación es anterior a que existiera ese campo: conserva su forma', () => {
  assert.equal(actaConFechasDelContrato({ estado: 'radicado', fecha_aprobacion: null }, CORTE), false)
  assert.equal(actaConFechasDelContrato({ estado: 'aprobado' }, CORTE), false)
})

test('el corte publicado es el del 27-oct-2026 14:21 UTC y se aplica por defecto', () => {
  // Es la hora en que se publicó el cambio (ver la nota de `FECHAS_EN_ACTA_DESDE`): moverlo reescribiría actas ya emitidas.
  assert.equal(FECHAS_EN_ACTA_DESDE, '2026-10-27T14:21:00Z')
  assert.equal(actaConFechasDelContrato({ estado: 'aprobado', fecha_aprobacion: '2026-10-27T14:20:59Z' }), false, 'aprobado antes del corte: conserva su forma')
  assert.equal(actaConFechasDelContrato({ estado: 'aprobado', fecha_aprobacion: '2026-10-27T14:21:00Z' }), true, 'en el corte y después: lleva las fechas')
  assert.equal(actaConFechasDelContrato({ estado: 'radicado', fecha_aprobacion: '2026-10-20T12:00:00Z' }), false)
  assert.equal(actaConFechasDelContrato({ estado: 'borrador' }), true)
})

test('el acta de pago pone las dos filas en las DOS tablas (con y sin otrosí) y cierra la tabla con la última', () => {
  const fuente = readFileSync('lib/pdf/acta-pago.tsx', 'utf8')
  assert.equal(fuente.match(/<FilasFechasDelContrato /g)?.length, 2, 'una vez con otrosí y otra sin él')
  assert.equal(fuente.match(/conFechas \? s\.infoRow : s\.infoRowLast/g)?.length, 2, '«No. CRP» deja de ser la última fila cuando hay fechas')
  assert.match(fuente, /<Text>Fecha de inicio<\/Text>/)
  assert.match(fuente, /<Text>Fecha de fin<\/Text>/)
  // Las filas nuevas salen del contrato tal como está hoy (un otrosí ya movió la fecha de fin).
  assert.match(fuente, /fechaDelContrato\(contrato\.fecha_inicio_contrato\)/)
  assert.match(fuente, /fechaDelContrato\(contrato\.fecha_fin_contrato\)/)
})
