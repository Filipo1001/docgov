import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  diasEntre, esLunes, fechaMasDias, mensajeCampana, paraDestinatario, repartirVencimientos, totalVencimientos,
  ventanasSemana, type ContratoPorVencer,
} from '@/lib/vencimientos'

const c = (numero: string, fechaFin: string, supervisorId: string | null = 's1'): ContratoPorVencer =>
  ({ numero, contratista: `Persona ${numero}`, fechaFin, supervisorId })

test('los lunes son lunes, y el resto de la semana no', () => {
  assert.equal(esLunes('2026-11-02'), true)
  assert.equal(esLunes('2026-11-01'), false, 'domingo')
  assert.equal(esLunes('2026-11-03'), false)
})

test('las ventanas de lunes consecutivos no se solapan ni dejan huecos: cada contrato cae una vez en cada una', () => {
  // Todos los lunes de un año; cada día de fin posible debe caer en la ventana de 60 exactamente una vez, y en la de 30 igual.
  let lunes = '2026-11-02'
  const cuenta60 = new Map<string, number>()
  const cuenta30 = new Map<string, number>()
  for (let semana = 0; semana < 40; semana++) {
    const v = ventanasSemana(lunes)
    for (let d = 0; d < 7; d++) {
      const f60 = fechaMasDias(v.en60.desde, d); cuenta60.set(f60, (cuenta60.get(f60) ?? 0) + 1)
      const f30 = fechaMasDias(v.en30.desde, d); cuenta30.set(f30, (cuenta30.get(f30) ?? 0) + 1)
    }
    lunes = fechaMasDias(lunes, 7)
  }
  assert.ok([...cuenta60.values()].every(n => n === 1), 'la ventana de 60 no repite ni deja huecos')
  assert.ok([...cuenta30.values()].every(n => n === 1), 'la ventana de 30 no repite ni deja huecos')
})

test('el lunes 30-nov entra el 30-dic en la ventana de 30; el 7-dic, el 31-dic', () => {
  const ventana = (hoy: string) => repartirVencimientos([c('A', '2026-12-30'), c('B', '2026-12-31')], hoy)
  assert.deepEqual(ventana('2026-11-30').en30.map(f => f.numero), ['A'])
  assert.deepEqual(ventana('2026-12-07').en30.map(f => f.numero), ['B'])
  assert.equal(ventana('2026-12-07').en30[0].dias, 24, 'dice los días que de verdad quedan, no 30')
})

test('lo que el correo por contrato ya avisó no se repite; sí lo que aún no', () => {
  // Lunes 2-nov: el 30 y el 31 de diciembre ya recibieron su aviso de 60 días el 31-oct y el 1-nov.
  const ya = new Set(['A|60', 'B|60'])
  const r = repartirVencimientos([c('A', '2026-12-30'), c('B', '2026-12-31'), c('C', '2027-01-01')], '2026-11-02', ya)
  assert.deepEqual(r.en60.map(f => f.numero), ['C'])
  assert.equal(totalVencimientos(r), 1)
})

test('un contrato con avisos de 60 pero sin el de 30 sí entra en la ventana de 30', () => {
  const r = repartirVencimientos([c('A', '2026-12-15')], '2026-11-16', new Set(['A|60']))
  assert.deepEqual(r.en30.map(f => f.numero), ['A'])
})

test('un secretario ve solo sus contratos; administración y contratación ven todos', () => {
  const todos = [c('A', '2026-12-15', 's1'), c('B', '2026-12-15', 's2'), c('C', '2026-12-15', null)]
  assert.deepEqual(paraDestinatario(todos, 's1', false).map(x => x.numero), ['A'])
  assert.deepEqual(paraDestinatario(todos, 'admin', true).map(x => x.numero), ['A', 'B', 'C'])
  assert.deepEqual(paraDestinatario(todos, 's9', false), [], 'sin contratos suyos no hay correo')
})

test('las filas salen ordenadas por fecha y luego por número', () => {
  const r = repartirVencimientos([c('10', '2026-12-16'), c('9', '2026-12-16'), c('2', '2026-12-15')], '2026-11-16')
  assert.deepEqual(r.en30.map(f => f.numero), ['2', '9', '10'])
})

test('días entre fechas y el texto de la campana', () => {
  assert.equal(diasEntre('2026-11-02', '2026-12-31'), 59)
  assert.equal(diasEntre('2026-12-31', '2026-12-31'), 0)
  const r = repartirVencimientos([c('A', '2026-12-15'), c('B', '2026-12-16'), c('C', '2027-01-04')], '2026-11-16')
  assert.match(mensajeCampana(r), /^2 vencen en 30 días o menos/)
  assert.match(mensajeCampana({ en30: [], en60: [r.en30[0]] }), /^1 vence en unos 60 días/)
})
