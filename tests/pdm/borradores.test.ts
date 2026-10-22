import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aplicarSituacion, armarBorradores, firmaDelFormulario, quienGuardo, type FilaBorrador, type FilaBorradorArchivo } from '@/lib/pdm/borradores'
import {
  MAX_EVIDENCIAS, MENSAJE_DEMASIADOS_ARCHIVOS, errorEnArchivos, errorEnArchivosDelBorrador, errorEnBorrador,
} from '@/lib/pdm/seguimiento-acciones'

const fila = (o: Partial<FilaBorrador> = {}): FilaBorrador => ({
  id: 'b1', anio: 2026, valor: '4.50', texto: 'Se hicieron cuatro talleres', motivo: null, conservar: null, version: 3,
  editado_por: 'u1', editado_nombre: 'ANA MARÍA PÉREZ', editado_en: '2026-10-21T17:00:00Z', ...o,
})
const archivo = (b: string, ruta: string, subido = '2026-10-21T16:00:00Z', bytes: number | string = 1000): FilaBorradorArchivo =>
  ({ borrador_id: b, ruta, nombre: `${ruta}.pdf`, tipo: 'application/pdf', bytes, subido_en: subido })

test('de las filas al borrador que ve la pantalla: valor como número, nulos como vacío, archivos en el orden en que se subieron', () => {
  const r = armarBorradores(
    [fila(), fila({ id: 'b2', anio: 2025, valor: null, texto: null, motivo: 'Se corrige', conservar: ['e1'] })],
    [archivo('b1', 'z', '2026-10-21T16:00:00Z'), archivo('b1', 'a', '2026-10-21T15:00:00Z'), archivo('b2', 'x'), archivo('b9', 'huérfano')],
  )
  assert.deepEqual(r.map(b => b.anio), [2026, 2025], 'del año más reciente al más antiguo')
  const [nuevo, viejo] = r
  assert.equal(nuevo.valor, 4.5)
  assert.equal(nuevo.motivo, '')
  assert.deepEqual(nuevo.conservar, [])
  assert.deepEqual(nuevo.archivos.map(a => a.ruta), ['a', 'z'], 'el que se subió antes va primero')
  assert.equal(nuevo.archivos[0].bytes, 1000)
  assert.equal(nuevo.editadoPor, 'ANA MARÍA PÉREZ')
  assert.equal(viejo.valor, null, 'un borrador sin valor no inventa uno')
  assert.equal(viejo.texto, '')
  assert.deepEqual(viejo.conservar, ['e1'])
  assert.deepEqual(viejo.archivos.map(a => a.ruta), ['x'], 'solo los archivos de SU borrador')
})

test('un valor ilegible llega como «sin valor», no como un número inventado', () => {
  assert.equal(armarBorradores([fila({ valor: 'abc' })], [])[0].valor, null)
  assert.equal(armarBorradores([fila({ valor: '' })], [])[0].valor, null)
  assert.equal(armarBorradores([fila({ valor: 0 })], [])[0].valor, 0, 'cero es un valor')
})

test('un borrador de corrección abierto cuando el reporte sigue sin cerrar conserva lo que sigue valiendo', () => {
  const b = { conservar: ['e1', 'e2', 'e3'], motivo: 'Se agrega el acta' }
  const r = aplicarSituacion(b, [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }], new Set(), true)
  assert.deepEqual(r.conservar, ['e1', 'e2', 'e3'])
  assert.equal(r.motivo, 'Se agrega el acta')
  assert.equal(r.quitados, 0)
  assert.equal(r.motivoDescartado, false)
})

test('si la secretaría devolvió un archivo, el borrador deja de conservarlo; si ya no es de la versión que se corrige, tampoco', () => {
  const b = { conservar: ['e1', 'e2', 'e3'], motivo: 'x' }
  const r = aplicarSituacion(b, [{ id: 'e1' }, { id: 'e2' }], new Set(['e2']), true)
  assert.deepEqual(r.conservar, ['e1'], 'e2 lo devolvieron y e3 ya no es de esta versión')
  assert.equal(r.quitados, 2)
})

test('si ya no se corrige (lo aprobaron: ahora es un avance nuevo), no se conserva nada y el motivo sobra', () => {
  const r = aplicarSituacion({ conservar: ['e1'], motivo: 'Se corrige el acta' }, [], new Set(), false)
  assert.deepEqual(r.conservar, [])
  assert.equal(r.motivo, '')
  assert.equal(r.quitados, 1)
  assert.equal(r.motivoDescartado, true)
  // Sin motivo escrito, no hay nada que avisar del motivo.
  assert.equal(aplicarSituacion({ conservar: [], motivo: '   ' }, [], new Set(), false).motivoDescartado, false)
})

test('la firma del formulario cambia con cualquier cosa que importe y con nada más', () => {
  const base = { valor: '4,5', texto: 'Se hicieron talleres', motivo: '', conservar: ['b', 'a'], guardados: ['r1', 'r2'], porSubir: [] as string[] }
  const f = firmaDelFormulario(base)
  assert.equal(firmaDelFormulario({ ...base, conservar: new Set(['a', 'b']) }), f, 'el orden de lo conservado no cuenta')
  assert.equal(firmaDelFormulario({ ...base, valor: ' 4,5 ' }), f, 'los espacios del valor no cuentan')
  for (const cambio of [{ valor: '5' }, { texto: 'Se hicieron talleres.' }, { motivo: 'x' }, { conservar: ['a'] }, { guardados: ['r1'] }, { porSubir: ['nuevo.pdf:5:1'] }]) {
    assert.notEqual(firmaDelFormulario({ ...base, ...cambio }), f, JSON.stringify(cambio))
  }
})

test('quién guardó el borrador: «ti» si fue quien mira, el nombre propio si fue otra persona', () => {
  assert.equal(quienGuardo({ editadoPorId: 'u1', editadoPor: 'ANA MARÍA PÉREZ' }, 'u1'), 'ti')
  assert.equal(quienGuardo({ editadoPorId: 'u1', editadoPor: 'ANA MARÍA PÉREZ' }, 'u2'), 'Ana María Pérez')
})

test('lo que se escribe en un borrador: puede estar incompleto, pero lo que trae tiene que servir y tiene que haber algo', () => {
  const ok = { valor: null, texto: 'Se hizo el primer taller', archivos: 0, conservadas: 0 }
  assert.equal(errorEnBorrador(ok), null, 'sin valor ni archivos pero con texto')
  assert.equal(errorEnBorrador({ valor: null, texto: 'corto', archivos: 0, conservadas: 0 }), null, 'un texto corto sirve en un borrador')
  assert.equal(errorEnBorrador({ valor: 4, texto: '', archivos: 0, conservadas: 0 }), null, 'solo el valor')
  assert.equal(errorEnBorrador({ valor: 0, texto: '', archivos: 0, conservadas: 0 }), null, 'cero es un valor')
  assert.equal(errorEnBorrador({ valor: null, texto: '', archivos: 1, conservadas: 0 }), null, 'solo un archivo')
  assert.equal(errorEnBorrador({ valor: null, texto: '', motivo: 'Se corrige', archivos: 0, conservadas: 0 }), null, 'solo el motivo')
  assert.equal(errorEnBorrador({ valor: null, texto: '', archivos: 0, conservadas: 2 }), null, 'solo lo conservado')
  assert.match(errorEnBorrador({ valor: null, texto: '   ', motivo: '  ', archivos: 0, conservadas: 0 })!, /nada que guardar/)
  assert.match(errorEnBorrador({ ...ok, valor: -1 })!, /número/)
  assert.match(errorEnBorrador({ ...ok, valor: Number.NaN })!, /número/)
  assert.match(errorEnBorrador({ ...ok, valor: 1e13 })!, /grande/)
  assert.match(errorEnBorrador({ ...ok, texto: 'a'.repeat(1001) })!, /1000/)
  assert.match(errorEnBorrador({ ...ok, motivo: 'm'.repeat(501) })!, /500/)
})

test('el tope de archivos del borrador es el del reporte (sumando lo guardado, lo nuevo y lo conservado) y no dice el número', () => {
  assert.equal(errorEnBorrador({ valor: null, texto: 'x', archivos: MAX_EVIDENCIAS, conservadas: 0 }), null)
  assert.equal(errorEnBorrador({ valor: null, texto: 'x', archivos: MAX_EVIDENCIAS, conservadas: 1 }), MENSAJE_DEMASIADOS_ARCHIVOS)
  const pdf = (n: number) => Array.from({ length: n }, (_, k) => ({ nombre: `a${k}.pdf`, tipo: 'application/pdf', bytes: 1000 }))
  assert.equal(errorEnArchivosDelBorrador(pdf(10), 10, 10), null)
  assert.equal(errorEnArchivosDelBorrador(pdf(11), 10, 10), MENSAJE_DEMASIADOS_ARCHIVOS)
  assert.doesNotMatch(MENSAJE_DEMASIADOS_ARCHIVOS, /\d/)
})

test('los archivos de un borrador se revisan como los de un reporte, pero sin el mínimo de uno', () => {
  assert.equal(errorEnArchivosDelBorrador([], 0, 0), null, 'un borrador puede no tener archivos todavía')
  assert.match(errorEnArchivos([])!, /al menos una/, 'un reporte, no')
  assert.match(errorEnArchivosDelBorrador([{ nombre: 'virus.exe', tipo: 'application/x-msdownload', bytes: 10 }], 0, 0)!, /solo se admite/)
  assert.match(errorEnArchivosDelBorrador([{ nombre: 'vacio.pdf', tipo: 'application/pdf', bytes: 0 }], 0, 0)!, /vacío/)
  assert.match(errorEnArchivosDelBorrador([{ nombre: 'enorme.pdf', tipo: 'application/pdf', bytes: 26 * 1024 * 1024 }], 0, 0)!, /máximo para un PDF/)
  assert.match(errorEnArchivosDelBorrador([{ nombre: '  ', tipo: 'application/pdf', bytes: 10 }], 0, 0)!, /nombre/)
})
