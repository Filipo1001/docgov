import assert from 'node:assert/strict'
import { cumplimientoDe, datosDeCumplimiento } from '@/lib/pdm/graficos'
import type { AnioDeIndicador, Indicador } from '@/lib/pdm/plan'
import { ANIOS_PLAN } from '@/lib/pdm/seguimiento'

let n = 0
const ok = (t: string, f: () => void) => { f(); n++; console.log('  ✓', t) }

function ind(id: number, dep: string, avance: number | null): Indicador {
  const anios: AnioDeIndicador[] = ANIOS_PLAN.map(a => ({
    anio: a, meta: 10, avance: a === 2026 ? avance : null,
    enAnio: a <= 2026 ? { situacion: avance === null ? 'falta' : 'aprobado', reporte: null } : null,
  }))
  const v = anios[2]
  return {
    id, uuid: `u${id}`, codigo: `C${id}`, linea: 'L', sector: 'S', programa: 'P', producto: 'X', indicador: `I${id}`, unidad: 'n',
    dependencia: dep, responsable: '', asignados: [{ usuarioId: 'x', principal: true, grupoId: null }],
    lineaBase: 0, metaCuatrienio: 40, anios, anio: 2026, meta: v.meta, avance: v.avance, enAnio: v.enAnio,
  }
}

console.log('los datos del diagrama')
ok('alcance «plan»: el total y una fila por secretaría, y las filas suman el total', () => {
  const l = [ind(1, 'Grande', 10), ind(2, 'Grande', 4), ind(3, 'Grande', null), ind(4, 'Chica', 10)]
  const d = datosDeCumplimiento(l, 'plan', 2026)!
  assert.equal(d.alcance, 'plan'); assert.equal(d.secretaria, null); assert.equal(d.anioActual, 2026)
  assert.deepEqual(d.porSecretaria.map(g => g.nombre), ['Grande', 'Chica'])
  const t = cumplimientoDe(d.total, [2026])
  const suma = d.porSecretaria.map(g => cumplimientoDe(g.porAnio, [2026]))
  assert.deepEqual([t.total, t.cumplidos, t.parciales, t.sinAvance], [4, 2, 1, 1])
  assert.equal(suma.reduce((x, c) => x + c.total, 0), t.total)
  assert.equal(suma.reduce((x, c) => x + c.cumplidos, 0), t.cumplidos)
})
ok('alcance «secretaria»: lleva su nombre y no trae filas por secretaría', () => {
  const d = datosDeCumplimiento([ind(1, 'Secretaría de X', 10), ind(2, 'Secretaría de X', null)], 'secretaria', 2026)!
  assert.equal(d.secretaria, 'Secretaría de X'); assert.deepEqual(d.porSecretaria, [])
})
ok('alcance «mios»: sin nombre de secretaría ni filas', () => {
  const d = datosDeCumplimiento([ind(1, 'A', 10)], 'mios', 2026)!
  assert.equal(d.secretaria, null); assert.deepEqual(d.porSecretaria, []); assert.equal(d.total.length, 4)
})
ok('sin indicadores no hay nada que mostrar', () => {
  assert.equal(datosDeCumplimiento([], 'plan', 2026), null)
  assert.equal(datosDeCumplimiento([], 'mios', 2026), null)
})

console.log(`\n${n} pruebas pasaron`)
