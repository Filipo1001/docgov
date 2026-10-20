/**
 * Los topes y tipos de los espacios `evidencias`, `documentos` y `certificaciones` (migración 033) frente a lo que la aplicación
 * deja subir.
 *
 * Por qué existe: el borrador original de la 033 fijaba 10 MB al espacio `documentos`, y cuando por fin se revisó, la factura electrónica
 * (que se sube ahí con un tope propio de 15 MB) ya lo contradecía: una factura de 12 MB que la aplicación acepta habría fallado en el
 * almacenamiento, lejos de la pantalla que la pidió. Esta prueba lee las dos cosas TAL COMO están escritas y exige que el espacio
 * siempre quepa lo que la aplicación ofrece: si alguien sube un tope en el código sin subirlo en la migración (o al revés), falla aquí
 * y no en producción.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const MB = 1024 * 1024
const GLOBAL_STORAGE = 100 * MB   // límite global del almacenamiento (panel de Supabase, 20-oct-2026)

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8')

/** `10 * 1024 * 1024` → 10485760. Solo producto de enteros: es lo único que escribe el código. */
const producto = (expr: string) => expr.split('*').map(n => Number(n.trim())).reduce((a, b) => a * b, 1)

function constante(fuente: string, nombre: string): number {
  const m = new RegExp(`${nombre}\\s*[:=]\\s*([0-9 *]+?)\\s*(?:,|\\n|//)`).exec(fuente)
  assert.ok(m, `no encontré ${nombre}`)
  return producto(m[1])
}

function lista(fuente: string, nombre: string): string[] {
  const m = new RegExp(`${nombre}\\s*:\\s*\\[([^\\]]*)\\]`).exec(fuente)
  assert.ok(m, `no encontré la lista ${nombre}`)
  return [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1])
}

const sql = leer('supabase/migrations/033_buckets_restricciones.sql')

/** El tope y los tipos que la migración le fija a un espacio. */
function espacio(id: string): { tope: number; tipos: string[] } {
  const m = new RegExp(`update storage\\.buckets\\s+set allowed_mime_types = array\\[([^\\]]*)\\],\\s*file_size_limit = (\\d+)[^\\n]*\\s+where id = '${id}'`).exec(sql)
  assert.ok(m, `la migración no fija el espacio ${id}`)
  return { tope: Number(m[2]), tipos: [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) }
}

test('evidencias: caben las fotos que la aplicación acepta, con su tope', () => {
  const e = espacio('evidencias')
  const constantes = leer('lib/constants.ts')
  const tope = constante(constantes, 'TAMANO_MAX_BYTES')
  assert.ok(e.tope >= tope, `el espacio (${e.tope}) debe admitir lo que la aplicación deja subir (${tope})`)
  const tipos = lista(constantes, 'TIPOS_IMAGEN')
  assert.ok(tipos.length >= 6)
  assert.deepEqual([...e.tipos].sort(), [...tipos].sort(), 'el espacio admite exactamente los tipos de imagen de la aplicación')
  for (const t of e.tipos) assert.match(t, /^image\//, 'solo imágenes')
})

test('documentos: caben la factura, la planilla, el soporte de pago y las firmas', () => {
  const d = espacio('documentos')
  const factura = constante(leer('lib/factura-electronica.ts'), 'FACTURA_MAX_BYTES')
  const soporte = constante(leer('lib/soporte-pago.ts'), 'SOPORTE_PAGO_MAX_BYTES')
  const planilla = Number(/fileSize > (\d+) \* 1024 \* 1024/.exec(leer('app/actions/periodos.ts'))?.[1]) * MB
  assert.ok(planilla >= MB, 'encontré el tope de la planilla')
  // Las firmas pasan por una acción del servidor, que Next.js limita (next.config.ts): ese es su tope real, diga lo que diga el código.
  const accion = producto(`${/bodySizeLimit:\s*'(\d+)mb'/.exec(leer('next.config.ts'))?.[1]} * 1024 * 1024`)

  assert.ok(d.tope >= factura, `la factura electrónica (${factura}) debe caber en el espacio (${d.tope})`)
  assert.ok(d.tope >= soporte, 'el soporte de pago debe caber')
  assert.ok(d.tope >= planilla, 'la planilla debe caber')
  assert.ok(d.tope >= accion, `lo que una acción del servidor puede recibir (${accion}) debe caber`)
  assert.equal(d.tope, Math.max(factura, soporte, planilla, accion), 'y el espacio no pide más de lo necesario: el mayor de los topes de la aplicación')

  for (const t of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) assert.ok(d.tipos.includes(t), `admite ${t}`)
  assert.equal(d.tipos.length, 4, 'y nada más')
})

test('certificaciones: solo el PDF que genera el servidor', () => {
  const c = espacio('certificaciones')
  assert.deepEqual(c.tipos, ['application/pdf'])
  assert.equal(c.tope, 5 * MB)
})

test('ningún tope pasa del límite global del almacenamiento', () => {
  // Supabase no deja fijar un límite global menor que el de un espacio: estos tres deben estar por debajo del global.
  for (const id of ['evidencias', 'documentos', 'certificaciones']) assert.ok(espacio(id).tope <= GLOBAL_STORAGE, id)
})

test('la reversión devuelve los tres espacios a «sin tope y sin lista»', () => {
  const rev = leer('supabase/reversiones/033_buckets_restricciones.sql')
  assert.match(rev, /set allowed_mime_types = null,\s*file_size_limit = null\s+where id in \('evidencias', 'documentos', 'certificaciones'\)/)
})
