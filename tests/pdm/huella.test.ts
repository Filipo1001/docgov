import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { armarDetalle, type FilaEvidencia, type FilaReporteDetalle } from '@/lib/pdm/detalle-armar'
import { FORMA_DE_HUELLA, esHuella, huellaCorta, huellaDeFlujo } from '@/lib/pdm/huella'

/** Un flujo que entrega los bytes en trozos de ese tamaño (lo que pasa con un archivo que llega por la red). */
async function* enTrozos(bytes: Uint8Array, tamano: number): AsyncIterable<Uint8Array> {
  for (let i = 0; i < bytes.length; i += tamano) yield bytes.subarray(i, i + tamano)
}

const texto = (s: string) => new TextEncoder().encode(s)

// ─── El cálculo ───────────────────────────────────────────────────────────────

test('SHA-256 de vectores conocidos (FIPS 180-4)', async () => {
  assert.deepEqual(await huellaDeFlujo(enTrozos(texto('abc'), 2)), {
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', bytes: 3,
  })
  assert.deepEqual(await huellaDeFlujo(enTrozos(texto(''), 1)), {
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', bytes: 0,
  })
  assert.equal(
    (await huellaDeFlujo(enTrozos(texto('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), 7))).sha256,
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  )
})

test('un millón de «a»: el vector largo del estándar, en trozos de 64 KB', async () => {
  const r = await huellaDeFlujo(enTrozos(new Uint8Array(1_000_000).fill(0x61), 65536))
  assert.equal(r.sha256, 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
  assert.equal(r.bytes, 1_000_000)
})

test('el troceado no cambia la huella, y cuenta los bytes reales', async () => {
  const datos = new Uint8Array(100_003).map((_, i) => (i * 31 + 7) % 256)
  const esperada = createHash('sha256').update(datos).digest('hex')
  for (const tamano of [1, 5, 4096, 65535, 100_003, 500_000]) {
    const r = await huellaDeFlujo(enTrozos(datos, tamano))
    assert.equal(r.sha256, esperada, `trozos de ${tamano}`)
    assert.equal(r.bytes, datos.length)
  }
})

test('cambiar un solo bit cambia la huella', async () => {
  const a = new Uint8Array(1024).fill(7)
  const b = a.slice(); b[512] ^= 1
  assert.notEqual((await huellaDeFlujo(enTrozos(a, 100))).sha256, (await huellaDeFlujo(enTrozos(b, 100))).sha256)
})

test('un flujo que falla a mitad no entrega una huella a medias', async () => {
  async function* roto(): AsyncIterable<Uint8Array> { yield texto('abc'); throw new Error('se cortó la conexión') }
  await assert.rejects(() => huellaDeFlujo(roto()), /se cortó la conexión/)
})

// ─── La forma ─────────────────────────────────────────────────────────────────

test('la huella es 64 hexadecimales en minúscula y nada más', () => {
  const buena = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  assert.equal(esHuella(buena), true)
  assert.equal(FORMA_DE_HUELLA.test(buena), true)
  for (const mala of [buena.toUpperCase(), buena.slice(1), buena + '0', ' ' + buena, buena.replace('b', 'g'), '', null, undefined, 42, {}]) {
    assert.equal(esHuella(mala), false, String(mala))
  }
})

test('dicha en una línea: ocho al principio, ocho al final; lo que no es huella no se abrevia', () => {
  assert.equal(huellaCorta('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'), 'ba7816bf…f20015ad')
  assert.equal(huellaCorta('no es una huella'), '')
  assert.equal(huellaCorta(''), '')
})

// ─── Llega a la pantalla del indicador tal cual la guardó el servidor ─────────

const reporte = (id: string): FilaReporteDetalle => ({
  id, anio: 2026, valor: 10, valor_anterior: null, texto: 'Se hizo algo.', autor_id: 'a', autor_nombre: 'ANA', corrige_a: null,
  motivo_correccion: null, created_at: '2026-10-01T10:00:00Z',
})
const evidencia = (id: string, extra: Partial<FilaEvidencia> = {}): FilaEvidencia => ({
  id, reporte_id: 'r1', nombre: `${id}.pdf`, tipo: 'application/pdf', bytes: 1000, ...extra,
})
const detalle = (evidencias: FilaEvidencia[]) => armarDetalle({
  reportes: [reporte('r1')], evidencias, validaciones: [], comentarios: [], yoId: 'otro', puedeValidarElIndicador: false,
})

test('la ficha del indicador trae la huella y la fecha en que el servidor la calculó', () => {
  const H = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  const [e] = detalle([evidencia('e1', { sha256: H, huella_calculada_en: '2026-10-01T10:00:05Z' })]).reportes[0].evidencias
  assert.equal(e.sha256, H)
  assert.equal(e.huellaCalculadaEn, '2026-10-01T10:00:05Z')
})

test('un archivo sin huella (o de una lectura que no la trae) sale con null, no con undefined ni con texto', () => {
  const [a, b] = detalle([evidencia('e1', { sha256: null, huella_calculada_en: null }), evidencia('e2')]).reportes[0].evidencias
  for (const e of [a, b]) { assert.equal(e.sha256, null); assert.equal(e.huellaCalculadaEn, null) }
})
