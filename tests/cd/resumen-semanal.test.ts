import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AcumuladoSemanal, MAX_ITEMS, asuntoDe, mensajeCampana, seccion, tituloCampana } from '@/lib/resumen-semanal'
import { emailResumenSemanal, EMAIL_TEMPLATES } from '@/lib/emails/templates'
import { repartirVencimientos } from '@/lib/vencimientos'

const sec = (clave: 'bandeja' | 'devueltos' | 'primerizos' | 'expediente', cifra: string, n = 2) =>
  seccion(clave, `Título ${clave}`, `Intro de ${clave}.`, Array.from({ length: n }, (_, i) => `Fila ${i + 1}`), cifra)

test('una sección recorta la lista y cuenta lo que no cabe', () => {
  const s = sec('bandeja', '12 por revisar', 12)
  assert.equal(s.items.length, MAX_ITEMS)
  assert.equal(s.restantes, 12 - MAX_ITEMS)
  assert.equal(sec('bandeja', 'x', 3).restantes, 0)
})

test('quien no aportó nada no existe; quien aportó una cosa recibe un solo resumen', () => {
  const a = new AcumuladoSemanal()
  a.aportar('sec1', sec('bandeja', '5 por revisar'))
  a.aportar('sec1', sec('devueltos', '2 devueltos sin corregir'))
  a.aportar('sec2', sec('bandeja', '1 por revisar'))
  assert.deepEqual(a.personas().sort(), ['sec1', 'sec2'])
  assert.equal(a.datosDe('nadie'), null)
  assert.equal(a.datosDe('sec1')!.secciones.length, 2, 'dos secciones, un solo resumen')
})

test('las secciones salen siempre en el mismo orden: bandeja, devueltos, primerizos, expediente', () => {
  const a = new AcumuladoSemanal()
  a.aportar('p', sec('expediente', 'e'))
  a.aportar('p', sec('primerizos', 'p'))
  a.aportar('p', sec('bandeja', 'b'))
  a.aportar('p', sec('devueltos', 'd'))
  assert.deepEqual(a.datosDe('p')!.secciones.map(s => s.clave), ['bandeja', 'devueltos', 'primerizos', 'expediente'])
})

test('un vencimiento vacío no crea un resumen', () => {
  const a = new AcumuladoSemanal()
  a.aportarVencimientos('p', { en30: [], en60: [] })
  assert.equal(a.personas().length, 0)
  assert.equal(a.datosDe('p'), null)
})

test('el asunto resume hasta tres cosas y el resto se corta', () => {
  const venc = repartirVencimientos([{ numero: 'A', contratista: 'X', fechaFin: '2026-12-15', supervisorId: null }], '2026-11-16')
  assert.equal(asuntoDe({ secciones: [sec('bandeja', '5 por revisar')], vencimientos: venc }), 'Resumen semanal: 5 por revisar, 1 contrato por vencer')
  assert.equal(
    asuntoDe({ secciones: [sec('bandeja', 'a'), sec('devueltos', 'b'), sec('expediente', 'c')], vencimientos: venc }),
    'Resumen semanal: a, b, c y más',
  )
})

test('la campana tiene un título corto y un texto sin listas', () => {
  const a = new AcumuladoSemanal()
  a.aportar('p', sec('bandeja', '5 por revisar'))
  const d = a.datosDe('p')!
  assert.equal(tituloCampana(d), 'Esta semana: 5 por revisar')
  assert.match(mensajeCampana(d), /^Intro de bandeja\. El detalle está en tu correo\.$/)
})

test('el correo del resumen pinta las secciones, los vencimientos y avisa lo que no cabe', () => {
  const venc = repartirVencimientos([{ numero: '017', contratista: 'Herney Giraldo', fechaFin: '2026-12-15', supervisorId: null }], '2026-11-16')
  const a = new AcumuladoSemanal()
  a.aportar('p', sec('bandeja', '12 por revisar', 12))
  a.aportarVencimientos('p', venc)
  const datos = a.datosDe('p')!
  const { subject, html } = emailResumenSemanal({ nombreDestinatario: 'Yorledy', mes: '', anio: 0, contrato: '', datos })
  assert.equal(subject, 'Resumen semanal: 12 por revisar, 1 contrato por vencer')
  assert.match(html, /Hola Yorledy/)
  assert.match(html, /Título bandeja/)
  assert.match(html, /y 4 más/)
  assert.match(html, /Contratos por vencer/)
  assert.match(html, /017/)
  assert.equal(EMAIL_TEMPLATES['resumen_semanal'], emailResumenSemanal, 'registrado para el despachador')
})
