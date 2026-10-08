/**
 * Del dato de la base a lo que se pinta: armar el plan, cambiar de año, el estado de cada indicador, los filtros y «Mi trabajo».
 *
 * Se arma con filas como las que devuelve la base (`armarIndicadores`), no con objetos hechos a mano: así se prueba el mismo
 * camino que recorren las pantallas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarIndicadores, type FilaAsignacion, type FilaIndicador, type FilaMeta, type FilaVigente } from '@/lib/pdm/datos-armar'
import { estadoDe, proyectarAnio, proyectarLista, resumir, sinAsignar } from '@/lib/pdm/plan'
import { cumpleFiltro } from '@/lib/pdm/filtros'
import { ordenarMiTrabajo, pendientesDeReportar, tarjetasDeAnios } from '@/lib/pdm/mi-trabajo'

const fila = (n: number, dep = 'Secretaría General de Gobierno'): FilaIndicador => ({
  id: `u${n}`, fila_origen: n, codigo: `C${n}`, linea: 'Línea 1', sector: 'Educación', programa: 'P', producto: 'X', indicador: `Indicador ${n}`,
  unidad: 'Número', linea_base: '0', meta_cuatrienio: 40, responsable_origen: 'Alguien', dependencia: { nombre: dep },
})
const metas = (n: number, valores: (number | null)[]): FilaMeta[] => valores.map((m, k) => ({ indicador_id: `u${n}`, anio: 2024 + k, meta: m }))
const vigente = (n: number, anio: number, valor: number, estado: string, autor = 'yo'): FilaVigente => ({
  reporte_id: `r${n}-${anio}`, indicador_id: `u${n}`, anio, valor, estado, autor_id: autor, autor_nombre: 'PERSONA', created_at: `${anio}-06-01T12:00:00Z`,
  corrige_a: null, n_evidencias: 2, validacion_comentario: null, validador_nombre: null,
})

function plan() {
  const filas = [fila(1), fila(2), fila(3), fila(4), fila(5)]
  const ms = [
    ...metas(1, [10, 10, 10, 10]),
    ...metas(2, [5, 5, 5, 5]),
    ...metas(3, [0, 4, 0, 4]),      // sin meta en 2024 y 2026
    ...metas(4, [2, 2, 2, 2]),
    ...metas(5, [1, 1, 1, 1]),
  ]
  const asig: FilaAsignacion[] = [
    { indicador_id: 'u1', usuario_id: 'yo', principal: true },
    { indicador_id: 'u2', usuario_id: 'yo', principal: false, grupo_id: 'g1' },
    { indicador_id: 'u3', usuario_id: 'yo', principal: true },
    { indicador_id: 'u4', usuario_id: 'otro', principal: true },
    // u5 sin nadie
  ]
  const seg = {
    anioActual: 2026,
    avances: [{ indicador_id: 'u1', anio: 2026, valor: 12 }, { indicador_id: 'u4', anio: 2026, valor: 1 }],
    vigentes: [vigente(1, 2026, 12, 'aprobado'), vigente(2, 2026, 3, 'devuelto'), vigente(4, 2026, 1, 'aprobado', 'otro'), vigente(4, 2025, 2, 'pendiente', 'otro')],
  }
  return armarIndicadores(filas, ms, asig, seg)
}

test('cada indicador trae sus cuatro años y se abre en el de hoy', () => {
  const l = plan()
  assert.equal(l.length, 5)
  assert.ok(l.every(i => i.anios.length === 4 && i.anio === 2026))
  assert.deepEqual(l[0].anios.map(a => a.meta), [10, 10, 10, 10])
  assert.equal(l[0].lineaBase, 0)
})

test('solo lo APROBADO es avance; lo devuelto o sin validar no cuenta', () => {
  const [i1, i2, , i4] = plan()
  assert.equal(i1.avance, 12)
  assert.equal(i2.avance, null)
  assert.equal(i2.enAnio?.situacion, 'devuelto')
  assert.equal(proyectarAnio(i4, 2025).avance, null)
  assert.equal(proyectarAnio(i4, 2025).enAnio?.situacion, 'pendiente')
})

test('«falta reportar» solo si el año empezó, alguien lo lleva y hay meta', () => {
  const l = plan()
  const i3 = l[2], i5 = l[4]
  assert.equal(proyectarAnio(i3, 2025).enAnio?.situacion, 'falta')
  assert.equal(proyectarAnio(i3, 2026).enAnio, null)       // meta 0
  assert.equal(proyectarAnio(i3, 2027).enAnio, null)       // no ha empezado
  assert.equal(i5.enAnio, null)                             // nadie lo lleva
  assert.equal(sinAsignar(i5), true)
})

test('cambiar de año no vuelve a leer: proyecta', () => {
  const l = plan()
  const en25 = proyectarLista(l, 2025)
  assert.ok(en25.every(i => i.anio === 2025))
  assert.equal(proyectarAnio(l[0], 2026), l[0])            // mismo año: el mismo objeto
  assert.deepEqual(proyectarLista(en25, 2026).map(i => i.avance), l.map(i => i.avance))
})

test('el estado frente a la meta y el resumen', () => {
  const l = plan()
  assert.deepEqual(l.map(estadoDe), ['cumplido', 'sin_reporte', 'sin_meta', 'atrasado', 'sin_reporte'])   // 1 de 2 = 50 %
  const r = resumir(l)
  assert.deepEqual([r.total, r.medibles, r.cumplidos, r.atrasados, r.criticos, r.sinReporte, r.sinMeta, r.sinResponsable], [5, 4, 1, 1, 0, 2, 1, 1])
  assert.equal(r.cumplimiento, 25)
})

test('los filtros de la lista', () => {
  const l = plan()
  const ids = (f: Parameters<typeof cumpleFiltro>[1]) => l.filter(i => cumpleFiltro(i, f)).map(i => i.id)
  assert.deepEqual(ids('todos'), [1, 2, 3, 4, 5])
  assert.deepEqual(ids('sin_responsable'), [5])
  assert.deepEqual(ids('por_reportar'), [2])                // devuelto
  assert.deepEqual(ids('por_validar'), [])
  assert.deepEqual(proyectarLista(l, 2025).filter(i => cumpleFiltro(i, 'por_validar')).map(i => i.id), [4])
})

test('Mi trabajo: lo mío, con lo devuelto primero', () => {
  const l = plan()
  const s = ordenarMiTrabajo(l, 'yo')
  assert.deepEqual(s.map(x => [x.clave, x.indicadores.map(i => i.id)]), [['reportar', [2]], ['aprobados', [1]], ['otros', [3]]])
  assert.equal(pendientesDeReportar(l, 'yo'), 1)
  assert.equal(pendientesDeReportar(l, 'nadie'), 0)
  assert.deepEqual(ordenarMiTrabajo(l, 'nadie'), [])
  const s25 = ordenarMiTrabajo(proyectarLista(l, 2025), 'yo')
  assert.deepEqual(s25.map(x => [x.clave, x.indicadores.map(i => i.id)]), [['reportar', [1, 2, 3]]])
})

test('las tarjetas de los años de «Mi trabajo»', () => {
  const t = tarjetasDeAnios(plan(), 'yo', 2026)
  assert.deepEqual(t.map(x => x.anio), [2024, 2025, 2026, 2027])
  assert.deepEqual(t.map(x => x.estado), ['terminado', 'terminado', 'en_curso', 'proximo'])
  assert.deepEqual(t.map(x => x.conMeta), [2, 3, 2, 3])
  assert.equal(t[2].conAvance, 1)
  assert.deepEqual(t[2].resumen, { esperados: 2, sinObligacion: 1, faltan: 0, porValidar: 0, aprobados: 1, devueltos: 1 })
  assert.equal(t[3].resumen.esperados, 0)
})
