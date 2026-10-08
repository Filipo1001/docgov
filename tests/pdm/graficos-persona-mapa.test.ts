import assert from 'node:assert/strict'
import {
  cuentaDeAnio, cuentasPorPersona, distribucionDeCarga, mapaDeGrupos, serieDelAnio, type CuentaDeAnio,
} from '@/lib/pdm/graficos'
import type { AnioDeIndicador, Indicador } from '@/lib/pdm/plan'
import { ANIOS_PLAN, type SituacionAnio } from '@/lib/pdm/seguimiento'

let n = 0
const ok = (t: string, f: () => void) => { f(); n++; console.log('  ✓', t) }

type Spec = { meta: number | null; avance?: number | null; s?: SituacionAnio | null }
function ind(id: number, dep: string, specs: Partial<Record<number, Spec>>, asignado = true): Indicador {
  const anios: AnioDeIndicador[] = ANIOS_PLAN.map(a => {
    const sp = specs[a]
    return { anio: a, meta: sp?.meta ?? null, avance: sp?.avance ?? null, enAnio: sp?.s ? { situacion: sp.s, reporte: null } : null }
  })
  const v = anios.find(a => a.anio === 2026)!
  return {
    id, uuid: `u${id}`, codigo: `C${id}`, linea: 'L', sector: 'S', programa: 'P', producto: 'X', indicador: `I${id}`, unidad: 'n',
    dependencia: dep, responsable: '', asignados: asignado ? [{ usuarioId: 'x', principal: true, grupoId: null }] : [],
    lineaBase: 0, metaCuatrienio: 10, anios, anio: 2026, meta: v.meta, avance: v.avance, enAnio: v.enAnio,
  }
}
const HOY = 2026
const suma = (c: CuentaDeAnio) => c.aprobados + c.porValidar + c.devueltos + c.faltan + c.sinResponsable
const conAsignados = (i: Indicador, ids: string[]): Indicador => ({ ...i, asignados: ids.map((u, k) => ({ usuarioId: u, principal: k === 0, grupoId: null })) })

console.log('la cuenta de cada persona')
ok('cada persona cuenta lo suyo, de principal o de apoyo, y una sola vez por indicador', () => {
  const a = conAsignados(ind(1, 'A', { 2026: { meta: 5, avance: 5, s: 'aprobado' } }), ['ana', 'beto'])
  const b = conAsignados(ind(2, 'A', { 2026: { meta: 5, s: 'falta' } }), ['ana', 'ana'])   // la misma persona dos veces (directa y por grupo)
  const c = conAsignados(ind(3, 'A', { 2026: { meta: 5, s: 'devuelto' } }), ['beto'])
  const m = cuentasPorPersona([a, b, c], 2026, HOY)
  assert.equal(m.size, 2)
  const ana = m.get('ana')!, beto = m.get('beto')!
  assert.deepEqual([ana.conMeta, ana.aprobados, ana.faltan], [2, 1, 1])
  assert.deepEqual([beto.conMeta, beto.aprobados, beto.devueltos], [2, 1, 1])
  assert.equal(suma(ana), ana.conMeta); assert.equal(suma(beto), beto.conMeta)
})
ok('quien no tiene nada no aparece', () => {
  assert.equal(cuentasPorPersona([ind(1, 'A', { 2026: { meta: 5 } }, false)], 2026, HOY).size, 0)
})

console.log('el mapa')
ok('los cruces suman el total, y la forma es filas × columnas', () => {
  const l = [
    ind(1, 'Grande', { 2026: { meta: 5, avance: 5, s: 'aprobado' } }), ind(2, 'Grande', { 2026: { meta: 5, s: 'falta' } }), ind(3, 'Grande', { 2026: { meta: 5, s: 'falta' } }),
    ind(4, 'Chica', { 2026: { meta: 5, s: 'pendiente' } }), ind(5, 'Chica', { 2026: { meta: 0 } }),
  ].map((i, k) => ({ ...i, linea: k < 2 ? 'Línea 2' : 'Línea 1' }))
  const m = mapaDeGrupos(l, 2026, HOY, i => i.dependencia, i => i.linea)
  assert.deepEqual(m.filas, ['Grande', 'Chica']); assert.deepEqual(m.columnas, ['Línea 1', 'Línea 2'])
  assert.equal(m.celdas.length, 2); assert.ok(m.celdas.every(f => f.length === 2))
  assert.equal(m.celdas.flat().reduce((s, c) => s + c.conMeta, 0), cuentaDeAnio(l, 2026, HOY).conMeta)
  assert.equal(m.celdas.flat().reduce((s, c) => s + c.total, 0), 5)
  assert.equal(m.maximo, 2)                       // Grande × Línea 2 (indicadores 1 y 2)
  assert.equal(m.celdas[1][1].conMeta, 0)         // Chica × Línea 2: nadie
})
ok('sin indicadores: mapa vacío, sin romperse', () => {
  const m = mapaDeGrupos([], 2026, HOY, i => i.dependencia, i => i.linea)
  assert.deepEqual([m.filas, m.columnas, m.celdas, m.maximo], [[], [], [], 0])
})

console.log('la distribución de carga')
ok('reparte en tramos y no pierde a nadie', () => {
  const d = distribucionDeCarga([1, 5, 6, 10, 11, 20, 21, 40, 41, 100])
  assert.deepEqual(d.tramos.map(t => t.personas), [2, 2, 2, 2, 2]); assert.equal(d.personas, 10)
  assert.deepEqual(d.tramos.map(t => t.rotulo), ['1 a 5', '6 a 10', '11 a 20', '21 a 40', '41 o más'])
})
ok('los que no llevan nada no entran', () => {
  const d = distribucionDeCarga([0, 0, 3, 0])
  assert.equal(d.personas, 1); assert.equal(d.minimo, 3); assert.equal(d.mediana, 3); assert.equal(d.maximo, 3)
})
ok('mediana de cantidad par e impar, y de nadie', () => {
  assert.equal(distribucionDeCarga([9, 1, 5]).mediana, 5)
  assert.equal(distribucionDeCarga([1, 2, 3, 10]).mediana, 2.5)
  const v = distribucionDeCarga([]); assert.deepEqual([v.personas, v.minimo, v.mediana, v.maximo], [0, null, null, null])
})

console.log('la serie del año')
ok('solo lo vigente del año pedido, de lo más antiguo a lo más reciente', () => {
  const r = (anio: number, creado: string, valor: number, estado: 'aprobado' | 'pendiente' | 'devuelto', vigente = true) => ({ anio, creado, valor, estado, vigente })
  const s = serieDelAnio([
    r(2026, '2026-09-10T10:00:00Z', 9, 'pendiente'), r(2026, '2026-03-01T10:00:00Z', 3, 'aprobado'), r(2026, '2026-05-01T10:00:00Z', 4, 'devuelto', false),
    r(2025, '2025-12-01T10:00:00Z', 7, 'aprobado'), r(2026, '2026-06-01T10:00:00Z', 6, 'aprobado'),
  ], 2026)
  assert.deepEqual(s.map(p => p.valor), [3, 6, 9]); assert.deepEqual(s.map(p => p.estado), ['aprobado', 'aprobado', 'pendiente'])
  assert.ok(s[0].t < s[1].t && s[1].t < s[2].t)
  assert.deepEqual(serieDelAnio([], 2026), [])
  assert.deepEqual(serieDelAnio([r(2026, 'no es una fecha', 1, 'aprobado')], 2026), [])
})

console.log(`\n${n} pruebas pasaron`)
