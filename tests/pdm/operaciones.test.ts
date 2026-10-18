import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  describirOperacion, errorEnMotivoDeshacer, familiaDeOperacion, listaDePersonas, operacionDeFila, MIN_MOTIVO_DESHACER,
  type OperacionPdm,
} from '@/lib/pdm/operaciones'

const base: OperacionPdm = {
  lote: '11111111-1111-4111-8111-111111111111', operacion: 'asignar_principal', quien: 'Felipe', cuando: '2026-10-18T15:00:00Z',
  motivo: null, filas: 3, indicadores: 3, personas: ['ANA MARÍA PÉREZ'], grupo: null, nivel: null, deshace: null, operacionOriginal: null,
  estado: 'se_puede', razon: null,
}
const con = (p: Partial<OperacionPdm>): OperacionPdm => ({ ...base, ...p })

test('cada operación se dice como a una persona, con el singular y el plural que toca', () => {
  assert.equal(describirOperacion(base), 'Ana María Pérez quedó como responsable principal en 3 indicadores')
  assert.equal(describirOperacion(con({ indicadores: 1 })), 'Ana María Pérez quedó como responsable principal en 1 indicador')
  assert.equal(describirOperacion(con({ operacion: 'asignar_apoyo' })), 'Ana María Pérez entró como apoyo en 3 indicadores')
  assert.equal(describirOperacion(con({ operacion: 'quitar_apoyo', indicadores: 2 })), 'Se quitó a Ana María Pérez de 2 indicadores')
  assert.equal(describirOperacion(con({ operacion: 'quitar' })), 'Se quitó a Ana María Pérez de 3 indicadores')
  assert.equal(describirOperacion(con({ operacion: 'asignar_grupo', grupo: 'Equipo social' })), 'El grupo «Equipo social» se asignó a 3 indicadores')
  assert.equal(describirOperacion(con({ operacion: 'grupo_crear', grupo: 'Equipo social' })), 'Se creó el grupo «Equipo social»')
  assert.equal(describirOperacion(con({ operacion: 'grupo_editar', grupo: 'Equipo social' })), 'Se editó el grupo «Equipo social»')
  assert.equal(describirOperacion(con({ operacion: 'grupo_eliminar', grupo: 'Equipo social' })), 'Se eliminó el grupo «Equipo social»')
  assert.equal(describirOperacion(con({ operacion: 'habilitar', nivel: 'coordinador' })), 'Se dio acceso a Ana María Pérez como secretaría')
  assert.equal(describirOperacion(con({ operacion: 'habilitar', nivel: 'consulta' })), 'Se dio acceso a Ana María Pérez como consulta')
  assert.equal(describirOperacion(con({ operacion: 'habilitar', nivel: null })), 'Se cambió el acceso de Ana María Pérez')
  assert.equal(describirOperacion(con({ operacion: 'deshabilitar' })), 'Se quitó el acceso a Ana María Pérez')
})

test('un grupo sin nombre no deja una frase rota', () => {
  assert.equal(describirOperacion(con({ operacion: 'grupo_crear', grupo: null })), 'Se creó el grupo sin nombre')
})

test('una reversión dice qué deshizo, si la operación está a la vista, y si no, lo dice en general', () => {
  const rev = con({ operacion: 'deshacer', deshace: base.lote, operacionOriginal: 'asignar_principal', personas: [] })
  assert.equal(describirOperacion(rev, base), 'Se deshizo: Ana María Pérez quedó como responsable principal en 3 indicadores')
  assert.equal(describirOperacion(rev, null), 'Se deshizo una operación anterior (reparto)')
  assert.equal(describirOperacion(con({ operacion: 'deshacer', personas: [] }), null), 'Se deshizo una operación anterior')
})

test('las personas de una operación: una, dos o varias', () => {
  assert.equal(listaDePersonas([]), 'Alguien')
  assert.equal(listaDePersonas(['ANA PÉREZ']), 'Ana Pérez')
  assert.equal(listaDePersonas(['ANA PÉREZ', 'LUIS GÓMEZ']), 'Ana Pérez y Luis Gómez')
  assert.equal(listaDePersonas(['ANA PÉREZ', 'LUIS GÓMEZ', 'SARA RÍOS', 'JUAN DÍAZ']), 'Ana Pérez, Luis Gómez y 2 más')
})

test('la familia de cada operación, para el rótulo', () => {
  assert.equal(familiaDeOperacion('asignar_grupo'), 'Reparto')
  assert.equal(familiaDeOperacion('grupo_eliminar'), 'Grupo')
  assert.equal(familiaDeOperacion('deshabilitar'), 'Acceso')
  assert.equal(familiaDeOperacion('deshacer'), 'Reversión')
  assert.equal(familiaDeOperacion('otra_cosa'), 'Cambio')
})

test('el motivo de deshacer: obligatorio, con un mínimo y un tope', () => {
  assert.ok(errorEnMotivoDeshacer(undefined))
  assert.ok(errorEnMotivoDeshacer(''))
  assert.ok(errorEnMotivoDeshacer('   '))
  assert.ok(errorEnMotivoDeshacer('corto'))
  assert.ok(errorEnMotivoDeshacer('x'.repeat(MIN_MOTIVO_DESHACER - 1)))
  assert.equal(errorEnMotivoDeshacer('x'.repeat(MIN_MOTIVO_DESHACER)), null)
  assert.equal(errorEnMotivoDeshacer('  Se asignó a la persona equivocada.  '), null)
  assert.ok(errorEnMotivoDeshacer('x'.repeat(501)))
  assert.ok(errorEnMotivoDeshacer(12345 as unknown))
})

test('una fila de pdm_operaciones se convierte en operación; lo que no tiene sentido, no', () => {
  const fila = {
    lote: base.lote, operacion: 'asignar_principal', actor_nombre: 'Felipe', creado: '2026-10-18T15:00:00Z', motivo: 'Reparto de octubre', filas: 3,
    resumen: { indicadores: 3, personas: ['ANA MARÍA PÉREZ', '', 5], grupo: null, nivel: null }, deshace: null, estado: 'se_puede', razon: null,
  }
  const op = operacionDeFila(fila)
  assert.ok(op)
  assert.equal(op.lote, base.lote)
  assert.equal(op.indicadores, 3)
  assert.deepEqual(op.personas, ['ANA MARÍA PÉREZ'])
  assert.equal(op.motivo, 'Reparto de octubre')
  assert.equal(op.estado, 'se_puede')
  assert.equal(operacionDeFila({ ...fila, estado: 'rara' }), null)
  assert.equal(operacionDeFila({ ...fila, lote: '' }), null)
  assert.equal(operacionDeFila(null), null)
  assert.equal(operacionDeFila('texto'), null)
  // Sin resumen no se rompe.
  assert.equal(operacionDeFila({ ...fila, resumen: null })?.indicadores, 0)
  const rev = operacionDeFila({ ...fila, operacion: 'deshacer', deshace: base.lote, resumen: { operacion_original: 'asignar_principal' }, estado: 'bloqueada', razon: 'Ya cambió.' })
  assert.equal(rev?.deshace, base.lote)
  assert.equal(rev?.operacionOriginal, 'asignar_principal')
  assert.equal(rev?.razon, 'Ya cambió.')
})
