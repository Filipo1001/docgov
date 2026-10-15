import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adicionDeOtrosies, valorVigenteDelContrato } from '../../lib/plan-pagos'

// Casos tomados de la base real el 15-oct-2026: (valor_total guardado, valor añadido por el otrosí, suma de los periodos).
// Con el otrosí contado, la diferencia es 0 en todos.
const REALES: Array<[string, number, number, number]> = [
  ['002', 49_600_000, 24_800_000, 74_400_000],
  ['003', 48_800_000, 24_400_000, 73_200_000],
  ['004', 24_000_000, 12_000_000, 36_000_000],
  ['022', 24_000_000, 9_000_000, 33_000_000],
  ['025', 22_720_000, 8_520_000, 31_240_000],
  ['026', 19_200_000, 7_200_000, 26_400_000],
  ['027', 22_400_000, 8_400_000, 30_800_000],
  ['045', 32_000_000, 8_000_000, 40_000_000],
  ['057', 20_000_000, 5_000_000, 25_000_000],
  ['073', 32_000_000, 8_000_000, 40_000_000],
  ['137', 25_600_000, 6_400_000, 32_000_000],
]

test('los contratos reales con otrosí cuadran con su valor vigente', () => {
  for (const [numero, total, adicion, suma] of REALES) {
    assert.equal(valorVigenteDelContrato(total, [{ valor_adicion: adicion }]) - suma, 0, `contrato ${numero}`)
  }
})

test('una prórroga sin valor no cambia el total (contrato 134)', () => {
  assert.equal(valorVigenteDelContrato(32_000_000, [{ valor_adicion: 0 }]), 32_000_000)
})

test('un contrato sin otrosíes queda igual', () => {
  assert.equal(valorVigenteDelContrato(10_000_000, []), 10_000_000)
  assert.equal(adicionDeOtrosies([]), 0)
})

test('varios otrosíes se suman, aplicados o no; los números pueden llegar como texto', () => {
  assert.equal(valorVigenteDelContrato('10000000.00', [{ valor_adicion: '2000000' }, { valor_adicion: 500_000 }]), 12_500_000)
  assert.equal(adicionDeOtrosies([{ valor_adicion: '2000000' }, { valor_adicion: 500_000 }]), 2_500_000)
})

test('lo que falta o viene vacío cuenta como cero, sin NaN', () => {
  assert.equal(valorVigenteDelContrato(null, [{ valor_adicion: null }, {}]), 0)
  assert.equal(valorVigenteDelContrato(undefined, [{ valor_adicion: 'abc' }]), 0)
})

test('un otrosí que añade valor sin plazo deja una diferencia positiva: falta repartirlo (contrato 023)', () => {
  const suma = 40_000_000
  assert.equal(valorVigenteDelContrato(40_000_000, [{ valor_adicion: 11_200_000 }]) - suma, 11_200_000)
})
