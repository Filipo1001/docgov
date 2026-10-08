import assert from 'node:assert/strict'
import {
  aniosIniciados, cuentaDeAnio, cuentasPorAnio, cumplimientoDe, rotuloDeAnios,
} from '@/lib/pdm/graficos'
import type { AnioDeIndicador, Indicador } from '@/lib/pdm/plan'
import { ANIOS_PLAN, type SituacionAnio } from '@/lib/pdm/seguimiento'

let n = 0
const ok = (t: string, f: () => void) => { f(); n++; console.log('  ✓', t) }

type Spec = { meta: number | null; avance?: number | null; s?: SituacionAnio | null }
function ind(id: number, specs: Partial<Record<number, Spec>>, asignado = true): Indicador {
  const anios: AnioDeIndicador[] = ANIOS_PLAN.map(a => {
    const sp = specs[a]
    return { anio: a, meta: sp?.meta ?? null, avance: sp?.avance ?? null, enAnio: sp?.s ? { situacion: sp.s, reporte: null } : null }
  })
  const v = anios.find(a => a.anio === 2026)!
  return {
    id, uuid: `u${id}`, codigo: `C${id}`, linea: 'L', sector: 'S', programa: 'P', producto: 'X', indicador: `I${id}`, unidad: 'n',
    dependencia: 'D', responsable: '', asignados: asignado ? [{ usuarioId: 'x', principal: true, grupoId: null }] : [],
    lineaBase: 0, metaCuatrienio: 10, anios, anio: 2026, meta: v.meta, avance: v.avance, enAnio: v.enAnio,
  }
}
const HOY = 2026

console.log('el cumplimiento, en tres tramos')
ok('cumplidos, parciales y sin avance suman SIEMPRE el total (datos al azar, cualquier año actual)', () => {
  let semilla = 11
  const r = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647
  const estados: (SituacionAnio | null)[] = ['aprobado', 'pendiente', 'devuelto', 'falta', null]
  const l = Array.from({ length: 400 }, (_, k) => ind(k, Object.fromEntries(ANIOS_PLAN.map(a => {
    const meta = r() < 0.15 ? 0 : Math.floor(r() * 20) + 1
    const s = estados[Math.floor(r() * 5)]
    const avance = r() < 0.3 ? null : Math.floor(r() * meta * 1.6)   // incluye 0, parcial, exacto y pasado
    return [a, { meta, avance, s }]
  })), r() < 0.9))
  for (const hoy of [2024, 2025, 2026, 2027]) {
    const cs = cuentasPorAnio(l, hoy)
    const t = cumplimientoDe(cs)
    assert.equal(t.cumplidos + t.parciales + t.sinAvance, t.total, `hoy ${hoy}`)
    assert.ok(t.sinAvance >= 0 && t.parciales >= 0)
    for (const a of aniosIniciados(hoy)) {
      const u = cumplimientoDe(cs, [a])
      assert.equal(u.cumplidos + u.parciales + u.sinAvance, u.total)
    }
    // sumar año por año da lo mismo que pedir los años juntos
    const porSeparado = aniosIniciados(hoy).map(a => cumplimientoDe(cs, [a]))
    assert.equal(porSeparado.reduce((x, c) => x + c.total, 0), t.total)
    assert.equal(porSeparado.reduce((x, c) => x + c.cumplidos, 0), t.cumplidos)
  }
})
ok('el reparto de un caso a mano: llegó, quedó a medias, en cero y sin reportar', () => {
  const l = [
    ind(1, { 2026: { meta: 10, avance: 10, s: 'aprobado' } }),   // cumplido
    ind(2, { 2026: { meta: 10, avance: 15, s: 'aprobado' } }),   // pasó la meta: cumplido
    ind(3, { 2026: { meta: 10, avance: 4, s: 'aprobado' } }),    // parcial
    ind(4, { 2026: { meta: 10, avance: 0, s: 'aprobado' } }),    // aprobado con 0: sin avance
    ind(5, { 2026: { meta: 10, s: 'pendiente' } }),              // sin avance validado
    ind(6, { 2026: { meta: 10 } }, false),                       // sin responsable
    ind(7, { 2026: { meta: 0 } }),                               // sin meta: fuera
  ]
  const t = cumplimientoDe(cuentasPorAnio(l, HOY), [2026])
  assert.deepEqual([t.total, t.cumplidos, t.parciales, t.sinAvance], [6, 2, 1, 3])
  assert.equal(t.pctCumplido, 100 * 2 / 6)
  assert.equal(t.sinResponsable, 1); assert.equal(t.porValidar, 1)
})
ok('sin un solo avance validado el porcentaje no se puede decir (no es 0)', () => {
  const l = [ind(1, { 2026: { meta: 5, s: 'pendiente' } }), ind(2, { 2026: { meta: 5, s: 'falta' } })]
  const t = cumplimientoDe(cuentasPorAnio(l, HOY), [2026])
  assert.equal(t.pctCumplido, null); assert.equal(t.sinAvance, 2)
})
ok('varios años: cada meta anual cuenta una vez, contra su propia meta', () => {
  const l = [ind(1, { 2025: { meta: 4, avance: 4, s: 'aprobado' }, 2026: { meta: 9, avance: 3, s: 'aprobado' } })]
  const cs = cuentasPorAnio(l, HOY)
  const t = cumplimientoDe(cs, [2025, 2026])
  assert.deepEqual([t.total, t.cumplidos, t.parciales], [2, 1, 1])
  assert.deepEqual(t.anios, [2025, 2026])
})
ok('un año que no ha empezado nunca entra, aunque se pida', () => {
  const l = [ind(1, { 2026: { meta: 5, avance: 5, s: 'aprobado' }, 2027: { meta: 5, s: 'falta' } })]
  const t = cumplimientoDe(cuentasPorAnio(l, HOY), [2026, 2027])
  assert.deepEqual(t.anios, [2026]); assert.equal(t.total, 1)
  assert.deepEqual(cumplimientoDe(cuentasPorAnio(l, HOY)).anios, [2024, 2025, 2026])   // «todos»: los que empezaron
})
ok('lista vacía y años pedidos que no existen: todo en cero, sin romperse', () => {
  const t = cumplimientoDe(cuentasPorAnio([], HOY), [2026])
  assert.deepEqual([t.total, t.cumplidos, t.parciales, t.sinAvance, t.pctCumplido], [0, 0, 0, 0, null])
  assert.deepEqual(cumplimientoDe(cuentasPorAnio([], HOY), [1999]).anios, [])
})
ok('el campo nuevo `parciales` no cambia lo que ya se contaba', () => {
  const c = cuentaDeAnio([ind(1, { 2026: { meta: 10, avance: 4, s: 'aprobado' } })], 2026, HOY)
  assert.deepEqual([c.conAvance, c.alcanzaron, c.parciales], [1, 0, 1])
})

console.log('los años, dichos')
ok('rótulos', () => {
  assert.equal(rotuloDeAnios([2026], 2026), '2026')
  assert.equal(rotuloDeAnios([2025, 2024], 2026), '2024 y 2025')
  assert.equal(rotuloDeAnios([2024, 2025, 2026], 2026), 'todos los años')
  assert.equal(rotuloDeAnios([2024, 2025], 2027), '2024 y 2025')
  assert.equal(rotuloDeAnios([2024, 2025, 2026], 2027), '2024 a 2026')
  assert.equal(rotuloDeAnios([2024, 2026], 2027), '2024 y 2026')
  assert.equal(rotuloDeAnios([2024, 2026, 2027], 2027), '2024, 2026 y 2027')
  assert.equal(rotuloDeAnios([2026], 2024 + 2), '2026')
  assert.equal(rotuloDeAnios([], 2026), '')
  assert.deepEqual(aniosIniciados(2025), [2024, 2025]); assert.deepEqual(aniosIniciados(2030), [2024, 2025, 2026, 2027])
})

console.log(`\n${n} pruebas pasaron`)
