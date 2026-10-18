import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_MOTIVO_ANULACION, MIN_MOTIVO_ANULACION, anulacionesPorReporte, errorEnAnulacion, idsAnulados, type FilaAnulacion,
} from '@/lib/pdm/anulaciones'
import { armarDetalle, type FilaReporteDetalle, type FilaValidacion } from '@/lib/pdm/detalle-armar'
import { serieDelAnio } from '@/lib/pdm/graficos'

// ─── El motivo ────────────────────────────────────────────────────────────────

test('el motivo es obligatorio, de 10 a 500 caracteres, y la frase nombra la acción', () => {
  assert.equal(errorEnAnulacion('', 'anular'), 'Explica por qué anulas el reporte.')
  assert.equal(errorEnAnulacion('   ', 'restaurar'), 'Explica por qué restauras el reporte.')
  assert.equal(errorEnAnulacion(undefined, 'anular'), 'Explica por qué anulas el reporte.')
  assert.equal(errorEnAnulacion(42, 'anular'), 'Explica por qué anulas el reporte.')
  assert.match(errorEnAnulacion('corto', 'anular') ?? '', new RegExp(`al menos ${MIN_MOTIVO_ANULACION} caracteres`))
  assert.equal(errorEnAnulacion(' '.repeat(20) + 'corto', 'anular') !== null, true, 'los espacios no cuentan')
  assert.equal(errorEnAnulacion('x'.repeat(MIN_MOTIVO_ANULACION), 'anular'), null)
  assert.equal(errorEnAnulacion('x'.repeat(MAX_MOTIVO_ANULACION), 'restaurar'), null)
  assert.match(errorEnAnulacion('x'.repeat(MAX_MOTIVO_ANULACION + 1), 'anular') ?? '', new RegExp(`${MAX_MOTIVO_ANULACION} caracteres`))
})

// ─── Qué está anulado ahora ───────────────────────────────────────────────────

const fila = (reporte: string, accion: string, cuando: string, motivo = 'Motivo de prueba', por = 'Felipe'): FilaAnulacion => ({
  reporte_id: reporte, accion, motivo, actor_nombre: por, created_at: cuando,
})

test('vale la ÚLTIMA fila de cada reporte: anular, restaurar y volver a anular', () => {
  assert.deepEqual([...idsAnulados([])], [])
  assert.deepEqual([...idsAnulados([fila('a', 'anular', '2026-10-01T10:00:00Z')])], ['a'])
  assert.deepEqual([...idsAnulados([fila('a', 'anular', '2026-10-01T10:00:00Z'), fila('a', 'restaurar', '2026-10-02T10:00:00Z')])], [])
  assert.deepEqual(
    [...idsAnulados([fila('a', 'anular', '2026-10-01T10:00:00Z'), fila('a', 'restaurar', '2026-10-02T10:00:00Z'), fila('a', 'anular', '2026-10-03T10:00:00Z')])],
    ['a'],
  )
})

test('el orden en que llegan las filas no importa, y cada reporte se mira por separado', () => {
  const desordenadas = [
    fila('a', 'restaurar', '2026-10-02T10:00:00Z'),
    fila('b', 'anular', '2026-10-01T10:00:00Z'),
    fila('a', 'anular', '2026-10-01T10:00:00Z'),
  ]
  assert.deepEqual([...idsAnulados(desordenadas)], ['b'])
})

test('a igual instante manda la que llegó después; lo que no es una fila con sentido se ignora', () => {
  assert.deepEqual([...idsAnulados([fila('a', 'anular', '2026-10-01T10:00:00Z'), fila('a', 'restaurar', '2026-10-01T10:00:00Z')])], [])
  const basura = [
    fila('a', 'borrar', '2026-10-05T10:00:00Z'),
    null as unknown as FilaAnulacion,
    { reporte_id: 'a', accion: 'anular' } as unknown as FilaAnulacion,
    fila('a', 'anular', '2026-10-01T10:00:00Z'),
  ]
  assert.deepEqual([...idsAnulados(basura)], ['a'])
})

test('la historia de cada reporte sale de la más antigua a la más reciente, con un nombre por defecto', () => {
  const m = anulacionesPorReporte([
    fila('a', 'restaurar', '2026-10-02T10:00:00Z', 'Se anuló por error', 'Ana'),
    fila('a', 'anular', '2026-10-01T10:00:00Z', 'Indicador equivocado', ''),
  ])
  assert.deepEqual(m.get('a'), [
    { accion: 'anular', motivo: 'Indicador equivocado', por: 'El administrador', cuando: '2026-10-01T10:00:00Z' },
    { accion: 'restaurar', motivo: 'Se anuló por error', por: 'Ana', cuando: '2026-10-02T10:00:00Z' },
  ])
  assert.equal(m.get('b'), undefined)
})

// ─── El detalle de un indicador con reportes anulados ─────────────────────────

let n = 0
const reporte = (id: string, extra: Partial<FilaReporteDetalle> = {}): FilaReporteDetalle => ({
  id, anio: 2026, valor: 10, valor_anterior: null, texto: 'Se hizo una actividad.', autor_id: 'responsable', autor_nombre: 'ANA',
  corrige_a: null, motivo_correccion: null, created_at: new Date(Date.UTC(2026, 9, 1, 12, n++)).toISOString(), ...extra,
})
const validacion = (reporteId: string, estado: string, minuto: number, comentario: string | null = null): FilaValidacion => ({
  reporte_id: reporteId, estado, comentario, validador_nombre: 'LUIS', created_at: new Date(Date.UTC(2026, 9, 2, 12, minuto)).toISOString(),
})

const armar = (
  reportes: FilaReporteDetalle[], validaciones: FilaValidacion[], anulaciones: FilaAnulacion[],
  quien: { yoId?: string; esAdmin?: boolean; puedeValidarElIndicador?: boolean } = {},
) => armarDetalle({
  reportes, evidencias: [], validaciones, comentarios: [], anulaciones,
  yoId: quien.yoId ?? 'admin', esAdmin: quien.esAdmin ?? true, puedeValidarElIndicador: quien.puedeValidarElIndicador ?? true,
})
const de = (d: ReturnType<typeof armar>, id: string) => d.reportes.find(r => r.id === id)!

test('sin anulaciones nada cambia: el último del año se valida y se puede anular; no hay nada que restaurar', () => {
  n = 0
  const r1 = reporte('r1')
  const d = armar([r1], [], [])
  assert.equal(de(d, 'r1').anulado, false)
  assert.equal(de(d, 'r1').vigente, true)
  assert.equal(de(d, 'r1').puedeValidar, true)
  assert.equal(de(d, 'r1').puedeAnular, true)
  assert.equal(de(d, 'r1').puedeRestaurar, false)
  assert.deepEqual(de(d, 'r1').anulaciones, [])
})

test('solo el administrador anula y restaura; quien no lo es no recibe esos botones', () => {
  n = 0
  const d = armar([reporte('r1')], [], [], { esAdmin: false })
  assert.equal(de(d, 'r1').puedeAnular, false)
  assert.equal(de(d, 'r1').puedeRestaurar, false)
})

test('un avance equivocado anulado deja de ser lo vigente: el anterior vuelve a validarse y a anularse', () => {
  n = 0
  const r1 = reporte('r1'); const r2 = reporte('r2', { valor: 25, valor_anterior: 10 })
  const d = armar([r1, r2], [validacion('r1', 'aprobado', 1)], [fila('r2', 'anular', '2026-10-03T10:00:00Z', 'Indicador equivocado', 'Felipe')])
  const a = de(d, 'r2'); const b = de(d, 'r1')
  assert.equal(a.anulado, true)
  assert.equal(a.vigente, false)
  assert.equal(a.puedeValidar, false)
  assert.equal(a.puedeAnular, false)
  assert.equal(a.puedeRestaurar, true, 'es la versión más reciente, nada vigente vino después y el anterior sigue aprobado')
  assert.equal(a.anulaciones[0].motivo, 'Indicador equivocado')
  assert.equal(b.anulado, false)
  assert.equal(b.vigente, true)
  assert.equal(b.puedeAnular, true, 'ahora lo último del año es el aprobado')
  assert.equal(b.puedeValidar, true)
  // La evolución del año no dibuja lo anulado.
  const serie = serieDelAnio(d.reportes, 2026)
  assert.deepEqual(serie.map(p => p.valor), [10])
})

test('restaurar vuelve a dejarlo vigente', () => {
  n = 0
  const r1 = reporte('r1'); const r2 = reporte('r2', { valor: 25 })
  const d = armar([r1, r2], [validacion('r1', 'aprobado', 1)], [
    fila('r2', 'anular', '2026-10-03T10:00:00Z'), fila('r2', 'restaurar', '2026-10-04T10:00:00Z', 'Se anuló por error'),
  ])
  assert.equal(de(d, 'r2').anulado, false)
  assert.equal(de(d, 'r2').vigente, true)
  assert.equal(de(d, 'r2').puedeAnular, true)
  assert.equal(de(d, 'r2').puedeRestaurar, false)
  assert.deepEqual(de(d, 'r2').anulaciones.map(a => a.accion), ['anular', 'restaurar'])
  assert.equal(de(d, 'r1').puedeAnular, false, 'hay otro reporte más reciente')
  assert.deepEqual(serieDelAnio(d.reportes, 2026).map(p => p.valor), [10, 25])
})

test('una cadena de versiones se anula junta: ninguna cuenta, y solo la más reciente se restaura', () => {
  n = 0
  const r1 = reporte('r1'); const r2 = reporte('r2', { valor: 25 })
  const r4 = reporte('r4', { valor: 22, corrige_a: 'r2', motivo_correccion: 'Corrijo el valor' })
  const d = armar([r1, r2, r4], [validacion('r1', 'aprobado', 1), validacion('r2', 'devuelto', 2, 'El valor no coincide')], [
    fila('r4', 'anular', '2026-10-03T10:00:00Z'), fila('r2', 'anular', '2026-10-03T10:00:01Z'),
  ])
  assert.equal(de(d, 'r4').anulado && de(d, 'r2').anulado, true)
  assert.equal(de(d, 'r4').vigente || de(d, 'r2').vigente, false)
  assert.equal(de(d, 'r4').puedeRestaurar, true)
  assert.equal(de(d, 'r2').puedeRestaurar, false, 'la versión anterior se restaura con su cadena, no sola')
  assert.equal(de(d, 'r1').vigente, true)
  assert.equal(de(d, 'r1').puedeAnular, true)
})

test('una versión corregida por una corrección que CUENTA sigue siendo historia', () => {
  n = 0
  const r2 = reporte('r2'); const r4 = reporte('r4', { corrige_a: 'r2', motivo_correccion: 'Corrijo el valor' })
  const d = armar([r2, r4], [validacion('r2', 'devuelto', 1, 'El valor no coincide')], [])
  assert.equal(de(d, 'r2').vigente, false)
  assert.equal(de(d, 'r2').puedeAnular, false)
  assert.equal(de(d, 'r4').vigente, true)
  assert.equal(de(d, 'r4').puedeAnular, true)
})

test('no se restaura con otro reporte vigente más nuevo', () => {
  n = 0
  const r1 = reporte('r1'); const r2 = reporte('r2'); const r3 = reporte('r3')
  const d = armar([r1, r2, r3], [validacion('r1', 'aprobado', 1)], [fila('r2', 'anular', '2026-10-03T10:00:00Z')])
  assert.equal(de(d, 'r2').puedeRestaurar, false)
})

test('no se restaura un avance si el reporte anterior ya no está aprobado', () => {
  n = 0
  const r1 = reporte('r1'); const r2 = reporte('r2')
  const d = armar([r1, r2], [validacion('r1', 'aprobado', 1), validacion('r1', 'devuelto', 2, 'Reabierto: la cifra estaba mal')], [
    fila('r2', 'anular', '2026-10-03T10:00:00Z'),
  ])
  assert.equal(de(d, 'r2').puedeRestaurar, false)
  // Y sin reporte anterior (era el primero del año) sí se puede.
  n = 0
  const solo = armar([reporte('s1')], [], [fila('s1', 'anular', '2026-10-03T10:00:00Z')])
  assert.equal(de(solo, 's1').puedeRestaurar, true)
})

test('un reporte anulado de otro año no estorba al año que se mira', () => {
  n = 0
  const a = reporte('a', { anio: 2025 }); const b = reporte('b', { anio: 2026 })
  const d = armar([a, b], [], [fila('a', 'anular', '2026-10-03T10:00:00Z')])
  assert.equal(de(d, 'a').anulado, true)
  assert.equal(de(d, 'b').puedeAnular, true)
  assert.equal(de(d, 'b').puedeValidar, true)
})

test('devolver un reporte que estaba APROBADO se dice «reabrir»; una devolución normal no', () => {
  n = 0
  const r1 = reporte('r1'); const r2 = reporte('r2', { anio: 2025 })
  const d = armar([r1, r2], [
    validacion('r1', 'aprobado', 1), validacion('r1', 'devuelto', 2, 'Reabierto: el valor no coincide'),
    validacion('r2', 'devuelto', 1, 'Falta la firma del acta'),
  ], [])
  assert.deepEqual(de(d, 'r1').validaciones.map(v => v.reabre), [false, true])
  assert.deepEqual(de(d, 'r2').validaciones.map(v => v.reabre), [false])
})
