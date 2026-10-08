/**
 * Las reglas del seguimiento por años y lo que se valida antes de mandar nada a la base.
 *
 * La base vuelve a exigir todo esto (migraciones 056–058): aquí se protege que la pantalla avise A TIEMPO y con las mismas
 * reglas, y que la lectura de números «a la colombiana» no cambie sin que nadie lo note.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANIOS_PLAN, anioDeParametro, anioIniciado, anioPorDefecto, estadoDelAnio, requiereReporte, resumirAnio, situacionEn,
} from '@/lib/pdm/seguimiento'
import {
  MAX_BYTES_EVIDENCIA, MAX_EVIDENCIAS, errorEnArchivos, errorEnComentario, errorEnReporte, errorEnValidacion, leerNumero, tipoDeArchivo,
} from '@/lib/pdm/seguimiento-acciones'

test('los años del plan', () => {
  assert.deepEqual([...ANIOS_PLAN], [2024, 2025, 2026, 2027])
  assert.equal(anioPorDefecto(2026), 2026)
  assert.equal(anioPorDefecto(2023), 2024)
  assert.equal(anioPorDefecto(2031), 2027)
})

test('el año de la dirección: solo si es del plan', () => {
  assert.equal(anioDeParametro('2025', 2026), 2025)
  assert.equal(anioDeParametro('2027', 2026), 2027)
  for (const malo of [undefined, '', '2023', '2028', '20 25', '2025.0', 'abc', '2025;drop']) {
    assert.equal(anioDeParametro(malo, 2026), 2026, String(malo))
  }
})

test('un año que no ha empezado no se reporta', () => {
  assert.equal(anioIniciado(2026, 2026), true)
  assert.equal(anioIniciado(2024, 2026), true)
  assert.equal(anioIniciado(2027, 2026), false)
  assert.deepEqual([2024, 2026, 2027].map(a => estadoDelAnio(a, 2026)), ['terminado', 'en_curso', 'proximo'])
})

test('la situación de un indicador en un año', () => {
  assert.equal(situacionEn(true, null), 'falta')
  assert.equal(situacionEn(false, null), null)
  assert.equal(situacionEn(false, { estado: 'aprobado' }), 'aprobado')
  assert.equal(situacionEn(true, { estado: 'devuelto' }), 'devuelto')
  assert.deepEqual(['falta', 'devuelto', 'pendiente', 'aprobado', null, undefined].map(s => requiereReporte(s as never)), [true, true, false, false, false, false])
})

test('el resumen de un año no pierde ni duplica a nadie', () => {
  const r = resumirAnio(['falta', 'falta', 'pendiente', 'aprobado', 'devuelto', null, null])
  assert.deepEqual(r, { esperados: 5, sinObligacion: 2, faltan: 2, porValidar: 1, aprobados: 1, devueltos: 1 })
  assert.equal(r.faltan + r.porValidar + r.aprobados + r.devueltos, r.esperados)
})

test('números escritos a la colombiana', () => {
  const casos: [string, number | null][] = [
    ['12', 12], ['12,5', 12.5], ['12.5', 12.5], ['1.234', 1234], ['1.234,5', 1234.5], ['1,234.5', 1234.5],
    ['1.234.567', 1234567], ['0.250', 0.25], ['0,5', 0.5], [',5', 0.5], ['  7 ', 7],
    ['', null], ['abc', null], ['1.2.3', null], ['1,2,3', null], ['-5', null], ['1e3', null], ['12.34.5', null],
  ]
  for (const [texto, esperado] of casos) assert.equal(leerNumero(texto), esperado, `«${texto}»`)
})

test('qué archivos se admiten', () => {
  assert.equal(tipoDeArchivo('a.pdf', 'application/pdf')?.ext, 'pdf')
  assert.equal(tipoDeArchivo('foto.JPG', '')?.ext, 'jpg')
  assert.equal(tipoDeArchivo('foto.heic', 'application/octet-stream')?.ext, 'heic')
  assert.equal(tipoDeArchivo('a.jpg', 'image/jpg')?.ext, 'jpg')
  assert.equal(tipoDeArchivo('charla.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'), null)
  assert.equal(tipoDeArchivo('video.mp4', 'video/mp4'), null)
  assert.equal(tipoDeArchivo('sinextension', ''), null)
  // Un tipo declarado que no se admite no se «arregla» por la extensión.
  assert.equal(tipoDeArchivo('truco.pdf', 'text/html'), null)
})

test('los archivos de un reporte: de 1 a 5, cada uno de hasta 10 MB', () => {
  const pdf = (n = 1, bytes = 1000) => Array.from({ length: n }, (_, k) => ({ nombre: `a${k}.pdf`, tipo: 'application/pdf', bytes }))
  assert.equal(MAX_EVIDENCIAS, 5)
  assert.equal(MAX_BYTES_EVIDENCIA, 10 * 1024 * 1024)
  assert.match(errorEnArchivos([])!, /al menos una/)
  assert.equal(errorEnArchivos([], 1), null)
  assert.equal(errorEnArchivos(pdf(5)), null)
  assert.match(errorEnArchivos(pdf(6))!, /hasta 5/)
  assert.match(errorEnArchivos(pdf(3), 3)!, /hasta 5/)
  assert.equal(errorEnArchivos(pdf(1, MAX_BYTES_EVIDENCIA)), null)
  assert.match(errorEnArchivos(pdf(1, MAX_BYTES_EVIDENCIA + 1))!, /máximo/)
  assert.match(errorEnArchivos(pdf(1, 0))!, /vacío/)
  assert.match(errorEnArchivos([{ nombre: '  ', tipo: 'application/pdf', bytes: 5 }])!, /nombre/)
  assert.match(errorEnArchivos([{ nombre: 'x.exe', tipo: 'application/x-msdownload', bytes: 5 }])!, /solo se admite/)
})

test('lo escrito en un reporte', () => {
  const bien = { valor: 3, texto: 'Se hicieron tres talleres' }
  assert.equal(errorEnReporte(bien, false), null)
  assert.match(errorEnReporte({ ...bien, valor: -1 }, false)!, /número/)
  assert.match(errorEnReporte({ ...bien, valor: Number.NaN }, false)!, /número/)
  assert.match(errorEnReporte({ ...bien, valor: '3' }, false)!, /número/)
  assert.match(errorEnReporte({ ...bien, texto: 'corto' }, false)!, /al menos/)
  assert.match(errorEnReporte(bien, true)!, /qué corriges/)
  assert.equal(errorEnReporte({ ...bien, motivo: 'Faltaba el acta firmada' }, true), null)
  assert.equal(errorEnReporte({ ...bien, valor: 0 }, false), null)
})

test('validar: aprobar no pide nada; devolver exige decir qué falta', () => {
  assert.equal(errorEnValidacion('aprobado', ''), null)
  assert.match(errorEnValidacion('devuelto', 'mal')!, /Explica/)
  assert.equal(errorEnValidacion('devuelto', 'Falta el acta firmada'), null)
  assert.match(errorEnValidacion('borrado', 'x')!, /no es válido/)
  const obs = [{ evidencia: 'e1', motivo: 'No abre' }]
  assert.equal(errorEnValidacion('devuelto', 'Falta el acta firmada', obs), null)
  assert.match(errorEnValidacion('aprobado', '', obs)!, /Solo se marcan/)
  assert.match(errorEnValidacion('devuelto', 'Falta el acta firmada', [...obs, ...obs])!, /dos veces/)
  assert.match(errorEnValidacion('devuelto', 'Falta el acta firmada', [{ evidencia: 'e1', motivo: ' ' }])!, /qué le pasa/)
  assert.equal(errorEnValidacion('devuelto', 'Falta el acta firmada', []), null)
})

test('comentarios', () => {
  assert.match(errorEnComentario('  ')!, /Escribe/)
  assert.equal(errorEnComentario('Revisar la fuente'), null)
  assert.match(errorEnComentario('x'.repeat(2001))!, /2000/)
})
