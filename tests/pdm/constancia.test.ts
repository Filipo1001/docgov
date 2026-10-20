import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  ALFABETO_DE_CODIGO, FORMA_DE_CODIGO_PDM, archivoQueCoincide, esCodigoPdm, esVersionAnterior, etiquetaDeTipo, fraseDeEstado, generarCodigoPdm, leerConstancia,
  nombreDeArchivoDeConstancia, normalizarCodigo, pareceCodigoPdm, requiereAdvertencia, rotuloDeConstancia, rutaDeVerificacion,
} from '@/lib/pdm/constancia'
import { FORMA_DE_HUELLA } from '@/lib/pdm/huella'

const HUELLA = 'ab'.repeat(32)
const crudo = (o: Record<string, unknown> = {}) => ({
  codigo: 'PDM-AAAA-BBBB', creada_en: '2026-10-19T15:00:00+00:00', estado: 'aprobado', vigente: true,
  indicador: { codigo: '1.1.1', nombre: 'Hogares atendidos', sector: 'Salud', unidad: 'Número', dependencia: 'Secretaría de Bienestar Social', anio: 2026, meta: 12 },
  reporte: { valor: 10, valor_anterior: 4, reportado_en: '2026-10-19T14:00:00+00:00', autor: 'ANA RIOS', es_correccion: false },
  validacion: { estado: 'aprobado', validador: 'LUIS GOMEZ', fecha: '2026-10-19T15:30:00+00:00' },
  anulacion: null, mas_reciente: null,
  archivos: [{ tipo: 'application/pdf', bytes: 1000, sha256: HUELLA, huella_calculada_en: '2026-10-19T14:00:01+00:00' }],
  ...o,
})

// ─── El código ────────────────────────────────────────────────────────────────

test('un código nuevo tiene la forma PDM-XXXX-XXXX con el alfabeto sin caracteres ambiguos', () => {
  const fijo = (n: number) => 7 % n
  const c = generarCodigoPdm(fijo)
  assert.match(c, FORMA_DE_CODIGO_PDM)
  assert.ok(esCodigoPdm(c))
  assert.equal(ALFABETO_DE_CODIGO.length, 32)
  for (const prohibida of ['I', 'L', 'O', 'U']) assert.ok(!ALFABETO_DE_CODIGO.includes(prohibida), prohibida)
  // Recorre todo el alfabeto: ningún carácter generado se sale de la forma exigida.
  let k = 0
  for (let i = 0; i < 40; i++) assert.match(generarCodigoPdm(() => k++ % 32), FORMA_DE_CODIGO_PDM)
})

test('la forma del código es la MISMA que vigila la base y el alfabeto es el de los documentos CD', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/072_pdm_constancias.sql', import.meta.url), 'utf8')
  assert.ok(sql.includes(`'${FORMA_DE_CODIGO_PDM.source}'`), 'la migración 072 exige la misma expresión que el código')
  const cd = readFileSync(new URL('../../lib/verificacion.ts', import.meta.url), 'utf8')
  assert.ok(cd.includes(`'${ALFABETO_DE_CODIGO}'`), 'mismo alfabeto que los códigos CD-')
})

test('la forma de la huella que lee la constancia es la misma que guarda la base', () => {
  assert.equal(leerConstancia(crudo())!.archivos[0].sha256, HUELLA)
  assert.ok(FORMA_DE_HUELLA.test(HUELLA))
  // Si alguien cambia la forma en `huella.ts`, esta prueba lo avisa: la de `constancia.ts` tendría que cambiar igual.
  for (const mala of ['AB'.repeat(32), 'ab'.repeat(31), 'zz'.repeat(32), '']) {
    assert.equal(FORMA_DE_HUELLA.test(mala), false, mala)
    assert.equal(leerConstancia(crudo({ archivos: [{ tipo: 'application/pdf', bytes: 1, sha256: mala, huella_calculada_en: null }] }))!.archivos[0].sha256, null, `«${mala}» se descarta`)
  }
})

test('un código se reconoce por su prefijo y se normaliza (mayúscula, sin espacios)', () => {
  assert.equal(normalizarCodigo('  pdm-aaaa-bbbb '), 'PDM-AAAA-BBBB')
  assert.ok(pareceCodigoPdm(' pdm-xyz'), 'por el prefijo, aunque esté incompleto')
  assert.ok(!pareceCodigoPdm('CD-AAAA-BBBB'), 'los documentos de contratos no se desvían')
  assert.ok(!pareceCodigoPdm(''))
  assert.ok(!esCodigoPdm('PDM-IIII-OOOO') && !esCodigoPdm('pdm-aaaa-bbbb') && !esCodigoPdm(null) && !esCodigoPdm(42))
  assert.equal(rutaDeVerificacion('PDM-AAAA-BBBB'), '/verificar/PDM-AAAA-BBBB')
  assert.equal(nombreDeArchivoDeConstancia('PDM-AAAA-BBBB'), 'constancia-PDM-AAAA-BBBB.pdf')
})

// ─── Lo que la base entrega ───────────────────────────────────────────────────

test('se lee lo que entrega la base, con los números como números y los nombres propios sin tocar', () => {
  const c = leerConstancia(crudo())!
  assert.equal(c.codigo, 'PDM-AAAA-BBBB'); assert.equal(c.estado, 'aprobado'); assert.equal(c.vigente, true)
  assert.equal(c.indicador.dependencia, 'Secretaría de Bienestar Social'); assert.equal(c.indicador.anio, 2026); assert.equal(c.indicador.meta, 12)
  assert.equal(c.reporte.valor, 10); assert.equal(c.reporte.valorAnterior, 4); assert.equal(c.reporte.autor, 'ANA RIOS')
  assert.deepEqual(c.validacion, { estado: 'aprobado', validador: 'LUIS GOMEZ', fecha: '2026-10-19T15:30:00+00:00' })
  assert.equal(c.anulacion, null); assert.equal(c.masReciente, null)
  assert.deepEqual(c.archivos, [{ tipo: 'application/pdf', bytes: 1000, sha256: HUELLA, huellaCalculadaEn: '2026-10-19T14:00:01+00:00' }])
})

test('los números que llegan como texto (numeric de la base) se leen; la meta ausente es null', () => {
  const c = leerConstancia(crudo({ reporte: { ...crudo().reporte, valor: '10.50', valor_anterior: null }, indicador: { ...crudo().indicador, meta: null } }))!
  assert.equal(c.reporte.valor, 10.5); assert.equal(c.reporte.valorAnterior, null); assert.equal(c.indicador.meta, null)
})

test('lo que no tiene forma de constancia no se lee (nunca se inventa una)', () => {
  assert.equal(leerConstancia(null), null)
  assert.equal(leerConstancia('PDM-AAAA-BBBB'), null)
  assert.equal(leerConstancia([]), null)
  assert.equal(leerConstancia(crudo({ codigo: 'CD-AAAA-BBBB' })), null, 'un código de otro tipo de documento')
  assert.equal(leerConstancia(crudo({ estado: 'aprobadísimo' })), null)
  assert.equal(leerConstancia(crudo({ indicador: null })), null)
  assert.equal(leerConstancia(crudo({ reporte: { ...crudo().reporte, valor: 'abc' } })), null)
})

test('lo que la base no debería entregar, aunque llegara, no pasa: solo se leen las llaves acordadas', () => {
  const sucio = crudo({
    texto: 'Se capacitó a doce madres cabeza de familia', motivo: 'Se reportó en el indicador equivocado', comentario: 'Falta la lista de asistencia',
    autor_id: 'u-1', reporte_id: 'r-1',
    archivos: [{ tipo: 'application/pdf', bytes: 5, sha256: HUELLA, huella_calculada_en: null, nombre: 'cedula-de-juan-perez.pdf', ruta: 'x/y/z.pdf' }],
    anulacion: { accion: 'anular', fecha: '2026-10-19T16:00:00+00:00', motivo: 'Se reportó en el indicador equivocado', actor: 'Admin' },
    validacion: { estado: 'devuelto', validador: 'LUIS', fecha: '2026-10-19T15:00:00+00:00', comentario: 'Falta la lista de asistencia' },
  })
  const salida = JSON.stringify(leerConstancia(sucio))
  for (const secreto of ['madres cabeza', 'equivocado', 'lista de asistencia', 'u-1', 'r-1', 'cedula-de-juan-perez', 'x/y/z.pdf', 'Admin']) {
    assert.ok(!salida.includes(secreto), `«${secreto}» no debe pasar`)
  }
})

test('los archivos sin huella la dejan en null, los inválidos se saltan, y un valor que no es lista da lista vacía', () => {
  const c = leerConstancia(crudo({ archivos: [{ tipo: 'image/png', bytes: 10, sha256: null, huella_calculada_en: null }, 'basura', null, { tipo: 'application/pdf', bytes: '20', sha256: HUELLA, huella_calculada_en: '2026-10-19T14:00:01+00:00' }] }))!
  assert.equal(c.archivos.length, 2)
  assert.equal(c.archivos[0].sha256, null); assert.equal(c.archivos[0].huellaCalculadaEn, null)
  assert.equal(c.archivos[1].bytes, 20)
  assert.deepEqual(leerConstancia(crudo({ archivos: 'nada' }))!.archivos, [])
})

test('la versión más reciente y la anulación se leen con su forma, y un estado raro de la más reciente cuenta como pendiente', () => {
  const c = leerConstancia(crudo({
    vigente: false,
    mas_reciente: { reportado_en: '2026-10-20T10:00:00+00:00', estado: 'devuelto', codigo: 'PDM-CCCC-DDDD' },
    anulacion: { accion: 'restaurar', fecha: '2026-10-21T10:00:00+00:00' },
  }))!
  assert.deepEqual(c.masReciente, { reportadoEn: '2026-10-20T10:00:00+00:00', estado: 'devuelto', codigo: 'PDM-CCCC-DDDD' })
  assert.deepEqual(c.anulacion, { accion: 'restaurar', fecha: '2026-10-21T10:00:00+00:00' })
  const raro = leerConstancia(crudo({ mas_reciente: { reportado_en: 'x', estado: 'otro', codigo: 'cualquiera' } }))!
  assert.equal(raro.masReciente!.estado, 'pendiente'); assert.equal(raro.masReciente!.codigo, null, 'un código malo no se enlaza')
})

// ─── Lo que se dice ───────────────────────────────────────────────────────────

test('un reporte que NO está aprobado lo dice con todas las letras, y que su valor no cuenta', () => {
  const dice = (estado: 'pendiente' | 'devuelto' | 'anulado' | 'aprobado', vigente = true) => fraseDeEstado({ estado, validacion: null, vigente })
  assert.match(dice('pendiente'), /TODAVÍA NO está aprobado/)
  assert.match(dice('pendiente'), /no cuenta/)
  assert.match(dice('devuelto'), /NO está aprobado/)
  assert.match(dice('anulado'), /anulado/)
  assert.match(dice('anulado'), /no es válido/)
  assert.doesNotMatch(dice('aprobado'), /NO está aprobado/)
  assert.match(dice('aprobado', false), /versión más reciente/, 'un aprobado ya reemplazado avisa que hay otra versión')
  assert.doesNotMatch(dice('aprobado', true), /versión más reciente/)
})

test('todo estado que no es «aprobado» pide una advertencia llamativa', () => {
  assert.equal(requiereAdvertencia('aprobado'), false)
  for (const e of ['pendiente', 'devuelto', 'anulado'] as const) assert.equal(requiereAdvertencia(e), true, e)
})

test('el tipo de un archivo se dice en una palabra, sin nombres', () => {
  assert.equal(etiquetaDeTipo('application/pdf'), 'PDF')
  assert.equal(etiquetaDeTipo('image/jpeg'), 'Imagen')
  assert.equal(etiquetaDeTipo('video/mp4'), 'Video')
  assert.equal(etiquetaDeTipo('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'Word')
  assert.equal(etiquetaDeTipo('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'Excel')
  assert.equal(etiquetaDeTipo('application/vnd.openxmlformats-officedocument.presentationml.presentation'), 'Presentación')
  assert.equal(etiquetaDeTipo('application/x-algo-raro'), 'Archivo')
})

test('comprobar un archivo: coincide solo por la huella (y el tamaño la confirma), sin importar mayúsculas', () => {
  const archivos = [
    { tipo: 'application/pdf', bytes: 1000, sha256: HUELLA, huellaCalculadaEn: null },
    { tipo: 'image/png', bytes: 50, sha256: null, huellaCalculadaEn: null },
  ]
  assert.equal(archivoQueCoincide(archivos, HUELLA, 1000), archivos[0])
  assert.equal(archivoQueCoincide(archivos, HUELLA.toUpperCase(), 1000), archivos[0])
  assert.equal(archivoQueCoincide(archivos, HUELLA, 999), null, 'misma huella con otro tamaño no coincide')
  assert.equal(archivoQueCoincide(archivos, 'cd'.repeat(32), 1000), null)
  assert.equal(archivoQueCoincide(archivos, '', 50), null, 'un archivo sin huella registrada no coincide con nada')
})

test('una versión aprobada y luego reemplazada se dice «Versión anterior», no un «Aprobado» a secas', () => {
  assert.equal(rotuloDeConstancia({ estado: 'aprobado', vigente: true }), 'Aprobado')
  assert.equal(rotuloDeConstancia({ estado: 'aprobado', vigente: false }), 'Versión anterior · Aprobado')
  assert.equal(rotuloDeConstancia({ estado: 'devuelto', vigente: false }), 'Versión anterior · Devuelto para corrección')
  assert.equal(rotuloDeConstancia({ estado: 'pendiente', vigente: true }), 'Pendiente de validación')
  assert.equal(rotuloDeConstancia({ estado: 'anulado', vigente: false }), 'Anulado', 'lo anulado se dice anulado, no «versión anterior»')
  assert.equal(esVersionAnterior({ estado: 'anulado', vigente: false }), false)
  assert.equal(esVersionAnterior({ estado: 'aprobado', vigente: false }), true)
  assert.equal(esVersionAnterior({ estado: 'aprobado', vigente: true }), false)
})
