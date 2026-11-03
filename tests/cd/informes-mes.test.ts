import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mesDeApertura, mesVecino, pendienteDeRevisar, separarInformesDelMes } from '@/lib/informes-mes'
import type { Periodo } from '@/lib/types'

const p = (id: string, estado: string, extra: Record<string, unknown> = {}) =>
  ({ id, estado, es_historico: false, fecha_envio: null, contrato_id: `c-${id}`, contrato: { dependencia_id: 'dep-1' }, ...extra }) as unknown as Periodo

test('las dos listas salen de una misma consulta: presentados y borradores', () => {
  const r = separarInformesDelMes([
    p('a', 'borrador'), p('b', 'enviado', { fecha_envio: '2026-10-20' }), p('c', 'aprobado', { fecha_envio: '2026-10-18' }),
    p('d', 'radicado', { fecha_envio: '2026-10-10' }), p('e', 'rechazado', { fecha_envio: '2026-10-22' }),
  ])
  // `informePresentado`: todo menos borrador y anulado; un informe devuelto (rechazado) sigue siendo un informe presentado.
  assert.deepEqual(r.periodos.map(x => x.id), ['d', 'c', 'b', 'e'], 'presentados, del envío más antiguo al más reciente')
  assert.deepEqual(r.borradores.map(x => x.id), ['a'])
})

test('un histórico se muestra aunque sea borrador, pero no cuenta como «sin enviar»', () => {
  const r = separarInformesDelMes([p('h', 'borrador', { es_historico: true }), p('n', 'borrador')])
  assert.deepEqual(r.periodos.map(x => x.id), ['h'])
  assert.deepEqual(r.borradores.map(x => x.id), ['n'])
})

test('los que no tienen fecha de envío van al final, como los ordena la base', () => {
  const r = separarInformesDelMes([
    p('sin', 'aprobado', { es_historico: true }), p('tarde', 'enviado', { fecha_envio: '2026-10-25' }), p('pronto', 'enviado', { fecha_envio: '2026-10-02' }),
  ])
  assert.deepEqual(r.periodos.map(x => x.id), ['pronto', 'tarde', 'sin'])
})

test('el asesor solo ve su dependencia, en las dos listas', () => {
  const otra = { contrato: { dependencia_id: 'dep-2' } }
  const r = separarInformesDelMes(
    [p('a', 'enviado', { fecha_envio: '2026-10-02' }), p('b', 'enviado', { ...otra, fecha_envio: '2026-10-03' }), p('c', 'borrador'), p('d', 'borrador', otra)],
    'dep-1',
  )
  assert.deepEqual(r.periodos.map(x => x.id), ['a'])
  assert.deepEqual(r.borradores.map(x => x.id), ['c'])
})

test('los borradores van ordenados por contrato', () => {
  const r = separarInformesDelMes([p('x', 'borrador', { contrato_id: 'c-9' }), p('y', 'borrador', { contrato_id: 'c-1' })])
  assert.deepEqual(r.borradores.map(x => x.id), ['y', 'x'])
})

test('el mes vecino cruza el año hacia atrás y hacia adelante', () => {
  assert.deepEqual(mesVecino(9, 2026, -1), { mesIdx: 8, anio: 2026 })
  assert.deepEqual(mesVecino(0, 2026, -1), { mesIdx: 11, anio: 2025 })
  assert.deepEqual(mesVecino(11, 2026, 1), { mesIdx: 0, anio: 2027 })
  assert.deepEqual(mesVecino(5, 2026, 0), { mesIdx: 5, anio: 2026 })
})

test('abre en el mes anterior mientras tenga algo por revisar o por radicar; si está al día, en el mes en curso', () => {
  const hoy = new Date(2026, 10, 3) // 3 de noviembre
  assert.deepEqual(mesDeApertura(hoy, true), { mesIdx: 9, anio: 2026, esAnterior: true })
  assert.deepEqual(mesDeApertura(hoy, false), { mesIdx: 10, anio: 2026, esAnterior: false })
  // En enero, el anterior es diciembre del año pasado.
  assert.deepEqual(mesDeApertura(new Date(2027, 0, 5), true), { mesIdx: 11, anio: 2026, esAnterior: true })
})

test('pendiente es lo enviado, en revisión o aprobado sin radicar; nunca lo histórico, radicado, devuelto o borrador', () => {
  assert.deepEqual(
    ['enviado', 'revision', 'aprobado', 'radicado', 'rechazado', 'borrador'].map(e => pendienteDeRevisar(p('x', e))),
    [true, true, true, false, false, false],
  )
  assert.equal(pendienteDeRevisar(p('h', 'aprobado', { es_historico: true })), false)
})
