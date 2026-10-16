import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mostrarControlDeBaseEnPeriodo, puedeEditarBaseCotizacion } from '../../lib/base-cotizacion'

const YO = 'u-supervisor'
const OTRO = 'u-otro'
type Entrada = Parameters<typeof puedeEditarBaseCotizacion>[0]
const base: Entrada = { rol: 'supervisor', usuarioId: YO, supervisorId: YO, estado: 'enviado', esHistorico: false }
const ok = (o: Partial<Entrada>) => puedeEditarBaseCotizacion({ ...base, ...o }).ok

test('el supervisor del contrato edita mientras el informe está enviado o en revisión', () => {
  assert.equal(ok({ estado: 'enviado' }), true)
  assert.equal(ok({ estado: 'revision' }), true)
})

test('el supervisor no edita un informe aprobado, radicado, borrador ni devuelto', () => {
  for (const estado of ['aprobado', 'radicado', 'borrador', 'rechazado']) assert.equal(ok({ estado }), false, estado)
})

test('el supervisor no edita un periodo histórico, ni el de un contrato que no es suyo', () => {
  assert.equal(ok({ esHistorico: true }), false)
  assert.equal(ok({ supervisorId: OTRO }), false)
  assert.equal(ok({ supervisorId: null }), false)
  assert.equal(ok({ usuarioId: null }), false)
})

test('el administrador edita en cualquier estado y también históricos (como en Avanzado)', () => {
  for (const estado of ['borrador', 'enviado', 'revision', 'aprobado', 'radicado', 'rechazado']) {
    assert.equal(ok({ rol: 'admin', supervisorId: OTRO, estado }), true, estado)
  }
  assert.equal(ok({ rol: 'admin', esHistorico: true, estado: 'radicado' }), true)
})

test('ningún otro rol edita la base', () => {
  for (const rol of ['contratista', 'asesor', 'contratacion', 'alcalde', 'funcionario', 'hacienda', '', null, undefined]) {
    assert.equal(puedeEditarBaseCotizacion({ ...base, rol: rol as string | null }).ok, false, String(rol))
  }
})

test('los mensajes dicen qué hacer', () => {
  const d = puedeEditarBaseCotizacion({ ...base, estado: 'aprobado' })
  assert.equal(d.ok, false)
  if (!d.ok) assert.match(d.error, /administrador/)
  const e = puedeEditarBaseCotizacion({ ...base, supervisorId: OTRO })
  if (!e.ok) assert.match(e.error, /supervisor de este contrato/)
})

test('la pantalla del periodo solo pinta el control dentro de la ventana de revisión, también para el administrador', () => {
  assert.equal(mostrarControlDeBaseEnPeriodo(base), true)
  assert.equal(mostrarControlDeBaseEnPeriodo({ ...base, rol: 'admin', supervisorId: OTRO, estado: 'revision' }), true)
  assert.equal(mostrarControlDeBaseEnPeriodo({ ...base, rol: 'admin', estado: 'aprobado' }), false)
  assert.equal(mostrarControlDeBaseEnPeriodo({ ...base, rol: 'admin', estado: 'radicado' }), false)
  assert.equal(mostrarControlDeBaseEnPeriodo({ ...base, rol: 'admin', esHistorico: true }), false)
  assert.equal(mostrarControlDeBaseEnPeriodo({ ...base, rol: 'contratista' }), false)
  assert.equal(mostrarControlDeBaseEnPeriodo({ ...base, supervisorId: OTRO }), false)
})
