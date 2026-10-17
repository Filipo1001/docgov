import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conPesos, corregirDePesos, numeroALetras, numerosALetras, pesosEnLetras } from '../../lib/numero-letras'

test('«DE PESOS» solo cuando el valor termina en millón o millones', () => {
  // El caso que vio Felipe en el acta de supervisión del contrato 230 de 2026.
  assert.equal(pesosEnLetras(8_000_000), 'OCHO MILLONES DE PESOS')
  assert.equal(pesosEnLetras(1_000_000), 'UN MILLÓN DE PESOS')
  assert.equal(pesosEnLetras(1_200_000_000), 'MIL DOSCIENTOS MILLONES DE PESOS')
  // Y el contrario, que escribían la cuenta de cobro y el acta de pago.
  assert.equal(pesosEnLetras(3_500_000), 'TRES MILLONES QUINIENTOS MIL PESOS')
  assert.equal(pesosEnLetras(1_750_905), 'UN MILLÓN SETECIENTOS CINCUENTA MIL NOVECIENTOS CINCO PESOS')
  assert.equal(pesosEnLetras(500_000), 'QUINIENTOS MIL PESOS')
})

test('«uno» se apocopa ante mil, millones y pesos', () => {
  assert.equal(numeroALetras(21_000), 'VEINTIÚN MIL')
  assert.equal(numeroALetras(31_000_000), 'TREINTA Y UN MILLONES')
  assert.equal(numeroALetras(101_000), 'CIENTO UN MIL')
  assert.equal(numeroALetras(21_031_000), 'VEINTIÚN MILLONES TREINTA Y UN MIL')
  assert.equal(pesosEnLetras(1_001), 'MIL UN PESOS')
  assert.equal(pesosEnLetras(1_000_001), 'UN MILLÓN UN PESOS')
  assert.equal(numeroALetras(31), 'TREINTA Y UN')
  // Once no es «uno»: no se toca.
  assert.equal(numeroALetras(11_000), 'ONCE MIL')
})

test('tildes también en mayúscula', () => {
  assert.equal(numeroALetras(16), 'DIECISÉIS')
  assert.equal(numeroALetras(22), 'VEINTIDÓS')
  assert.equal(numeroALetras(23), 'VEINTITRÉS')
  assert.equal(numeroALetras(26), 'VEINTISÉIS')
  assert.equal(numeroALetras(1_000_000), 'UN MILLÓN')
})

test('cien y ciento, y los valores que más se repiten en los contratos', () => {
  assert.equal(numeroALetras(100), 'CIEN')
  assert.equal(numeroALetras(100_000), 'CIEN MIL')
  assert.equal(numeroALetras(150), 'CIENTO CINCUENTA')
  assert.equal(numeroALetras(2_483_871), 'DOS MILLONES CUATROCIENTOS OCHENTA Y TRES MIL OCHOCIENTOS SETENTA Y UN')
  assert.equal(numeroALetras(0), 'CERO')
  assert.equal(numeroALetras(-5), 'MENOS CINCO')
})

test('conPesos rehace un «PESOS» que ya venga en el texto', () => {
  assert.equal(conPesos('OCHO MILLONES PESOS'), 'OCHO MILLONES DE PESOS')
  assert.equal(conPesos('TRES MILLONES QUINIENTOS MIL DE PESOS'), 'TRES MILLONES QUINIENTOS MIL PESOS')
  assert.equal(conPesos('UN MILLON'), 'UN MILLON DE PESOS')
})

test('corregirDePesos arregla las letras ya guardadas sin tocar el resto', () => {
  assert.equal(corregirDePesos('OCHO MILLONES PESOS M/CTE'), 'OCHO MILLONES DE PESOS M/CTE')
  assert.equal(corregirDePesos('TRES MILLONES QUINIENTOS MIL DE PESOS M/L'), 'TRES MILLONES QUINIENTOS MIL PESOS M/L')
  assert.equal(corregirDePesos('OCHO MILLONES DE PESOS M/CTE'), 'OCHO MILLONES DE PESOS M/CTE')
  assert.equal(corregirDePesos('CUARENTA MILLONES (40.000.000)'), 'CUARENTA MILLONES (40.000.000)')
})

test('el texto que se guarda en el contrato', () => {
  assert.equal(numerosALetras(8_000_000), 'OCHO MILLONES DE PESOS M/CTE')
  assert.equal(numerosALetras(4_500_000), 'CUATRO MILLONES QUINIENTOS MIL PESOS M/CTE')
  assert.equal(numerosALetras(0), '')
})
