import assert from 'node:assert/strict'
import { clasificarSeleccion, motivoDeRechazo, consejoDeFormato, resumenDeSubida, mensajeDeFallos, entradaNueva, claveDe, esImagenDibujable, FORMATOS_ADMITIDOS, type ArchivoLike, type ArchivoEnCola } from '@/lib/pdm/evidencias-cola'
import { subirCola, type CambioDeSubida } from '@/lib/pdm/subir-cola'

let n = 0
const ok = (t: string, f: () => void | Promise<void>) => Promise.resolve(f()).then(() => { n++; console.log('  ✓', t) })
const f = (name: string, size = 1000, type = '', lastModified = 1): ArchivoLike => ({ name, size, type, lastModified })
const MB = 1024 * 1024

async function main() {
  console.log('qué se acepta y qué se rechaza')
  await ok('los cinco tipos admitidos, juntos, pasan', () => {
    const r = clasificarSeleccion([], 0, [f('a.pdf', 5, 'application/pdf'), f('b.jpg', 5, 'image/jpeg'), f('c.docx', 5, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), f('d.xlsx', 5, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), f('e.png', 5, 'image/png')])
    assert.equal(r.aceptados.length, 5); assert.equal(r.rechazados.length, 0)
  })
  await ok('un navegador que no declara tipo: se resuelve por la extensión', () => {
    const r = clasificarSeleccion([], 0, [f('informe.docx', 5, ''), f('foto.HEIC', 5, ''), f('x.xls', 5, 'application/octet-stream')])
    assert.equal(r.aceptados.length, 3)
  })
  await ok('uno malo NO tumba a los buenos, y cada rechazo trae su motivo propio', () => {
    const r = clasificarSeleccion([], 0, [f('bien.pdf', 5, 'application/pdf'), f('charla.pptx', 5, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'), f('evento.mp4', 5, 'video/mp4'), f('vacio.pdf', 0, 'application/pdf'), f('enorme.pdf', 12 * MB, 'application/pdf'), f('foto.jpg', 5, 'image/jpeg')])
    assert.deepEqual(r.aceptados.map(x => x.name), ['bien.pdf', 'foto.jpg'])
    assert.equal(r.rechazados.length, 4)
    const m = Object.fromEntries(r.rechazados.map(x => [x.nombre, x.motivo]))
    assert.match(m['charla.pptx'], /presentaciones.*PDF/); assert.match(m['evento.mp4'], /videos/)
    assert.equal(m['vacio.pdf'], 'Está vacío.'); assert.match(m['enorme.pdf'], /12 MB y el máximo es 10 MB/)
    for (const x of r.rechazados) assert.ok(!x.motivo.includes(x.nombre), 'el motivo no repite el nombre')
  })
  await ok('formato desconocido: se dice cuáles sí se admiten', () => {
    assert.equal(consejoDeFormato('cosa.xyz'), FORMATOS_ADMITIDOS); assert.equal(consejoDeFormato('sinextension'), FORMATOS_ADMITIDOS)
    assert.match(consejoDeFormato('datos.csv'), /xlsx/); assert.match(consejoDeFormato('logo.GIF'), /JPG o PNG/)
  })
  await ok('exactamente 10 MB sirve; un byte más, no', () => {
    assert.equal(motivoDeRechazo(f('a.pdf', 10 * MB, 'application/pdf')), null); assert.match(motivoDeRechazo(f('a.pdf', 10 * MB + 1, 'application/pdf'))!, /Pesa/)
  })
  await ok('nombre vacío o larguísimo', () => {
    assert.match(motivoDeRechazo(f('   ', 5, 'application/pdf'))!, /nombre/); assert.match(motivoDeRechazo(f('x'.repeat(201) + '.pdf', 5, 'application/pdf'))!, /nombre/)
  })
  await ok('con 2 en cola y 1 conservada caben exactamente 2 más, en el orden elegido', () => {
    const ya = [f('1.pdf', 5, 'application/pdf'), f('2.pdf', 5, 'application/pdf')]
    const r = clasificarSeleccion(ya, 1, [f('a.pdf', 5, 'application/pdf'), f('b.pdf', 5, 'application/pdf'), f('c.pdf', 5, 'application/pdf')])
    assert.deepEqual(r.aceptados.map(x => x.name), ['a.pdf', 'b.pdf']); assert.deepEqual(r.rechazados.map(x => x.nombre), ['c.pdf']); assert.match(r.rechazados[0].motivo, /hasta 5/)
  })
  await ok('repetidos (ya adjuntos o dos veces en la misma selección) se ignoran sin ruido', () => {
    const a = f('a.pdf', 5, 'application/pdf', 7)
    const r = clasificarSeleccion([a], 0, [{ ...a }, f('b.pdf', 5, 'application/pdf'), f('b.pdf', 5, 'application/pdf')])
    assert.equal(r.repetidos, 2); assert.deepEqual(r.aceptados.map(x => x.name), ['b.pdf']); assert.equal(r.rechazados.length, 0)
  })
  await ok('mismo nombre pero distinto contenido (tamaño) NO es repetido', () => {
    const r = clasificarSeleccion([f('foto.jpg', 5, 'image/jpeg')], 0, [f('foto.jpg', 6, 'image/jpeg')]); assert.equal(r.aceptados.length, 1)
  })
  await ok('vista previa', () => {
    assert.equal(esImagenDibujable(f('a.jpg', 1, 'image/jpeg')), true); assert.equal(esImagenDibujable(f('a.heic', 1, 'image/heic')), false); assert.equal(esImagenDibujable(f('a.HEIC', 1, '')), false); assert.equal(esImagenDibujable(f('a.pdf', 1, 'application/pdf')), false)
  })

  console.log('cómo va la subida')
  const e = (nombre: string, size: number, estado: ArchivoEnCola['estado'], progreso = 0): ArchivoEnCola => ({ ...entradaNueva(f(nombre, size)), estado, progreso })
  await ok('el porcentaje pesa por tamaño, no por cantidad', () => {
    // 8 MB subido + 2 MB sin empezar = 80 %; no 50 %
    assert.equal(resumenDeSubida([e('a', 8 * MB, 'subido'), e('b', 2 * MB, 'listo')]).porcentaje, 80)
    assert.equal(resumenDeSubida([e('a', 4 * MB, 'subiendo', 0.5), e('b', 4 * MB, 'subiendo', 0.5)]).porcentaje, 50)
    assert.deepEqual(resumenDeSubida([]), { subidos: 0, total: 0, porcentaje: 0, fallidos: 0 })
    const r = resumenDeSubida([e('a', 1, 'subido'), e('b', 1, 'error'), e('c', 1, 'listo')]); assert.equal(r.subidos, 1); assert.equal(r.fallidos, 1); assert.equal(r.total, 3)
  })
  await ok('el porcentaje nunca pasa de 100 ni baja de 0', () => {
    assert.equal(resumenDeSubida([e('a', 10, 'subiendo', 7)]).porcentaje, 100); assert.equal(resumenDeSubida([e('a', 10, 'subiendo', -3)]).porcentaje, 0)
  })
  await ok('mensajes de fallo: uno por nombre, varios en plural', () => {
    const uno = mensajeDeFallos([{ ...e('a.pdf', 1, 'error'), error: 'Dejó de avanzar. Revisa tu conexión.' }])
    assert.match(uno, /^«a\.pdf»: Dejó de avanzar\..*Reintentar/); assert.equal((uno.match(/Reintentar/g) ?? []).length, 1, 'la instrucción va una sola vez')
    assert.match(mensajeDeFallos([e('a', 1, 'error'), e('b', 1, 'error')]), /2 archivos.*no se repiten/)
  })

  console.log('subir en cola')
  const items = (k: number) => Array.from({ length: k }, (_, i) => ({ clave: `k${i}` }))
  await ok('nunca más de 3 a la vez, y los 7 terminan', async () => {
    let activos = 0, maximo = 0
    const cambios: [string, CambioDeSubida][] = []
    const r = await subirCola(items(7), async () => { activos++; maximo = Math.max(maximo, activos); await new Promise(res => setTimeout(res, 15)); activos-- }, { alCambio: (c, x) => cambios.push([c, x]) })
    assert.equal(maximo, 3); assert.equal(r.size, 7); assert.ok([...r.values()].every(x => x.ok))
    assert.equal(cambios.filter(([, x]) => x.estado === 'subido').length, 7)
  })
  await ok('el fallo de uno no frena a los demás y se dice cuál', async () => {
    const cambios: [string, CambioDeSubida][] = []
    const r = await subirCola(items(5), async it => { await new Promise(res => setTimeout(res, 5)); if (it.clave === 'k2') throw new Error('«k2» dejó de avanzar.') }, { alCambio: (c, x) => cambios.push([c, x]) })
    assert.equal([...r.values()].filter(x => x.ok).length, 4)
    assert.deepEqual(r.get('k2'), { ok: false, error: '«k2» dejó de avanzar.' })
    assert.deepEqual(cambios.filter(([, x]) => x.estado === 'error').map(([c]) => c), ['k2'])
  })
  await ok('un error sin mensaje (o que no es Error) igual se cuenta', async () => {
    const r = await subirCola(items(2), async () => { throw 'boom' }, { alCambio: () => {} })
    assert.deepEqual([...r.values()], [{ ok: false, error: 'No se pudo subir el archivo.' }, { ok: false, error: 'No se pudo subir el archivo.' }])
  })
  await ok('el avance se acota entre 0 y 1', async () => {
    const vistos: number[] = []
    await subirCola(items(1), async (_it, p) => { p(-1); p(0.4); p(7) }, { alCambio: (_c, x) => { if (x.estado === 'subiendo') vistos.push(x.progreso) } })
    assert.deepEqual(vistos, [0, 0, 0.4, 1])
  })
  await ok('lista vacía y concurrencia 1 funcionan', async () => {
    assert.equal((await subirCola([], async () => {}, { alCambio: () => {} })).size, 0)
    let activos = 0, maximo = 0
    await subirCola(items(4), async () => { activos++; maximo = Math.max(maximo, activos); await new Promise(r => setTimeout(r, 3)); activos-- }, { concurrencia: 1, alCambio: () => {} })
    assert.equal(maximo, 1)
  })
  await ok('la clave identifica nombre+tamaño+fecha', () => assert.equal(claveDe(f('a.pdf', 5, '', 9)), 'a.pdf:5:9'))
  console.log(`\n${n} pruebas correctas`)
}
main().catch(e => { console.error('FALLÓ', e); process.exit(1) })
