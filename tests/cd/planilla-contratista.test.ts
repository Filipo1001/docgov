import assert from 'node:assert/strict'
import { test } from 'node:test'
import { esUrlDePlanilla, hayPlanillaDevuelta, puedeCambiarDocumentosSS, puedeReenviarPlanilla, revisionTrasCambio } from '../../lib/planilla-contratista'

type Entrada = Parameters<typeof puedeCambiarDocumentosSS>[0]
const base: Entrada = { rol: 'contratista', estado: 'borrador', planillaEstado: 'pendiente', esHistorico: false }
const ok = (o: Partial<Entrada>) => puedeCambiarDocumentosSS({ ...base, ...o }).ok

test('la contratista cambia los documentos mientras el informe es suyo: borrador o devuelto', () => {
  assert.equal(ok({ estado: 'borrador' }), true)
  assert.equal(ok({ estado: 'rechazado' }), true)
})

test('con el informe enviado o en revisión NO cambia nada, ni con la planilla pendiente ni con la aprobada ni sin revisar', () => {
  for (const estado of ['enviado', 'revision']) {
    for (const planillaEstado of ['pendiente', 'aprobada', null, undefined] as const) {
      assert.equal(ok({ estado, planillaEstado }), false, `${estado} / ${planillaEstado}`)
    }
  }
})

test('con el informe enviado o en revisión SÍ cambia, pero solo mientras el revisor tenga la planilla devuelta', () => {
  assert.equal(ok({ estado: 'enviado', planillaEstado: 'rechazada' }), true)
  assert.equal(ok({ estado: 'revision', planillaEstado: 'rechazada' }), true)
})

test('aprobado y radicado quedan cerrados, también con una planilla devuelta de antes', () => {
  for (const estado of ['aprobado', 'radicado']) {
    assert.equal(ok({ estado }), false, estado)
    assert.equal(ok({ estado, planillaEstado: 'rechazada' }), false, `${estado} con planilla devuelta`)
  }
})

test('un periodo histórico no se toca', () => {
  assert.equal(ok({ esHistorico: true }), false)
  assert.equal(ok({ estado: 'enviado', planillaEstado: 'rechazada', esHistorico: true }), false)
})

test('quien no es la contratista ni el administrador no cambia nada, y el administrador conserva lo que tenía', () => {
  for (const rol of ['supervisor', 'asesor', 'contratacion', 'alcalde', null, undefined, '']) assert.equal(ok({ rol }), false, String(rol))
  for (const estado of ['borrador', 'enviado', 'revision', 'rechazado']) assert.equal(ok({ rol: 'admin', estado, planillaEstado: 'pendiente' }), true, `admin ${estado}`)
  for (const estado of ['aprobado', 'radicado']) assert.equal(ok({ rol: 'admin', estado }), false, `admin ${estado}`)
})

test('el mensaje dice por qué: informe enviado (con qué salida) o periodo ya aprobado', () => {
  const enviado = puedeCambiarDocumentosSS({ ...base, estado: 'enviado' })
  assert.ok(!enviado.ok && /ya fue enviado/.test(enviado.error) && /devuelve la planilla/.test(enviado.error))
  const aprobado = puedeCambiarDocumentosSS({ ...base, estado: 'aprobado' })
  assert.ok(!aprobado.ok && /aprobado o radicado/.test(aprobado.error))
})

test('la ventana de corrección existe solo con el informe en revisión y la planilla devuelta', () => {
  assert.equal(hayPlanillaDevuelta('enviado', 'rechazada'), true)
  assert.equal(hayPlanillaDevuelta('revision', 'rechazada'), true)
  assert.equal(hayPlanillaDevuelta('enviado', 'pendiente'), false)
  assert.equal(hayPlanillaDevuelta('borrador', 'rechazada'), false, 'en borrador ya puede editar: no hace falta ventana')
  assert.equal(hayPlanillaDevuelta('aprobado', 'rechazada'), false)
})

test('dentro de la ventana, cambiar un documento NO devuelve la revisión a «pendiente» ni borra el motivo; fuera, sí', () => {
  assert.deepEqual(revisionTrasCambio('enviado', 'rechazada'), { planilla_estado: 'rechazada', borraMotivo: false })
  assert.deepEqual(revisionTrasCambio('revision', 'rechazada'), { planilla_estado: 'rechazada', borraMotivo: false })
  assert.deepEqual(revisionTrasCambio('borrador', 'rechazada'), { planilla_estado: 'pendiente', borraMotivo: true })
  assert.deepEqual(revisionTrasCambio('rechazado', 'rechazada'), { planilla_estado: 'pendiente', borraMotivo: true })
  assert.deepEqual(revisionTrasCambio('borrador', 'aprobada'), { planilla_estado: 'pendiente', borraMotivo: true })
  assert.deepEqual(revisionTrasCambio('enviado', 'pendiente'), { planilla_estado: 'pendiente', borraMotivo: true })
})

type Reenvio = Parameters<typeof puedeReenviarPlanilla>[0]
const devuelta: Reenvio = { rol: 'contratista', estado: 'enviado', planillaEstado: 'rechazada', tienePlanilla: true, tieneSoporte: true, numeroPlanilla: '6031524547' }
const reenvio = (o: Partial<Reenvio>) => puedeReenviarPlanilla({ ...devuelta, ...o })

test('la corrección se envía solo con la planilla devuelta y el conjunto completo y bien formado', () => {
  assert.equal(reenvio({}).ok, true)
  assert.equal(reenvio({ estado: 'revision' }).ok, true)
  assert.equal(reenvio({ planillaEstado: 'pendiente' }).ok, false, 'si no está devuelta no hay nada que enviar')
  assert.equal(reenvio({ planillaEstado: 'aprobada' }).ok, false)
  assert.equal(reenvio({ estado: 'aprobado' }).ok, false)
  assert.equal(reenvio({ estado: 'borrador' }).ok, false, 'en borrador se reenvía el informe, no la planilla')
})

test('sin planilla, sin soporte o con el número vacío o muy corto no se envía, y el mensaje dice qué falta', () => {
  const sinPlanilla = reenvio({ tienePlanilla: false }); assert.ok(!sinPlanilla.ok && /planilla de seguridad social/.test(sinPlanilla.error))
  const sinSoporte = reenvio({ tieneSoporte: false }); assert.ok(!sinSoporte.ok && /soporte del pago/.test(sinSoporte.error))
  for (const numeroPlanilla of ['', '   ', null, undefined, '123']) {
    const r = reenvio({ numeroPlanilla }); assert.ok(!r.ok && /número de planilla/.test(r.error), String(numeroPlanilla))
  }
})

test('solo la contratista (o el administrador) envía la corrección', () => {
  for (const rol of ['supervisor', 'asesor', null, undefined]) assert.equal(reenvio({ rol }).ok, false, String(rol))
  assert.equal(reenvio({ rol: 'admin' }).ok, true)
})

test('solo se registra la dirección de un archivo de planilla de ESTE periodo', () => {
  const P = '6f0b8a5e-0000-4000-8000-123456789abc', OTRO = '11111111-0000-4000-8000-123456789abc'
  const sitio = 'https://x.supabase.co/storage/v1/object/public/documentos'
  assert.equal(esUrlDePlanilla(P, `${sitio}/planillas/${P}/1792400000000.pdf`), true)
  assert.equal(esUrlDePlanilla(P, `${sitio}/planillas/${P}/1792400000000.pdf?token=abc`), true)
  assert.equal(esUrlDePlanilla(P, `${sitio}/planillas/${OTRO}/1792400000000.pdf`), false, 'de otro periodo')
  assert.equal(esUrlDePlanilla(P, `${sitio}/planillas/${P}/../${OTRO}/1.pdf`), false, 'con salto de carpeta')
  assert.equal(esUrlDePlanilla(P, `${sitio}/planillas/${P}/1792400000000.exe`), false, 'no es PDF')
  assert.equal(esUrlDePlanilla(P, `${sitio}/soportes/${P}/1792400000000.pdf`), false, 'otra carpeta')
  assert.equal(esUrlDePlanilla(P, 'https://malo.example/otro.pdf'), false)
  for (const v of ['', null, undefined, 42, {}]) assert.equal(esUrlDePlanilla(P, v), false, String(v))
  assert.equal(esUrlDePlanilla('', `${sitio}/planillas//1.pdf`), false)
})
