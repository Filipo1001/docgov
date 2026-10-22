import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { test } from 'node:test'
import JSZip from 'jszip'
import {
  MAX_BYTES_DE_PAQUETE, armarPaquete, estadoDeHuella, indicesQueCaben, listadoDeHuellas, nombreDeArchivoDePaquete, nombreEnPaquete, nombreSeguroDeArchivo, textoLeeme,
  type EvidenciaParaPaquete,
} from '@/lib/pdm/paquete'

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const CODIGO = 'PDM-AAAA-BBBB'
const URL = 'https://app.contratistadigital.com/verificar/PDM-AAAA-BBBB'

// ─── Nombres ──────────────────────────────────────────────────────────────────

test('un nombre nunca sale de su carpeta ni lleva caracteres que algún sistema prohíba', () => {
  for (const malo of ['../../etc/passwd', '..\\..\\Windows\\system32\\x.dll', '/abs/ruta/x.pdf', 'a/b\\c.pdf', 'con:algo?.pdf', 'nombre"raro".pdf', 'x\u0000y.pdf', 'sal\u0007to.pdf', '<script>.pdf']) {
    const n = nombreSeguroDeArchivo(malo)
    assert.doesNotMatch(n, /[\\/:*?"<>|]/, `«${malo}» → «${n}»`)
    assert.doesNotMatch(n, /\.\./, `«${malo}» → «${n}»`)
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(n, /[\u0000-\u001f]/)
    assert.ok(!n.startsWith('.') && !n.startsWith('/'), n)
  }
})

test('el nombre conserva lo que es útil (la extensión y los espacios) y pierde las tildes: dentro del ZIP solo hay ASCII', () => {
  assert.equal(nombreSeguroDeArchivo('Informe de gestión 2026.pdf'), 'Informe de gestion 2026.pdf')
  assert.equal(nombreSeguroDeArchivo('  foto   del   evento .JPG '), 'foto del evento.JPG')
  assert.equal(nombreSeguroDeArchivo('Ñandú.docx'), 'Nandu.docx')
  assert.equal(nombreSeguroDeArchivo('.oculto'), 'oculto')
})

test('un nombre vacío, de puros puntos o reservado de Windows se arregla; sin extensión se pone la del tipo', () => {
  assert.equal(nombreSeguroDeArchivo(''), 'archivo')
  assert.equal(nombreSeguroDeArchivo('...'), 'archivo')
  assert.equal(nombreSeguroDeArchivo('   '), 'archivo')
  assert.equal(nombreSeguroDeArchivo('CON.txt'), '_CON.txt')
  assert.equal(nombreSeguroDeArchivo('nul'), '_nul')
  assert.equal(nombreSeguroDeArchivo('LPT1.pdf'), '_LPT1.pdf')
  assert.equal(nombreSeguroDeArchivo('informe', 'application/pdf'), 'informe.pdf')
  assert.equal(nombreSeguroDeArchivo('foto', 'image/jpeg'), 'foto.jpg')
  assert.equal(nombreSeguroDeArchivo('foto', 'tipo/desconocido'), 'foto')
})

test('dentro del ZIP todo nombre es ASCII imprimible, venga lo que venga', () => {
  for (const raro of ['canción — ñoño ✓.pdf', '日本語.pdf', 'emoji 🎉.png', 'Ünïcödé.xlsx', 'ﬁle.pdf']) {
    const n = nombreSeguroDeArchivo(raro)
    assert.match(n, /^[\x20-\x7e]+$/, `«${raro}» → «${n}»`)
    assert.ok(n.length > 0 && !n.startsWith('.'))
  }
})

test('un nombre larguísimo se recorta sin perder la extensión', () => {
  const n = nombreSeguroDeArchivo(`${'a'.repeat(400)}.pdf`)
  assert.ok(n.length <= 110, String(n.length))
  assert.ok(n.endsWith('.pdf'))
})

test('el número da el orden y hace único el nombre aunque dos archivos se llamen igual', () => {
  assert.equal(nombreEnPaquete(0, 'a.pdf'), '01-a.pdf')
  assert.equal(nombreEnPaquete(1, 'a.pdf'), '02-a.pdf')
  assert.equal(nombreEnPaquete(11, '../x.pdf'), '12-_x.pdf')
  assert.notEqual(nombreEnPaquete(0, 'a.pdf'), nombreEnPaquete(1, 'a.pdf'))
})

// ─── Textos ───────────────────────────────────────────────────────────────────

test('el estado de la huella: coincide, no coincide o sin registro', () => {
  assert.equal(estadoDeHuella('ab', 'ab'), 'coincide')
  assert.equal(estadoDeHuella('ab', 'cd'), 'no_coincide')
  assert.equal(estadoDeHuella(null, 'cd'), 'sin_registro')
})

test('el listado de huellas tiene el formato de sha256sum: huella, dos espacios, ruta; una línea por archivo y nada más', () => {
  const l = listadoDeHuellas([{ sha256: 'a'.repeat(64), nombreEnPaquete: '01-x.pdf' }, { sha256: 'b'.repeat(64), nombreEnPaquete: '02-y.jpg' }])
  assert.equal(l, `${'a'.repeat(64)}  archivos/01-x.pdf\n${'b'.repeat(64)}  archivos/02-y.jpg\n`)
  assert.equal(listadoDeHuellas([]), '')
  for (const linea of l.trim().split('\n')) assert.match(linea, /^[0-9a-f]{64} {2}archivos\/\S+$/)
})

test('el LEEME dice el estado vivo, cómo comprobar y, archivo por archivo, si coincide', () => {
  const t = textoLeeme({
    codigo: CODIGO, url: URL, generadoEn: '19 oct 2026 · 10:42',
    archivos: [
      { nombreEnPaquete: '01-a.pdf', nombreOriginal: 'a.pdf', tipo: 'application/pdf', bytes: 2048, sha256: 'a'.repeat(64), registrada: 'a'.repeat(64), estado: 'coincide' },
      { nombreEnPaquete: '02-b.jpg', nombreOriginal: 'b.jpg', tipo: 'image/jpeg', bytes: 10, sha256: 'b'.repeat(64), registrada: null, estado: 'sin_registro' },
    ],
  })
  assert.match(t, new RegExp(CODIGO)); assert.match(t, /19 oct 2026 · 10:42/); assert.ok(t.includes(URL))
  assert.match(t, /FOTO del momento/); assert.match(t, /shasum -a 256 -c huellas-sha256.txt/); assert.match(t, /Get-FileHash/)
  assert.match(t, /COINCIDE con la huella registrada/); assert.match(t, /sin huella registrada al subirlo/)
  assert.doesNotMatch(t, /ATENCIÓN/, 'sin discrepancias no hay alarma')
})

// ─── El ZIP ───────────────────────────────────────────────────────────────────

function entrada(evidencias: EvidenciaParaPaquete[], almacen: Record<string, Uint8Array>, extra: Partial<Parameters<typeof armarPaquete>[0]> = {}) {
  return { codigo: CODIGO, url: URL, constanciaPdf: new TextEncoder().encode('%PDF-1.4 constancia de prueba'), evidencias, generadoEn: '19 oct 2026 · 10:42',
    leer: async (ruta: string) => { const d = almacen[ruta]; if (!d) throw new Error('no está'); return d }, ...extra }
}

test('el paquete trae la constancia, los originales byte por byte, el listado de huellas y el LEEME', async () => {
  const a = randomBytes(5000), b = randomBytes(1234)
  const ev: EvidenciaParaPaquete[] = [
    { ruta: 'r/a', nombre: 'Informe de gestión.pdf', tipo: 'application/pdf', bytes: a.length, sha256: sha(a) },
    { ruta: 'r/b', nombre: 'foto.jpg', tipo: 'image/jpeg', bytes: b.length, sha256: sha(b) },
  ]
  const r = await armarPaquete(entrada(ev, { 'r/a': a, 'r/b': b }))
  assert.ok(r.ok)
  const zip = await JSZip.loadAsync(r.zip)
  assert.deepEqual(Object.keys(zip.files).sort(), ['LEEME.txt', `constancia-${CODIGO}.pdf`, 'archivos/', 'archivos/01-Informe de gestion.pdf', 'archivos/02-foto.jpg', 'huellas-sha256.txt'].sort())
  assert.deepEqual(new Uint8Array(await zip.file('archivos/01-Informe de gestion.pdf')!.async('uint8array')), new Uint8Array(a), 'el original, byte por byte')
  assert.match(await zip.file('LEEME.txt')!.async('string'), /Nombre original: Informe de gestión\.pdf/, 'el nombre original, con su tilde, queda en el LEEME')
  assert.deepEqual(new Uint8Array(await zip.file('archivos/02-foto.jpg')!.async('uint8array')), new Uint8Array(b))
  assert.match(await zip.file(`constancia-${CODIGO}.pdf`)!.async('string'), /constancia de prueba/)
  assert.equal(r.discrepancias, 0); assert.equal(r.bytes, a.length + b.length); assert.equal(r.archivos.length, 2)
  assert.ok(r.archivos.every(x => x.estado === 'coincide'))
})

test('el listado del ZIP se comprueba de verdad: cada huella es la de los bytes que van dentro', async () => {
  const a = randomBytes(777), b = randomBytes(31)
  const ev: EvidenciaParaPaquete[] = [
    { ruta: 'r/a', nombre: 'a.pdf', tipo: 'application/pdf', bytes: a.length, sha256: sha(a) },
    { ruta: 'r/b', nombre: 'b.png', tipo: 'image/png', bytes: b.length, sha256: null },
  ]
  const r = await armarPaquete(entrada(ev, { 'r/a': a, 'r/b': b }))
  assert.ok(r.ok)
  const zip = await JSZip.loadAsync(r.zip)
  const listado = await zip.file('huellas-sha256.txt')!.async('string')
  // Lo mismo que haría `shasum -a 256 -c`: por cada línea, calcular la huella del archivo nombrado y compararla.
  const lineas = listado.trim().split('\n')
  assert.equal(lineas.length, 2)
  for (const linea of lineas) {
    const [, huella, ruta] = /^([0-9a-f]{64}) {2}(.+)$/.exec(linea)!
    assert.equal(sha(new Uint8Array(await zip.file(ruta)!.async('uint8array'))), huella, ruta)
  }
})

test('un archivo que no coincide con lo registrado va en el paquete, MARCADO, y se cuenta la discrepancia', async () => {
  const a = randomBytes(100)
  const ev: EvidenciaParaPaquete[] = [{ ruta: 'r/a', nombre: 'a.pdf', tipo: 'application/pdf', bytes: a.length, sha256: 'f'.repeat(64) }]
  const r = await armarPaquete(entrada(ev, { 'r/a': a }))
  assert.ok(r.ok)
  assert.equal(r.discrepancias, 1)
  assert.equal(r.archivos[0].estado, 'no_coincide')
  const zip = await JSZip.loadAsync(r.zip)
  assert.ok(zip.file('archivos/01-a.pdf'), 'el archivo no se esconde')
  const leeme = await zip.file('LEEME.txt')!.async('string')
  assert.match(leeme, /ATENCIÓN/); assert.match(leeme, /NO COINCIDE/)
  assert.equal(await zip.file('huellas-sha256.txt')!.async('string'), `${sha(a)}  archivos/01-a.pdf\n`, 'el listado dice la huella REAL de lo empaquetado, no la registrada')
})

test('nombres repetidos o peligrosos no chocan ni se salen de la carpeta', async () => {
  const x = randomBytes(10), y = randomBytes(11), z = randomBytes(12)
  const ev: EvidenciaParaPaquete[] = [
    { ruta: '1', nombre: 'soporte.pdf', tipo: 'application/pdf', bytes: 10, sha256: sha(x) },
    { ruta: '2', nombre: 'soporte.pdf', tipo: 'application/pdf', bytes: 11, sha256: sha(y) },
    { ruta: '3', nombre: '../../../etc/passwd', tipo: 'application/pdf', bytes: 12, sha256: sha(z) },
  ]
  const r = await armarPaquete(entrada(ev, { '1': x, '2': y, '3': z }))
  assert.ok(r.ok)
  const nombres = Object.keys((await JSZip.loadAsync(r.zip)).files)
  assert.equal(new Set(nombres).size, nombres.length, 'sin nombres repetidos')
  for (const n of nombres) { assert.ok(!n.startsWith('/'), n); assert.ok(!n.split('/').includes('..'), n) }
  assert.ok(nombres.includes('archivos/01-soporte.pdf') && nombres.includes('archivos/02-soporte.pdf'))
})

test('un archivo que no se puede leer: no se entrega un paquete incompleto', async () => {
  const a = randomBytes(10)
  const ev: EvidenciaParaPaquete[] = [
    { ruta: 'r/a', nombre: 'a.pdf', tipo: 'application/pdf', bytes: 10, sha256: sha(a) },
    { ruta: 'r/falta', nombre: 'b.pdf', tipo: 'application/pdf', bytes: 10, sha256: null },
  ]
  const r = await armarPaquete(entrada(ev, { 'r/a': a }))
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.motivo === 'ilegible' && /No se pudo leer/.test(r.error))
})

test('lo que no cabe NO tumba el paquete: sale con lo que cabe y declara lo que dejó fuera, con su huella registrada', async () => {
  const pequeno = randomBytes(2000), mediano = randomBytes(5000)
  const huellaDelVideo = 'a'.repeat(64)
  const ev: EvidenciaParaPaquete[] = [
    { ruta: 'r/video', nombre: 'Rendición de cuentas.mp4', tipo: 'video/mp4', bytes: MAX_BYTES_DE_PAQUETE - 1000, sha256: huellaDelVideo },
    { ruta: 'r/a', nombre: 'acta.pdf', tipo: 'application/pdf', bytes: pequeno.length, sha256: sha(pequeno) },
    { ruta: 'r/b', nombre: 'foto.jpg', tipo: 'image/jpeg', bytes: mediano.length, sha256: sha(mediano) },
  ]
  const leidas: string[] = []
  const r = await armarPaquete(entrada(ev, { 'r/a': pequeno, 'r/b': mediano }, { leer: async (ruta: string) => { leidas.push(ruta); return ruta === 'r/a' ? pequeno : mediano } }))
  assert.ok(r.ok)
  assert.deepEqual(leidas, ['r/a', 'r/b'], 'el video no se leyó: lo declarado ya decía que no cabía')
  assert.equal(r.omitidos.length, 1)
  assert.deepEqual(r.omitidos[0], { numero: 1, nombreOriginal: 'Rendición de cuentas.mp4', tipo: 'video/mp4', bytes: MAX_BYTES_DE_PAQUETE - 1000, registrada: huellaDelVideo })
  const zip = await JSZip.loadAsync(r.zip)
  // Los números son los del reporte (el video era el 1): los que entran conservan el suyo, sin renumerar.
  assert.deepEqual(Object.keys(zip.files).sort(), ['LEEME.txt', `constancia-${CODIGO}.pdf`, 'archivos/', 'archivos/02-acta.pdf', 'archivos/03-foto.jpg', 'huellas-sha256.txt'].sort())
  const leeme = await zip.file('LEEME.txt')!.async('string')
  assert.match(leeme, /NO INCLUYE TODOS LOS ARCHIVOS/)
  assert.match(leeme, /ARCHIVOS QUE NO ESTÁN EN ESTE PAQUETE/)
  assert.match(leeme, /01 · Rendición de cuentas\.mp4/)
  assert.ok(leeme.includes(`SHA-256 registrada al subirlo  ${huellaDelVideo}`), 'la huella registrada del video, dicha como registrada')
  // El listado de huellas solo lleva lo que está dentro: `shasum -c` no se queja de archivos que no existen.
  const listado = await zip.file('huellas-sha256.txt')!.async('string')
  assert.equal(listado.trim().split('\n').length, 2)
  assert.ok(!listado.includes(huellaDelVideo))
  assert.equal(r.discrepancias, 0)
})

test('se llevan primero los archivos más pequeños, y a igual tamaño el orden del reporte', () => {
  assert.deepEqual([...indicesQueCaben([100, 10, 50, 10], 70)].sort(), [1, 3, 2].sort(), 'caben 10 + 10 + 50 = 70')
  assert.deepEqual([...indicesQueCaben([100, 10, 50, 10], 69)].sort(), [1, 3].sort())
  assert.deepEqual([...indicesQueCaben([5, 5, 5], 10)].sort(), [0, 1], 'empate: los primeros del reporte')
  assert.deepEqual([...indicesQueCaben([], 10)], [])
  assert.deepEqual([...indicesQueCaben([MAX_BYTES_DE_PAQUETE + 1], MAX_BYTES_DE_PAQUETE)], [])
  assert.deepEqual([...indicesQueCaben([MAX_BYTES_DE_PAQUETE], MAX_BYTES_DE_PAQUETE)], [0], 'justo en el tope, cabe')
  assert.deepEqual([...indicesQueCaben([-5, 3], 10)].sort(), [0, 1], 'un tamaño absurdo (negativo) no rompe la cuenta')
})

test('seis archivos de 25 MB caben enteros; con 30 de 25 MB caben seis y los demás se declaran', () => {
  const MB = 1024 * 1024
  assert.equal(indicesQueCaben(Array(6).fill(25 * MB), MAX_BYTES_DE_PAQUETE).size, 6)
  assert.equal(indicesQueCaben(Array(30).fill(25 * MB), MAX_BYTES_DE_PAQUETE).size, 6, 'los 24 que sobran quedan fuera, no tumban el paquete')
})

test('si lo que se lee pesa más de lo declarado y ya no cabe, se deja fuera igual', async () => {
  const grande = new Uint8Array(MAX_BYTES_DE_PAQUETE + 5)
  const r = await armarPaquete(entrada([{ ruta: 'r/g', nombre: 'g.bin', tipo: 'application/octet-stream', bytes: 5, sha256: null }], { 'r/g': grande }))
  assert.ok(r.ok)
  assert.equal(r.archivos.length, 0); assert.equal(r.omitidos.length, 1)
  assert.equal(r.omitidos[0].bytes, MAX_BYTES_DE_PAQUETE + 5, 'se dice lo que pesa de verdad')
  const leeme = await (await JSZip.loadAsync(r.zip)).file('LEEME.txt')!.async('string')
  assert.match(leeme, /Ningún archivo cupo/)
})

test('una versión sin archivos da un paquete con la constancia y un listado vacío, sin error', async () => {
  const r = await armarPaquete(entrada([], {}))
  assert.ok(r.ok)
  const zip = await JSZip.loadAsync(r.zip)
  assert.ok(zip.file(`constancia-${CODIGO}.pdf`))
  assert.equal(await zip.file('huellas-sha256.txt')!.async('string'), '')
  assert.match(await zip.file('LEEME.txt')!.async('string'), /no tiene archivos/)
  assert.equal(r.discrepancias, 0)
})

test('el nombre del ZIP lleva el código', () => {
  assert.equal(nombreDeArchivoDePaquete(CODIGO), 'paquete-PDM-AAAA-BBBB.zip')
})
