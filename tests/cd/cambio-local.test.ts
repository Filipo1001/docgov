import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lecturaVigente } from '../../lib/cambio-local'

test('una lectura lanzada ANTES del cambio local se descarta: traería el estado de antes', () => {
  assert.equal(lecturaVigente(1000, 1500), false)
})

test('una lectura lanzada DESPUÉS del cambio local vale: es la que confirma', () => {
  assert.equal(lecturaVigente(1600, 1500), true)
})

test('sin cambios locales (marca 0) toda lectura vale', () => {
  assert.equal(lecturaVigente(1, 0), true)
  assert.equal(lecturaVigente(0, 0), true)
})

test('en el mismo instante vale: la que se lanza justo al cambiar es la de confirmación', () => {
  assert.equal(lecturaVigente(1500, 1500), true)
})
