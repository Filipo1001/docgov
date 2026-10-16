import assert from 'node:assert/strict'
import { test } from 'node:test'
import { letreroVisible, RETARDO_LETRERO_MS } from '../../lib/panel-documentos'

const TEXTO = 'La planilla PILA del mes…'

test('sin menú abierto y con el cursor en la celda, sale el letrero', () => {
  assert.equal(letreroVisible({ activo: TEXTO, menuAbierto: null, sobreAcciones: false }), TEXTO)
})

test('con un menú abierto no hay letrero: nunca puede tapar «Eliminar»', () => {
  assert.equal(letreroVisible({ activo: TEXTO, menuAbierto: 'Planilla', sobreAcciones: false }), null)
  assert.equal(letreroVisible({ activo: TEXTO, menuAbierto: 'Planilla', sobreAcciones: true }), null)
})

test('el menú de una celda también calla el letrero de otra', () => {
  // El menú de la planilla abierto y el cursor pasa por el soporte: sigue sin letrero.
  assert.equal(letreroVisible({ activo: 'texto del soporte', menuAbierto: 'Planilla', sobreAcciones: false }), null)
})

test('con el cursor sobre los tres puntitos tampoco sale: se va a pulsar, no a leer', () => {
  assert.equal(letreroVisible({ activo: TEXTO, menuAbierto: null, sobreAcciones: true }), null)
})

test('sin celda activa no hay letrero', () => {
  assert.equal(letreroVisible({ activo: null, menuAbierto: null, sobreAcciones: false }), null)
})

test('el letrero espera un instante, pero no tanto que parezca que no existe', () => {
  assert.ok(RETARDO_LETRERO_MS >= 200 && RETARDO_LETRERO_MS <= 600, String(RETARDO_LETRERO_MS))
})
