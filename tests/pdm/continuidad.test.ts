/** Quién responde como principal y se queda sin contrato antes de que termine el plan (ver `lib/pdm/continuidad.ts`). */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { responsablesEnRiesgo, resumirRiesgo } from '@/lib/pdm/continuidad'
import type { ContratoResumen, EstadoContrato } from '@/lib/pdm/contrato'
import type { Indicador } from '@/lib/pdm/plan'
import type { PersonaDirectorio } from '@/lib/pdm/personas'

const contrato = (estado: EstadoContrato, fin: string | null = null): ContratoResumen =>
  ({ estado, numero: fin ? '12' : null, anio: 2026, fin, dias: null, enFecha: estado === 'en_fecha' ? 1 : 0, total: 1 })
const persona = (id: string, nombre: string, c: ContratoResumen): PersonaDirectorio =>
  ({ id, nombre, rol: 'contratista', fotoUrl: null, secretaria: 'S', contrato: c, excel: null, indicadores: 0, resumen: null, acceso: null })
const ind = (id: number, asignados: [string, boolean][]): Indicador => ({
  id, uuid: `u${id}`, codigo: 'C', linea: 'L', sector: 'S', programa: 'P', producto: 'X', indicador: 'I', unidad: 'n', dependencia: 'S',
  responsable: '', asignados: asignados.map(([u, p]) => ({ usuarioId: u, principal: p, grupoId: null })),
  lineaBase: 0, metaCuatrienio: 1, anios: [], anio: 2026, meta: 1, avance: null, enAnio: null,
})

const FIN = '2027-12-31'
const P = [
  persona('vencida', 'Ana Vencida', contrato('vencido', '2026-09-30')),
  persona('sin', 'Beto Sin Contrato', contrato('sin_contrato')),
  persona('dic', 'Carla Diciembre', contrato('en_fecha', '2026-12-31')),
  persona('largo', 'Dora Largo', contrato('en_fecha', '2028-01-15')),
  persona('planta', 'Eva Planta', contrato('planta')),
  persona('otra', 'Fabio Otra Secretaría', contrato('desconocido')),
  persona('apoyo', 'Gina Solo Apoyo', contrato('vencido', '2026-01-31')),
]
const L = [
  ind(1, [['vencida', true], ['apoyo', false]]), ind(2, [['vencida', true]]),
  ind(3, [['sin', true]]), ind(4, [['dic', true]]), ind(5, [['largo', true]]),
  ind(6, [['planta', true]]), ind(7, [['otra', true]]),
]

test('solo principales sin contrato o con uno que termina antes de que acabe el plan', () => {
  const r = responsablesEnRiesgo(P, L, FIN)
  assert.deepEqual(r.map(x => [x.persona.id, x.motivo, x.principal]), [
    ['vencida', 'sin_contrato', 2], ['sin', 'sin_contrato', 1], ['dic', 'termina_antes', 1],
  ])
})

test('no entran: planta, contrato que no se puede ver, contrato que cubre el plan, ni quien solo apoya', () => {
  const ids = responsablesEnRiesgo(P, L, FIN).map(x => x.persona.id)
  for (const fuera of ['largo', 'planta', 'otra', 'apoyo']) assert.ok(!ids.includes(fuera), fuera)
})

test('el resumen cuenta personas e indicadores por motivo', () => {
  assert.deepEqual(resumirRiesgo(responsablesEnRiesgo(P, L, FIN)), {
    sin_contrato: { personas: 2, indicadores: 3 }, termina_antes: { personas: 1, indicadores: 1 },
  })
  assert.deepEqual(responsablesEnRiesgo([], L, FIN), [])
  assert.deepEqual(responsablesEnRiesgo(P, [], FIN), [])
})
