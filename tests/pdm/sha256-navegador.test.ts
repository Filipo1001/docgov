import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { esHuella } from '@/lib/pdm/huella'
import { Sha256, huellaDeArchivo } from '@/lib/pdm/sha256-navegador'

// El navegador y el servidor tienen que dar EXACTAMENTE la misma huella: lo que el servidor anotó al subir un archivo es lo que
// la persona compara contra lo que calcula su propio navegador.

const nodeHex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const mio = (b: Uint8Array) => new Sha256().update(b).digestHex()

test('los valores de referencia de la norma (vacío, «abc» y el mensaje de 448 bits)', () => {
  assert.equal(mio(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(mio(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(mio(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
})

test('da lo mismo que node:crypto en todos los tamaños que cruzan un límite de bloque o de relleno', () => {
  for (const n of [0, 1, 2, 54, 55, 56, 57, 63, 64, 65, 118, 119, 120, 121, 127, 128, 129, 1000, 4096, 65537]) {
    const datos = randomBytes(n)
    assert.equal(mio(datos), nodeHex(datos), `${n} bytes`)
  }
})

test('da lo mismo sin importar cómo se parta la entrada (trozos de cualquier tamaño)', () => {
  const datos = randomBytes(10_000)
  const esperado = nodeHex(datos)
  for (const trozo of [1, 3, 7, 63, 64, 65, 100, 4096, 9999]) {
    const h = new Sha256()
    for (let i = 0; i < datos.length; i += trozo) h.update(datos.subarray(i, i + trozo))
    assert.equal(h.digestHex(), esperado, `en trozos de ${trozo}`)
    assert.equal(h.bytes, datos.length)
  }
})

test('cuenta los bytes y no se altera por lo que ya se calculó (se puede pedir el resultado y es estable)', () => {
  const h = new Sha256().update(new TextEncoder().encode('hola'))
  assert.equal(h.bytes, 4)
  assert.equal(h.digestHex(), createHash('sha256').update('hola').digest('hex'))
})

test('un archivo de verdad: leído por trozos, con progreso, y su huella es de la forma que guarda la base', async () => {
  const datos = randomBytes(1_000_003)
  const avances: number[] = []
  const r = await huellaDeArchivo(new Blob([datos]), { trozo: 65_536, alAvanzar: f => avances.push(f) })
  assert.equal(r.sha256, nodeHex(datos))
  assert.equal(r.bytes, 1_000_003)
  assert.ok(esHuella(r.sha256), 'es de la forma que la base exige (64 hex en minúscula)')
  assert.ok(avances.length > 5 && avances[avances.length - 1] === 1, 'avisa del avance y termina en 1')
  assert.ok(avances.every((f, i) => i === 0 || f >= avances[i - 1]), 'el avance nunca retrocede')
})

test('un archivo vacío y uno de un solo trozo también', async () => {
  assert.equal((await huellaDeArchivo(new Blob([]))).sha256, nodeHex(new Uint8Array(0)))
  const chico = randomBytes(100)
  assert.equal((await huellaDeArchivo(new Blob([chico]))).sha256, nodeHex(chico))
})

test('se puede cancelar a mitad de camino', async () => {
  const control = new AbortController()
  const datos = randomBytes(300_000)
  await assert.rejects(
    huellaDeArchivo(new Blob([datos]), { trozo: 50_000, senal: control.signal, alAvanzar: f => { if (f > 0.3) control.abort() } }),
    (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
  )
})

test('un solo bit distinto cambia la huella', () => {
  const datos = randomBytes(5000)
  const otro = Uint8Array.from(datos); otro[2500] ^= 1
  assert.notEqual(mio(datos), mio(otro))
})
