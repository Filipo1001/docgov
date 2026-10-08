import assert from 'node:assert/strict'
import {
  PARTES, POCOS_INDICADORES, cuentaDeAnio, cuentasPorAnio, cuentasPorGrupo, descripcionDeReportes, lecturaDelAnio, pctLegible, textoDeParte,
  type CuentaDeAnio,
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

console.log('la cuenta de un año')
ok('los cinco puntos reparten a los indicadores con meta, sin dejar a nadie fuera ni contarlo dos veces', () => {
  const l = [
    ind(1, 'A', { 2026: { meta: 10, avance: 10, s: 'aprobado' } }),
    ind(2, 'A', { 2026: { meta: 10, avance: null, s: 'pendiente' } }),
    ind(3, 'A', { 2026: { meta: 10, avance: null, s: 'devuelto' } }),
    ind(4, 'A', { 2026: { meta: 10, avance: null, s: 'falta' } }),
    ind(5, 'A', { 2026: { meta: 10 } }, false),
    ind(6, 'A', { 2026: { meta: 0 } }),   // meta 0: fuera de todo
    ind(7, 'A', {}),                       // sin fila de meta: fuera de todo
  ]
  const c = cuentaDeAnio(l, 2026, HOY)
  assert.equal(c.total, 7); assert.equal(c.conMeta, 5)
  assert.deepEqual([c.aprobados, c.porValidar, c.devueltos, c.faltan, c.sinResponsable], [1, 1, 1, 1, 1])
  assert.equal(suma(c), c.conMeta)
})
ok('la invariante vale con datos al azar, en los cuatro años y en cualquier año actual', () => {
  let semilla = 7
  const r = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647
  const estados: (SituacionAnio | null)[] = ['aprobado', 'pendiente', 'devuelto', 'falta', null]
  const l = Array.from({ length: 300 }, (_, k) => ind(k, 'D' + (k % 4), Object.fromEntries(ANIOS_PLAN.map(a => {
    const meta = r() < 0.15 ? 0 : Math.floor(r() * 20) + 1
    const s = estados[Math.floor(r() * 5)]
    return [a, { meta, avance: s === 'aprobado' ? Math.floor(r() * meta * 1.5) : null, s }]
  })), r() < 0.9))
  for (const hoy of [2024, 2026, 2027]) for (const c of cuentasPorAnio(l, hoy)) {
    if (c.estado === 'proximo') assert.equal(suma(c), 0)
    else assert.equal(suma(c), c.conMeta, `año ${c.anio} hoy ${hoy}`)
    assert.ok(c.alcanzaron <= c.conAvance && c.conAvance <= c.conMeta)
    if (c.avancePromedio !== null) assert.ok(c.avancePromedio >= 0 && c.avancePromedio <= 100)
  }
})
ok('«alcanzaron» cuenta el que llegó o pasó la meta; el que quedó al 95 % no', () => {
  const l = [
    ind(1, 'A', { 2026: { meta: 10, avance: 10, s: 'aprobado' } }),
    ind(2, 'A', { 2026: { meta: 10, avance: 15, s: 'aprobado' } }),
    ind(3, 'A', { 2026: { meta: 20, avance: 19, s: 'aprobado' } }),
  ]
  assert.equal(cuentaDeAnio(l, 2026, HOY).alcanzaron, 2)
})
ok('el promedio topa en 100 %: pasarse en uno no tapa lo que le falta a otro', () => {
  const l = [
    ind(1, 'A', { 2026: { meta: 10, avance: 30, s: 'aprobado' } }),  // 300 % → cuenta 1
    ind(2, 'A', { 2026: { meta: 10, avance: 5, s: 'aprobado' } }),   // 50 %
  ]
  assert.equal(cuentaDeAnio(l, 2026, HOY).avancePromedio, 75)
})
ok('el que no tiene avance validado cuenta 0 en el promedio (lo no validado no es avance)', () => {
  const l = [
    ind(1, 'A', { 2026: { meta: 10, avance: 10, s: 'aprobado' } }),
    ind(2, 'A', { 2026: { meta: 10, avance: null, s: 'pendiente' } }),
    ind(3, 'A', { 2026: { meta: 10, avance: null, s: 'falta' } }),
    ind(4, 'A', { 2026: { meta: 10 } }, false),
  ]
  assert.equal(cuentaDeAnio(l, 2026, HOY).avancePromedio, 25)
})
ok('sin un solo avance validado el promedio es «no se puede decir», no 0', () => {
  const l = [ind(1, 'A', { 2026: { meta: 10, s: 'pendiente' } }), ind(2, 'A', { 2026: { meta: 10, s: 'falta' } })]
  const c = cuentaDeAnio(l, 2026, HOY)
  assert.equal(c.avancePromedio, null); assert.equal(c.conAvance, 0); assert.equal(c.alcanzaron, 0)
})
ok('un año que no ha empezado cuenta sus metas y nada más', () => {
  const l = [ind(1, 'A', { 2027: { meta: 10, avance: 4, s: 'falta' } }), ind(2, 'A', { 2027: { meta: 0 } })]
  const c = cuentaDeAnio(l, 2027, HOY)
  assert.equal(c.estado, 'proximo'); assert.equal(c.conMeta, 1); assert.equal(c.avancePromedio, null)
  assert.equal(suma(c), 0); assert.equal(c.alcanzaron, 0)
})
ok('un reporte manda: aprobado aunque hoy nadie lo lleve', () => {
  const l = [ind(1, 'A', { 2026: { meta: 10, avance: 10, s: 'aprobado' } }, false)]
  const c = cuentaDeAnio(l, 2026, HOY)
  assert.equal(c.aprobados, 1); assert.equal(c.sinResponsable, 0)
})
ok('cada año se mide con SU meta: el mismo indicador cumple un año y no otro', () => {
  const l = [ind(1, 'A', { 2025: { meta: 4, avance: 4, s: 'aprobado' }, 2026: { meta: 9, avance: 3, s: 'aprobado' } })]
  assert.equal(cuentaDeAnio(l, 2025, HOY).alcanzaron, 1)
  assert.equal(cuentaDeAnio(l, 2026, HOY).alcanzaron, 0)
  assert.equal(cuentaDeAnio(l, 2026, HOY).avancePromedio!.toFixed(2), '33.33')
})
ok('lista vacía: todo en cero y sin promedio', () => {
  const c = cuentaDeAnio([], 2026, HOY)
  assert.equal(c.conMeta, 0); assert.equal(c.avancePromedio, null); assert.equal(suma(c), 0)
})
ok('los grupos salen del que más indicadores tiene al que menos', () => {
  const l = [ind(1, 'Chica', { 2026: { meta: 1 } }), ind(2, 'Grande', { 2026: { meta: 1 } }), ind(3, 'Grande', { 2026: { meta: 1 } })]
  const g = cuentasPorGrupo(l, 2026, HOY, i => i.dependencia)
  assert.deepEqual(g.map(x => x.nombre), ['Grande', 'Chica']); assert.equal(g[0].cuenta.total, 2)
  assert.ok(g[1].cuenta.conMeta < POCOS_INDICADORES)
})

console.log('porcentaje legible')
ok('no miente en los extremos', () => {
  assert.equal(pctLegible(null), '—'); assert.equal(pctLegible(0), '0 %'); assert.equal(pctLegible(0.3), '<1 %')
  assert.equal(pctLegible(37.4), '37 %'); assert.equal(pctLegible(99.7), '99 %'); assert.equal(pctLegible(100), '100 %')
  assert.equal(pctLegible(1), '1 %')
})
ok('palabras de cada punto', () => {
  assert.equal(textoDeParte('aprobados', 1), '1 aprobado'); assert.equal(textoDeParte('aprobados', 5), '5 aprobados')
  assert.equal(textoDeParte('devueltos', 1), '1 devuelto'); assert.equal(textoDeParte('faltan', 12), '12 por reportar')
  assert.equal(textoDeParte('porValidar', 3), '3 sin validar'); assert.equal(textoDeParte('sinResponsable', 0), '0 sin responsable')
  assert.equal(PARTES.length, 5)
})
ok('la descripción para lector de pantalla trae todas las cifras, bien concordadas', () => {
  const c = cuentaDeAnio([ind(1, 'A', { 2026: { meta: 5, avance: 5, s: 'aprobado' } })], 2026, HOY)
  assert.match(descripcionDeReportes({ ...c, conMeta: 3 }), /Reportes de 3 indicadores con meta en 2026/)
  assert.match(descripcionDeReportes(c), /Reportes de 1 indicador con meta en 2026: 1 aprobado, 0 sin validar, 0 devueltos, 0 por reportar, 0 sin responsable/)
})

console.log('la frase de apertura')
const dos = (c: CuentaDeAnio) => c
ok('con avance y con cosas esperando', () => {
  const A = Array.from({ length: 6 }, (_, k) => ind(k, 'Territorial', { 2026: { meta: 10, avance: k < 2 ? 10 : null, s: k < 2 ? 'aprobado' : k < 5 ? 'pendiente' : 'falta' } }))
  const B = [ind(20, 'Bienestar', { 2026: { meta: 10, s: 'devuelto' } }), ind(21, 'Bienestar', { 2026: { meta: 10 } }, false)]
  const todo = [...A, ...B]
  const c = cuentaDeAnio(todo, 2026, HOY)
  const g = cuentasPorGrupo(todo, 2026, HOY, i => i.dependencia)
  const t = lecturaDelAnio(dos(c), g)
  assert.equal(t.titular, 'En 2026, 2 de 8 indicadores con meta ya la alcanzaron; el avance promedio es 25 %.')
  assert.equal(t.detalle, '3 reportes esperan validación en Territorial. 1 reporte devuelto espera corrección. 1 indicador con meta no tiene responsable. Falta 1 indicador por reportar.')
})
ok('si lo que espera está repartido, dice dónde está la mayoría; si no hay mayoría, no inventa dónde', () => {
  const mk = (dep: string, k: number) => ind(k, dep, { 2026: { meta: 5, s: 'pendiente' } })
  const mayoria = [mk('X', 1), mk('X', 2), mk('X', 3), mk('Y', 4)]
  const g1 = cuentasPorGrupo(mayoria, 2026, HOY, i => i.dependencia)
  assert.match(lecturaDelAnio(cuentaDeAnio(mayoria, 2026, HOY), g1).detalle, /^4 reportes esperan validación, la mayoría en X\./)
  const parejo = [mk('X', 1), mk('X', 2), mk('Y', 3), mk('Y', 4)]
  const g2 = cuentasPorGrupo(parejo, 2026, HOY, i => i.dependencia)
  assert.match(lecturaDelAnio(cuentaDeAnio(parejo, 2026, HOY), g2).detalle, /^4 reportes esperan validación\./)
  const unica = [mk('X', 1), mk('X', 2)]
  const g3 = cuentasPorGrupo(unica, 2026, HOY, i => i.dependencia)
  assert.match(lecturaDelAnio(cuentaDeAnio(unica, 2026, HOY), g3).detalle, /^2 reportes esperan validación\./)
})
ok('singulares y plurales', () => {
  const l = [ind(1, 'X', { 2026: { meta: 5, avance: 5, s: 'aprobado' } })]
  const t = lecturaDelAnio(cuentaDeAnio(l, 2026, HOY), [])
  assert.equal(t.titular, 'En 2026, 1 de 1 indicador con meta ya la alcanzó; el avance promedio es 100 %.'); assert.equal(t.detalle, '')
})
ok('sin avances validados lo dice, en vez de un «0 %» que asusta', () => {
  const l = [ind(1, 'X', { 2026: { meta: 5, s: 'pendiente' } }), ind(2, 'X', { 2026: { meta: 5, s: 'falta' } })]
  const t = lecturaDelAnio(cuentaDeAnio(l, 2026, HOY), [])
  assert.equal(t.titular, 'En 2026 todavía no hay avances validados.')
  assert.equal(t.detalle, '1 reporte espera validación. Falta 1 indicador por reportar.')
})
ok('hay avance pero nadie llegó a la meta', () => {
  const l = [ind(1, 'X', { 2026: { meta: 10, avance: 4, s: 'aprobado' } }), ind(2, 'X', { 2026: { meta: 10, s: 'falta' } })]
  assert.equal(lecturaDelAnio(cuentaDeAnio(l, 2026, HOY), []).titular, 'En 2026, 0 de 2 indicadores con meta la han alcanzado; el avance promedio es 20 %.')
})
ok('año próximo y año sin metas', () => {
  const l = [ind(1, 'X', { 2027: { meta: 5 } }), ind(2, 'X', { 2027: { meta: 5 } })]
  const p = lecturaDelAnio(cuentaDeAnio(l, 2027, HOY), [])
  assert.equal(p.titular, 'El 2027 empieza el 1 de enero de 2027.'); assert.equal(p.detalle, 'Sus 2 indicadores con meta se podrán reportar desde ese día.')
  assert.equal(lecturaDelAnio(cuentaDeAnio([l[0]], 2027, HOY), []).detalle, 'Su único indicador con meta se podrá reportar desde ese día.')
  assert.equal(lecturaDelAnio(cuentaDeAnio([ind(1, 'X', {})], 2026, HOY), []).titular, 'En 2026 ningún indicador tiene meta.')
})
ok('todo lo esperado aprobado: el titular alcanza, sin detalle', () => {
  const l = [ind(1, 'X', { 2026: { meta: 5, avance: 5, s: 'aprobado' } }), ind(2, 'X', { 2026: { meta: 5, avance: 7, s: 'aprobado' } })]
  assert.equal(lecturaDelAnio(cuentaDeAnio(l, 2026, HOY), []).detalle, '')
})

console.log(`\n${n} pruebas pasaron`)
