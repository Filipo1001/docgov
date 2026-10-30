import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finEfectivo, hoyEnColombia, vigenciaDe, vigenteEntre } from '@/lib/vigencia-contrato'

test('«hoy» es el día en Colombia, no en UTC', () => {
  // 8 p. m. del 20 de octubre en Bogotá = 01:00 del 21 en UTC. Antes la lista ya creía que era el 21.
  assert.equal(hoyEnColombia(new Date('2026-10-21T01:00:00Z')), '2026-10-20')
  assert.equal(hoyEnColombia(new Date('2026-10-21T04:59:59Z')), '2026-10-20')
  assert.equal(hoyEnColombia(new Date('2026-10-21T05:00:00Z')), '2026-10-21')
  assert.equal(hoyEnColombia(new Date('2027-01-01T03:00:00Z')), '2026-12-31', 'fin de año')
})

test('vigente hasta el último día del contrato, incluido', () => {
  const hoy = '2026-10-20'
  assert.equal(vigenciaDe({ fecha_fin: '2026-10-20' }, hoy), 'vigente', 'termina hoy: sigue vigente')
  assert.equal(vigenciaDe({ fecha_fin: '2026-12-31' }, hoy), 'vigente')
  assert.equal(vigenciaDe({ fecha_fin: '2026-10-19' }, hoy), 'vencido', 'terminó ayer')
  assert.equal(vigenciaDe({ fecha_fin: '2026-10-20T00:00:00+00:00' }, hoy), 'vigente', 'con hora, se lee el día')
})

test('lo que alguien cerró antes de tiempo no está vigente; lo suspendido sí', () => {
  const hoy = '2026-10-20'
  for (const estado of ['terminado', 'liquidado', 'cedido']) {
    assert.equal(vigenciaDe({ fecha_fin: '2026-12-31', estado }, hoy), 'vencido', estado)
  }
  assert.equal(vigenciaDe({ fecha_fin: '2026-12-31', estado: 'suspendido' }, hoy), 'vigente')
  assert.equal(vigenciaDe({ fecha_fin: '2026-12-31', estado: 'vigente' }, hoy), 'vigente')
  assert.equal(vigenciaDe({ fecha_fin: '2026-01-31', estado: 'vigente' }, hoy), 'vencido', 'el calendario manda sobre «vigente»')
})

test('sin fecha de terminación no se da por vencido', () => {
  assert.equal(vigenciaDe({ fecha_fin: null }, '2026-10-20'), 'vigente')
})

test('terminado anticipadamente: vigente hasta su último día de ejecución, no hasta la fecha pactada (migración 081)', () => {
  const hoy = '2026-10-20'
  const terminado = (fecha_terminacion: string) =>
    ({ estado: 'terminado', fecha_fin: '2026-12-31', fecha_terminacion, fecha_fin_efectiva: fecha_terminacion })
  assert.equal(vigenciaDe(terminado('2026-10-15'), hoy), 'vencido', 'terminó hace cinco días')
  assert.equal(vigenciaDe(terminado('2026-10-20'), hoy), 'vigente', 'hoy es su último día')
  assert.equal(vigenciaDe(terminado('2026-11-15'), hoy), 'vigente', 'registrada por adelantado: sigue ejecutándose')
  assert.equal(vigenciaDe({ fecha_fin: '2026-12-31', fecha_fin_efectiva: '2026-10-01' }, hoy), 'vencido', 'la efectiva manda sobre la pactada')
  assert.equal(finEfectivo({ fecha_fin: '2026-12-31' }), '2026-12-31')
  assert.equal(finEfectivo({ fecha_fin: '2026-12-31', fecha_terminacion: '2026-10-15' }), '2026-10-15')
})

test('vigente durante un mes: por su fin efectivo, y nunca si no llegó a ejecutarse', () => {
  const octubre = ['2026-10-01', '2026-10-31'] as const
  assert.equal(vigenteEntre({ fecha_inicio: '2026-07-01', fecha_fin: '2026-12-31', fecha_fin_efectiva: '2026-10-15' }, ...octubre), true, 'terminó a mitad de mes: ese mes cuenta')
  assert.equal(vigenteEntre({ fecha_inicio: '2026-07-01', fecha_fin: '2026-12-31', fecha_fin_efectiva: '2026-09-30' }, ...octubre), false, 'terminó antes del mes')
  assert.equal(vigenteEntre({ fecha_inicio: '2026-10-10', fecha_fin: '2026-12-31', fecha_fin_efectiva: '2026-10-09' }, ...octubre), false, 'nunca se ejecutó')
  assert.equal(vigenteEntre({ fecha_inicio: '2026-11-01', fecha_fin: '2026-12-31' }, ...octubre), false, 'todavía no empezaba')
})
