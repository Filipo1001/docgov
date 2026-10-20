import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { ErrorDeSubida } from '@/lib/pdm/subir'
import {
  BYTES_POR_PARTE, REANUDACIONES_MAXIMAS, direccionReanudable, subirReanudable, type CrearSubidaTus, type OpcionesTus, type SubidaTus,
} from '@/lib/pdm/subir-reanudable'
import type { SubidaReanudable } from '@/lib/pdm/seguimiento-acciones'

const DESTINO: SubidaReanudable = { endpoint: 'https://x.storage.supabase.co/storage/v1/upload/resumable/sign', firma: 'firma-de-esta-ruta', apikey: 'clave-publica', bucket: 'pdm-evidencias' }
const RUTA = 'plan/indicador/2026/0b7e4f0e-2f5c-4c0e-8a8e-6f1f7a3b9c10.mp4'
const archivo = (n: number): Blob => randomBytes(n) as unknown as Blob

// ─── La dirección ─────────────────────────────────────────────────────────────

test('la dirección de las partes va al servidor directo de almacenamiento', () => {
  assert.equal(direccionReanudable('https://vuisqgjfwhabmyszidmn.supabase.co'), 'https://vuisqgjfwhabmyszidmn.storage.supabase.co/storage/v1/upload/resumable/sign')
  assert.equal(direccionReanudable('https://vuisqgjfwhabmyszidmn.supabase.co/'), 'https://vuisqgjfwhabmyszidmn.storage.supabase.co/storage/v1/upload/resumable/sign')
  // Otra forma de dirección (local, dominio propio): se usa tal cual.
  assert.equal(direccionReanudable('http://127.0.0.1:54321'), 'http://127.0.0.1:54321/storage/v1/upload/resumable/sign')
  assert.equal(direccionReanudable('https://archivos.alcaldia.gov.co'), 'https://archivos.alcaldia.gov.co/storage/v1/upload/resumable/sign')
})

// ─── Con una subida de juguete ───────────────────────────────────────────────

interface Juguete { opciones: OpcionesTus | null; arranques: number; pausas: number; crear: CrearSubidaTus }

/** Una «biblioteca» que hace lo que el guion diga cuando se arranca. */
function juguete(guion: (opciones: OpcionesTus, vez: number) => void): Juguete {
  const j: Juguete = {
    opciones: null, arranques: 0, pausas: 0,
    crear: async (_a, opciones) => {
      j.opciones = opciones
      const subida: SubidaTus = {
        start: () => { j.arranques++; guion(opciones, j.arranques) },
        abort: async () => { j.pausas++ },
      }
      return subida
    },
  }
  return j
}

const falloHttp = (estado: number): Error => Object.assign(new Error('tus: respuesta inesperada'), { originalResponse: { getStatus: () => estado } })

test('manda al almacenamiento la firma, la ruta y el tipo; las partes son de 6 MiB', async () => {
  const j = juguete(o => o.onSuccess())
  await subirReanudable(DESTINO, RUTA, archivo(10), 'video/mp4', { crear: j.crear })
  const o = j.opciones!
  assert.equal(o.endpoint, DESTINO.endpoint)
  assert.deepEqual(o.headers, { 'x-signature': 'firma-de-esta-ruta', apikey: 'clave-publica' })
  assert.deepEqual(o.metadata, { bucketName: 'pdm-evidencias', objectName: RUTA, contentType: 'video/mp4', cacheControl: '3600' })
  assert.equal(o.chunkSize, 6 * 1024 * 1024)
  assert.equal(BYTES_POR_PARTE, 6 * 1024 * 1024)
  // El rastro de una subida no se guarda en el navegador: la firma de un intento no sirve para el siguiente.
  assert.equal(o.storeFingerprintForResuming, false)
  assert.equal(o.uploadDataDuringCreation, true)
})

test('el avance sube y NUNCA llega a 1 hasta que el almacenamiento confirma', async () => {
  const visto: number[] = []
  const j = juguete(o => { o.onProgress(0, 100); o.onProgress(50, 100); o.onProgress(100, 100); o.onSuccess() })
  await subirReanudable(DESTINO, RUTA, archivo(10), 'video/mp4', { crear: j.crear, alProgreso: f => visto.push(f) })
  assert.deepEqual(visto, [0, 0.5, 0.99, 1])
})

test('un rechazo del almacenamiento dice qué pasó y no se reintenta', async () => {
  const casos: [number, RegExp][] = [[413, /Pesa más de lo permitido/], [400, /MP4 o MOV/], [415, /MP4 o MOV/], [403, /venció/], [401, /venció/], [409, /Ya estaba subido/], [500, /error 500/]]
  for (const [estado, texto] of casos) {
    const j = juguete(o => o.onError(falloHttp(estado)))
    await assert.rejects(subirReanudable(DESTINO, RUTA, archivo(10), 'video/mp4', { crear: j.crear }), (e: unknown) => {
      assert.ok(e instanceof ErrorDeSubida, String(estado))
      assert.match(e.message, texto, String(estado))
      assert.equal(e.http, true, String(estado))
      return true
    })
    assert.equal(j.arranques, 1, `${estado}: se arranca una sola vez`)
  }
})

test('un fallo de red (sin respuesta) lo dice como tal', async () => {
  const j = juguete(o => o.onError(new Error('tus: failed to upload chunk')))
  await assert.rejects(subirReanudable(DESTINO, RUTA, archivo(10), 'video/mp4', { crear: j.crear }), (e: unknown) => {
    assert.ok(e instanceof ErrorDeSubida)
    assert.match(e.message, /Revisa tu conexión/)
    assert.equal(e.http, false)
    return true
  })
})

test('si la biblioteca no carga, el aviso lo dice y no deja la pantalla colgada', async () => {
  const crear: CrearSubidaTus = async () => { throw new Error('Failed to fetch dynamically imported module') }
  await assert.rejects(subirReanudable(DESTINO, RUTA, archivo(10), 'video/mp4', { crear }), (e: unknown) => e instanceof ErrorDeSubida && /Recarga la página/.test(e.message))
})

test('si deja de avanzar se PAUSA y se retoma (no se empieza de cero), y luego se rinde', async () => {
  // Nunca avanza: se retoma dos veces y a la tercera se rinde.
  const j = juguete(() => {})
  await assert.rejects(subirReanudable(DESTINO, RUTA, archivo(10), 'video/mp4', { crear: j.crear, msSinAvance: 15 }), (e: unknown) => e instanceof ErrorDeSubida && /Dejó de avanzar/.test(e.message) && e.http === false)
  assert.equal(j.arranques, 1 + REANUDACIONES_MAXIMAS)
  assert.equal(j.pausas, 1 + REANUDACIONES_MAXIMAS)
})

test('un tropiezo que se arregla al retomar termina bien', async () => {
  const j = juguete((o, vez) => { if (vez === 2) { o.onProgress(10, 100); o.onSuccess() } })
  await subirReanudable(DESTINO, RUTA, archivo(10), 'video/mp4', { crear: j.crear, msSinAvance: 15 })
  assert.equal(j.arranques, 2)
})

test('mientras llegan bytes no se corta aunque tarde', async () => {
  let avance = 0
  const j = juguete(o => {
    const t = setInterval(() => {
      avance += 10
      o.onProgress(avance, 100)
      if (avance >= 100) { clearInterval(t); o.onSuccess() }
    }, 10)
  })
  // 10 pasos de 10 ms = 100 ms en total, mucho más que los 40 ms de tolerancia: lo que cuenta es el silencio, no la duración.
  await subirReanudable(DESTINO, RUTA, archivo(10), 'video/mp4', { crear: j.crear, msSinAvance: 40 })
  assert.equal(j.arranques, 1)
})

// ─── Con la biblioteca de verdad contra un almacenamiento de juguete ─────────

interface Recibida { meta: string; longitud: number; trozos: Buffer[]; cabecerasCreacion: IncomingMessage['headers'] }

/**
 * Un servidor TUS mínimo (crear, enviar una parte, preguntar cuánto llegó), con los fallos que se le pidan. Es lo mínimo que hace
 * falta para probar que la biblioteca, con nuestras opciones, retoma donde iba.
 */
function servidorTus(config: { rechazarCreacionCon?: number; fallarParteNumero?: number } = {}) {
  const subidas = new Map<string, Recibida>()
  let partes = 0
  let cabeceras = 0
  const leer = (req: IncomingMessage) => new Promise<Buffer>(res => { const t: Buffer[] = []; req.on('data', c => t.push(c)); req.on('end', () => res(Buffer.concat(t))) })
  const desplazamiento = (r: Recibida) => r.trozos.reduce((n, t) => n + t.length, 0)
  const base = (res: ServerResponse, estado: number, extra: Record<string, string | number> = {}) => {
    res.writeHead(estado, { 'Tus-Resumable': '1.0.0', ...extra }); res.end()
  }

  const servidor: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'POST') {
      const cuerpo = await leer(req)
      if (config.rechazarCreacionCon) return base(res, config.rechazarCreacionCon)
      const id = String(subidas.size + 1)
      const r: Recibida = { meta: String(req.headers['upload-metadata'] ?? ''), longitud: Number(req.headers['upload-length']), trozos: [], cabecerasCreacion: req.headers }
      cabeceras++
      if (cuerpo.length > 0) r.trozos.push(cuerpo)
      subidas.set(id, r)
      return base(res, 201, { Location: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/archivos/${id}`, 'Upload-Offset': desplazamiento(r) })
    }
    const id = url.pathname.split('/').pop() ?? ''
    const r = subidas.get(id)
    if (!r) return base(res, 404)
    if (req.method === 'HEAD') return base(res, 200, { 'Upload-Offset': desplazamiento(r), 'Upload-Length': r.longitud, 'Cache-Control': 'no-store' })
    if (req.method === 'PATCH') {
      const cuerpo = await leer(req)
      partes++
      if (config.fallarParteNumero === partes) return base(res, 503)
      if (Number(req.headers['upload-offset']) !== desplazamiento(r)) return base(res, 409)
      r.trozos.push(cuerpo)
      return base(res, 204, { 'Upload-Offset': desplazamiento(r) })
    }
    return base(res, 405)
  })

  return {
    subidas,
    partesRecibidas: () => partes,
    creaciones: () => cabeceras,
    abrir: () => new Promise<string>(res => servidor.listen(0, '127.0.0.1', () => res(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}/crear`))),
    cerrar: () => new Promise<void>(res => { servidor.closeAllConnections(); servidor.close(() => res()) }),
  }
}

const huella = (b: Buffer | Buffer[]) => createHash('sha256').update(Buffer.concat(Array.isArray(b) ? b : [b])).digest('hex')
const MB = 1024 * 1024

test('con la biblioteca real: un archivo de varias partes llega completo y con la firma en la creación', async () => {
  const s = servidorTus()
  const endpoint = await s.abrir()
  try {
    const datos = randomBytes(14 * MB)
    const visto: number[] = []
    await subirReanudable({ ...DESTINO, endpoint }, RUTA, datos as unknown as Blob, 'video/mp4', { alProgreso: f => visto.push(f), pausas: [0, 10, 10] })
    const r = [...s.subidas.values()][0]
    assert.equal(s.creaciones(), 1)
    assert.equal(huella(r.trozos), huella(datos), 'los bytes que llegaron son los que se mandaron')
    assert.equal(r.cabecerasCreacion['x-signature'], 'firma-de-esta-ruta')
    assert.equal(r.cabecerasCreacion['apikey'], 'clave-publica')
    // La ruta y el tipo viajan en los metadatos, codificados en base64 como pide el protocolo.
    const meta = Object.fromEntries(r.meta.split(',').map(p => { const [k, v] = p.split(' '); return [k, Buffer.from(v ?? '', 'base64').toString()] }))
    assert.equal(meta.objectName, RUTA); assert.equal(meta.contentType, 'video/mp4'); assert.equal(meta.bucketName, 'pdm-evidencias')
    assert.equal(visto.at(-1), 1)
    assert.ok(visto.slice(0, -1).every(f => f < 1), 'solo el último aviso llega a 1')
    assert.ok(visto.every((f, k) => k === 0 || f >= visto[k - 1]), 'el avance no retrocede')
  } finally { await s.cerrar() }
})

test('con la biblioteca real: si una parte falla, se retoma desde lo que llegó y el archivo queda idéntico', async () => {
  const s = servidorTus({ fallarParteNumero: 1 })
  const endpoint = await s.abrir()
  try {
    const datos = randomBytes(14 * MB)
    await subirReanudable({ ...DESTINO, endpoint }, RUTA, datos as unknown as Blob, 'video/mp4', { pausas: [0, 10, 10] })
    const r = [...s.subidas.values()][0]
    assert.equal(s.creaciones(), 1, 'no se crea otra subida: se retoma la misma')
    assert.equal(huella(r.trozos), huella(datos), 'sin huecos ni repeticiones')
    assert.ok(s.partesRecibidas() >= 2)
  } finally { await s.cerrar() }
})

test('con la biblioteca real: el almacenamiento que rechaza por tamaño se dice en palabras de persona', async () => {
  const s = servidorTus({ rechazarCreacionCon: 413 })
  const endpoint = await s.abrir()
  try {
    await assert.rejects(subirReanudable({ ...DESTINO, endpoint }, RUTA, archivo(2 * MB), 'video/mp4', { pausas: [0, 10] }), (e: unknown) => e instanceof ErrorDeSubida && /Pesa más de lo permitido/.test(e.message) && e.http)
  } finally { await s.cerrar() }
})

test('con la biblioteca real: un servidor que no contesta de forma usable falla sin colgarse', async () => {
  const s = servidorTus({ rechazarCreacionCon: 500 })
  const endpoint = await s.abrir()
  try {
    await assert.rejects(subirReanudable({ ...DESTINO, endpoint }, RUTA, archivo(2 * MB), 'video/mp4', { pausas: [0, 10] }), (e: unknown) => e instanceof ErrorDeSubida)
  } finally { await s.cerrar() }
})
