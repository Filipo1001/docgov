/**
 * Las reglas del seguimiento por años y lo que se valida antes de mandar nada a la base.
 *
 * La base vuelve a exigir todo esto (migraciones 056–058): aquí se protege que la pantalla avise A TIEMPO y con las mismas
 * reglas, y que la lectura de números «a la colombiana» no cambie sin que nadie lo note.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  ANIOS_PLAN, anioDeParametro, anioIniciado, anioPorDefecto, estadoDelAnio, requiereReporte, resumirAnio, situacionEn,
} from '@/lib/pdm/seguimiento'
import {
  AVISO_TEXTO_DESDE, MAX_BYTES_EVIDENCIA, MAX_BYTES_VIDEO, MAX_EVIDENCIAS, MAX_TEXTO_REPORTE, MENSAJE_DEMASIADOS_ARCHIVOS, MENSAJE_TEXTO_LARGO, TIPOS_EVIDENCIA, avisoDeLargo, miles, errorEnArchivos, esNombreDeEvidenciaEnAlmacen, esVideo, limiteDeTipo, errorEnComentario, errorEnReporte, errorEnValidacion, leerNumero, tipoDeArchivo,
} from '@/lib/pdm/seguimiento-acciones'
import { clasificarSeleccion } from '@/lib/pdm/evidencias-cola'

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
  assert.equal(tipoDeArchivo('charla.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')?.ext, 'pptx')
  assert.equal(tipoDeArchivo('charla.PPT', '')?.ext, 'ppt')
  assert.equal(tipoDeArchivo('video.mp4', 'video/mp4')?.ext, 'mp4')
  assert.equal(tipoDeArchivo('IMG_0001.MOV', 'video/quicktime')?.ext, 'mov')
  assert.equal(tipoDeArchivo('IMG_0001.mov', '')?.ext, 'mov')
  // Los demás formatos de video no se admiten: ni declarados ni por la extensión.
  assert.equal(tipoDeArchivo('video.avi', 'video/x-msvideo'), null)
  assert.equal(tipoDeArchivo('video.webm', 'video/webm'), null)
  assert.equal(tipoDeArchivo('video.mkv', ''), null)
  assert.equal(tipoDeArchivo('sinextension', ''), null)
  // Un tipo declarado que no se admite no se «arregla» por la extensión.
  assert.equal(tipoDeArchivo('truco.pdf', 'text/html'), null)
})

test('los archivos de un reporte: al menos uno, hasta el tope (que no se dice), de hasta 25 MB cada uno (100 MB los videos)', () => {
  const pdf = (n = 1, bytes = 1000) => Array.from({ length: n }, (_, k) => ({ nombre: `a${k}.pdf`, tipo: 'application/pdf', bytes }))
  assert.equal(MAX_EVIDENCIAS, 100)
  assert.equal(MAX_BYTES_EVIDENCIA, 25 * 1024 * 1024)
  assert.equal(MAX_BYTES_VIDEO, 100 * 1024 * 1024)
  assert.match(errorEnArchivos([])!, /al menos una/)
  assert.equal(errorEnArchivos([], 1), null)
  assert.equal(errorEnArchivos(pdf(5)), null, 'cinco ya no es el tope')
  assert.equal(errorEnArchivos(pdf(6)), null, 'ni seis')
  assert.equal(errorEnArchivos(pdf(30)), null, 'treinta tampoco (el tope de la 075)')
  assert.equal(errorEnArchivos(pdf(31)), null)
  assert.equal(errorEnArchivos(pdf(100)), null)
  assert.equal(errorEnArchivos(pdf(101)), MENSAJE_DEMASIADOS_ARCHIVOS)
  assert.equal(errorEnArchivos(pdf(10), 90), null, 'lo conservado de la versión anterior también cuenta')
  assert.equal(errorEnArchivos(pdf(10), 91), MENSAJE_DEMASIADOS_ARCHIVOS)
  assert.equal(errorEnArchivos(pdf(1, MAX_BYTES_EVIDENCIA)), null)
  assert.match(errorEnArchivos(pdf(1, MAX_BYTES_EVIDENCIA + 1))!, /máximo/)
  assert.match(errorEnArchivos(pdf(1, MAX_BYTES_EVIDENCIA + 1))!, /para un PDF es 25 MB/)
  assert.match(errorEnArchivos(pdf(1, 0))!, /vacío/)
  // Un video pesa más y su tope es otro; una presentación se mide como un documento.
  const video = (bytes: number) => [{ nombre: 'evento.mp4', tipo: 'video/mp4', bytes }]
  assert.equal(errorEnArchivos(video(MAX_BYTES_VIDEO)), null)
  assert.match(errorEnArchivos(video(MAX_BYTES_VIDEO + 1))!, /para un video es 100 MB/)
  assert.equal(errorEnArchivos(video(MAX_BYTES_EVIDENCIA + 1)), null)
  const pptx = (bytes: number) => [{ nombre: 'charla.pptx', tipo: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes }]
  assert.equal(errorEnArchivos(pptx(MAX_BYTES_EVIDENCIA)), null)
  assert.match(errorEnArchivos(pptx(MAX_BYTES_EVIDENCIA + 1))!, /para una presentación es 25 MB/)
  assert.match(errorEnArchivos([{ nombre: '  ', tipo: 'application/pdf', bytes: 5 }])!, /nombre/)
  assert.match(errorEnArchivos([{ nombre: 'x.exe', tipo: 'application/x-msdownload', bytes: 5 }])!, /solo se admite/)
})

test('la lista de tipos: sin repetidos, extensiones que el servidor acepta y un tope por tipo', () => {
  const mimes = TIPOS_EVIDENCIA.map(t => t.mime)
  assert.equal(new Set(mimes).size, mimes.length)
  // Al registrar, el servidor acepta como ruta un identificador con la extensión de CADA tipo (también `mp4`, que lleva un dígito).
  const id = '0b7e4f0e-2f5c-4c0e-8a8e-6f1f7a3b9c10'
  for (const t of TIPOS_EVIDENCIA) assert.equal(esNombreDeEvidenciaEnAlmacen(`${id}.${t.ext}`), true, t.mime)
  for (const malo of [`${id}.exe`, `${id}.`, `${id}`, `${id}.mp4.exe`, `${id.slice(1)}.pdf`, `../${id}.pdf`, `${id}.PDF`, `a/${id}.pdf`]) assert.equal(esNombreDeEvidenciaEnAlmacen(malo), false, malo)
  for (const t of TIPOS_EVIDENCIA) assert.equal(t.maxBytes, esVideo(t.mime) ? MAX_BYTES_VIDEO : MAX_BYTES_EVIDENCIA, t.mime)
  assert.equal(limiteDeTipo('video/quicktime'), MAX_BYTES_VIDEO)
  assert.equal(limiteDeTipo('application/pdf'), MAX_BYTES_EVIDENCIA)
  assert.equal(limiteDeTipo('application/x-msdownload'), null)
  assert.equal(esVideo('video/mp4'), true)
  assert.equal(esVideo('application/pdf'), false)
})

test('la lista de tipos de la aplicación dice lo mismo que la base (migraciones 073 y 074)', () => {
  // Lee las migraciones TAL COMO están escritas y compara con TIPOS_EVIDENCIA: si alguien añade un tipo o cambia un tope en un lado y
  // no en el otro, la aplicación aceptaría archivos que la base rechaza (o al revés) y se vería en el último paso. Cada dato sale de la
  // ÚLTIMA migración que lo define (una migración posterior cambia el tope sin repetir la lista de tipos del espacio de archivos).
  const dir = new URL('../../supabase/migrations/', import.meta.url)
  const migraciones = readdirSync(dir).filter(n => n.endsWith('.sql')).sort().map(n => ({ n, sql: readFileSync(new URL(n, dir), 'utf8') }))
  const ultima = (patron: RegExp) => {
    const m = migraciones.filter(x => patron.test(x.sql)).at(-1)
    assert.ok(m, `ninguna migración define ${patron}`)
    return m
  }

  const funcion = /create or replace function pdm_privado\.limite_de_evidencia[\s\S]*?\$f\$;/.exec(ultima(/create or replace function pdm_privado\.limite_de_evidencia/).sql)?.[0]
  assert.ok(funcion, 'la función existe en la migración')
  const delSql = new Map<string, number>()
  for (const m of funcion.matchAll(/when p_tipo in \(([^)]*)\)\s*then\s*(\d+)::bigint/g)) {
    for (const t of m[1].matchAll(/'([^']+)'/g)) delSql.set(t[1], Number(m[2]))
  }
  const deLaApp = new Map(TIPOS_EVIDENCIA.map(t => [t.mime, t.maxBytes]))
  assert.deepEqual([...delSql.keys()].sort(), [...deLaApp.keys()].sort(), 'los mismos tipos, ni uno más ni uno menos')
  for (const [mime, tope] of deLaApp) assert.equal(delSql.get(mime), tope, `el tope de ${mime}`)

  // El espacio de archivos y la restricción de la tabla, con el máximo de todos.
  const maximo = Math.max(...deLaApp.values())
  assert.match(ultima(/update storage\.buckets[\s\S]*?file_size_limit = \d+/).sql.match(/update storage\.buckets[\s\S]*?file_size_limit = \d+/)![0], new RegExp(`file_size_limit = ${maximo}$`), 'el espacio de archivos admite el máximo')
  assert.match(ultima(/pdm_evidencias_bytes_check check \(bytes > 0 and bytes <= \d+\)/).sql, new RegExp(`pdm_evidencias_bytes_check check \\(bytes > 0 and bytes <= ${maximo}\\)`), 'la restricción de la tabla admite el máximo')

  // Los tipos que acepta el espacio: los de la última migración que los fija.
  const bucket = /update storage\.buckets[\s\S]*?allowed_mime_types = array\[([\s\S]*?)\]/.exec(ultima(/allowed_mime_types = array\[[\s\S]*?'video\/mp4'/).sql)?.[1] ?? ''
  assert.deepEqual([...bucket.matchAll(/'([^']+)'/g)].map(m => m[1]).sort(), [...deLaApp.keys()].sort(), 'el espacio acepta los mismos tipos')
})

test('la aplicación no dice cuántos archivos caben: ningún mensaje lleva el número', () => {
  const pdf = (n: number) => Array.from({ length: n }, (_, k) => ({ nombre: `a${k}.pdf`, tipo: 'application/pdf', bytes: 1000 }))
  const mensajes = [
    MENSAJE_DEMASIADOS_ARCHIVOS,
    errorEnArchivos(pdf(MAX_EVIDENCIAS + 1))!,
    errorEnValidacion('devuelto', 'Hay archivos con problema', Array.from({ length: MAX_EVIDENCIAS + 1 }, (_, k) => ({ evidencia: `e${k}`, motivo: 'No abre' })))!,
    clasificarSeleccion([], MAX_EVIDENCIAS, [{ name: 'uno-mas.pdf', size: 1000, type: 'application/pdf', lastModified: 1 }]).rechazados[0]?.motivo,
  ]
  for (const m of mensajes) {
    assert.ok(typeof m === 'string' && m.length > 0, 'cada rechazo trae su mensaje')
    assert.doesNotMatch(m, new RegExp(`\\b(${MAX_EVIDENCIAS}|${MAX_EVIDENCIAS + 1}|cien|treinta|cinco|30|5)\\b`, 'i'), m)
  }
  // Y ninguna cadena de la pantalla o del servidor imprime la constante: lo que se ve no puede traer el número.
  const raiz = new URL('../../', import.meta.url).pathname
  const carpetas = ['components/pdm', 'lib/pdm', 'app/dashboard/plan-desarrollo', 'app/actions']
  const archivos: string[] = []
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const ruta = join(dir, n)
      if (statSync(ruta).isDirectory()) { if (n !== 'node_modules') recorrer(ruta); continue }
      if (/\.(ts|tsx)$/.test(n) && (dir.includes('pdm') || n.startsWith('pdm-'))) archivos.push(ruta)
    }
  }
  for (const c of carpetas) recorrer(join(raiz, c))
  assert.ok(archivos.length > 20, 'encontré los archivos del módulo')
  const imprimen = archivos.filter(f => /\$\{\s*MAX_EVIDENCIAS\s*\}/.test(readFileSync(f, 'utf8'))).map(f => f.slice(raiz.length))
  assert.deepEqual(imprimen, [], 'nadie debe escribir ${MAX_EVIDENCIAS} en un texto')
})

test('el tope de archivos de la aplicación dice lo mismo que la base (migraciones 075 y 077)', () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url)
  const migraciones = readdirSync(dir).filter(n => n.endsWith('.sql')).sort().map(n => ({ n, sql: readFileSync(new URL(n, dir), 'utf8') }))
  const ultima = (patron: RegExp) => {
    const m = migraciones.filter(x => patron.test(x.sql)).at(-1)
    assert.ok(m, `ninguna migración define ${patron}`)
    return m
  }
  // La función de la base que guarda el número.
  const f = ultima(/create or replace function pdm_privado\.max_evidencias\(\)/)
  const enLaFuncion = Number(/create or replace function pdm_privado\.max_evidencias\(\)[\s\S]*?as \$f\$ select (\d+) \$f\$/.exec(f.sql)?.[1])
  assert.equal(enLaFuncion, MAX_EVIDENCIAS, `${f.n}: pdm_privado.max_evidencias() dice lo mismo que MAX_EVIDENCIAS`)
  // La restricción de la tabla de validaciones (una observación por archivo) lleva el mismo número.
  const r = ultima(/add constraint pdm_validaciones_observaciones_check/)
  const enLaRestriccion = Number(/add constraint pdm_validaciones_observaciones_check\s+check \(jsonb_typeof\(observaciones\) = 'array' and jsonb_array_length\(observaciones\) <= (\d+)\)/.exec(r.sql)?.[1])
  assert.equal(enLaRestriccion, MAX_EVIDENCIAS, `${r.n}: la restricción de observaciones dice lo mismo`)
  // Las dos funciones que cuentan archivos consultan la función y no repiten un número.
  for (const nombre of ['pdm_reportar', 'pdm_validar']) {
    const d = ultima(new RegExp(`create or replace function public\\.${nombre}\\(`))
    const cuerpo = new RegExp(`create or replace function public\\.${nombre}\\([\\s\\S]*?end \\$f\\$;`).exec(d.sql)![0]
    assert.match(cuerpo, /pdm_privado\.max_evidencias\(\)/, `${d.n}: ${nombre} consulta el tope`)
    assert.doesNotMatch(cuerpo, /(>|>=|<|<=) (5|30)( |;|\n)/, `${d.n}: ${nombre} no conserva un tope viejo`)
  }
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
  // «¿Qué se hizo?» admite hasta 5.000 caracteres (migración 078); los espacios de los bordes no cuentan.
  assert.equal(errorEnReporte({ ...bien, texto: 'a'.repeat(MAX_TEXTO_REPORTE) }, false), null)
  assert.equal(errorEnReporte({ ...bien, texto: `  ${'a'.repeat(MAX_TEXTO_REPORTE)}\n ` }, false), null)
  assert.equal(errorEnReporte({ ...bien, texto: 'a'.repeat(MAX_TEXTO_REPORTE + 1) }, false), MENSAJE_TEXTO_LARGO)
})

test('el largo de «¿Qué se hizo?»: 5.000 caracteres, y el aviso de cuántos quedan solo al acercarse', () => {
  assert.equal(MAX_TEXTO_REPORTE, 5000)
  assert.equal(MENSAJE_TEXTO_LARGO, 'La descripción no puede pasar de 5.000 caracteres.')
  // El punto de miles es el mismo en todos los navegadores.
  assert.deepEqual([0, 7, 999, 1000, 5000, 12345, 1234567].map(miles), ['0', '7', '999', '1.000', '5.000', '12.345', '1.234.567'])
  // Nada hasta el 90 %; desde ahí, cuántos quedan; y al llegar, que llegó.
  assert.equal(AVISO_TEXTO_DESDE, 0.9)
  assert.equal(avisoDeLargo(0), null)
  assert.equal(avisoDeLargo(987), null, 'lo que escribió el reporte más largo de octubre no dice nada')
  assert.equal(avisoDeLargo(4499), null)
  assert.equal(avisoDeLargo(4500), 'Quedan 500 caracteres.')
  assert.equal(avisoDeLargo(3999 + 1000), 'Queda 1 carácter.')
  assert.equal(avisoDeLargo(5000), 'Llegaste al máximo: 5.000 caracteres.')
  assert.equal(avisoDeLargo(1000 - 2, 1000), 'Quedan 2 caracteres.')
})

test('el largo de «¿Qué se hizo?» de la aplicación dice lo mismo que la base (migración 078)', () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url)
  const migraciones = readdirSync(dir).filter(n => n.endsWith('.sql')).sort().map(n => ({ n, sql: readFileSync(new URL(n, dir), 'utf8') }))
  const ultima = (patron: RegExp) => {
    const m = migraciones.filter(x => patron.test(x.sql)).at(-1)
    assert.ok(m, `ninguna migración define ${patron}`)
    return m
  }
  const f = ultima(/create or replace function pdm_privado\.max_texto_reporte\(\)/)
  const enLaFuncion = Number(/create or replace function pdm_privado\.max_texto_reporte\(\)[\s\S]*?as \$f\$ select (\d+) \$f\$/.exec(f.sql)?.[1])
  assert.equal(enLaFuncion, MAX_TEXTO_REPORTE, `${f.n}: pdm_privado.max_texto_reporte() dice lo mismo que MAX_TEXTO_REPORTE`)
  const r = ultima(/add constraint pdm_borradores_texto_check/)
  const enLaRestriccion = Number(/add constraint pdm_borradores_texto_check check \(char_length\(texto\) <= (\d+)\)/.exec(r.sql)?.[1])
  assert.equal(enLaRestriccion, MAX_TEXTO_REPORTE, `${r.n}: la restricción del borrador dice lo mismo`)
  // Las dos funciones que reciben el texto consultan la función y no repiten un número.
  for (const nombre of ['pdm_reportar', 'pdm_borrador_guardar']) {
    const d = ultima(new RegExp(`create or replace function public\\.${nombre}\\(`))
    const cuerpo = new RegExp(`create or replace function public\\.${nombre}\\([\\s\\S]*?end \\$f\\$;`).exec(d.sql)![0]
    assert.match(cuerpo, /char_length\(v_texto\) > pdm_privado\.max_texto_reporte\(\)/, `${d.n}: ${nombre} consulta el largo`)
    assert.doesNotMatch(cuerpo, /char_length\(v_texto\) > \d/, `${d.n}: ${nombre} no repite un número`)
  }
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
