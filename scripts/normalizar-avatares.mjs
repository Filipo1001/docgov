/**
 * scripts/normalizar-avatares.mjs — deja todos los avatares como los deja el
 * compresor del cliente: 400×400 WebP.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 *
 * `comprimirFoto` (lib/compress.ts) comprime en el navegador antes de subir,
 * y las fotos que entraron por ahí promedian 12 KB. Pero 19 se subieron sin
 * pasar por ese camino —todas el 27 de agosto de 2026, el día que se pobló el
 * bucket— y pesan entre 400 KB y 800 KB: 9,9 MB de los 11 MB del bucket.
 *
 * Ya no gastan cupo de transformaciones —la ruta dejó de pedirlas—, pero sí
 * egress: cada vez que a alguien se le vence la caché de una hora, se baja la
 * foto entera para pintarla a 40 px. Esto lo arregla en el origen, que es
 * donde se arregla una sola vez.
 *
 * ── Cómo se usa ──────────────────────────────────────────────────────────
 *
 *   node scripts/normalizar-avatares.mjs            # simulacro, no escribe
 *   node scripts/normalizar-avatares.mjs --aplicar  # ejecuta
 *
 * ── Qué cuida ────────────────────────────────────────────────────────────
 *
 * · Guarda el original en `.respaldo-avatares/` antes de sustituirlo. Es lo
 *   que hace reversible una operación que si no lo sería: la foto de 800 KB
 *   no vuelve de un WebP de 11 KB.
 * · Solo toca objetos que algún `usuarios.foto_url` referencia. Los sueltos
 *   se listan y se dejan quietos: convertir uno que nadie mira solo produce
 *   otro archivo que nadie mira, y borrarlo puede ser destruir la única copia
 *   de la foto de alguien por un `foto_url` que se perdió.
 * · El objeto viejo se borra solo después de que el nuevo subió Y la base
 *   quedó actualizada. Si algo falla a mitad, sobra un archivo; nunca falta.
 * · La foto sale con `?v=` nuevo para que la caché del navegador no siga
 *   sirviendo la vieja, igual que hace `confirmarFotoUsuario`.
 * · No toca las que ya están bien: se salta WebP por debajo del umbral.
 * · Si el WebP sale más pesado que el original, se deja el original.
 */

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')

// Umbral y destino: los mismos que produce comprimirFoto en el navegador.
const LADO = 400
const CALIDAD = 82
const UMBRAL_BYTES = 400 * 1024

/** Dónde queda el original antes de sustituirlo. Fuera de git (.gitignore). */
const RESPALDO = new URL('../.respaldo-avatares/', import.meta.url)

// ── Entorno ────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const URL_SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_SUPABASE || !LLAVE) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(URL_SUPABASE, LLAVE, { auth: { persistSession: false } })
const bucket = supabase.storage.from('avatars')
const kb = n => `${Math.round(n / 1024)} KB`

// ── Inventario ─────────────────────────────────────────────────────────────
async function inventario() {
  const { data: carpetas, error } = await bucket.list('', { limit: 1000 })
  if (error) throw error
  const objetos = []
  for (const c of carpetas ?? []) {
    if (c.id) continue                       // es un archivo suelto, no una carpeta
    const { data: archivos } = await bucket.list(c.name, { limit: 100 })
    for (const a of archivos ?? []) {
      objetos.push({
        path: `${c.name}/${a.name}`,
        usuarioId: c.name,
        size: a.metadata?.size ?? 0,
        mime: a.metadata?.mimetype ?? '',
      })
    }
  }
  return objetos
}

const pathDesdeUrl = url => {
  const marca = '/storage/v1/object/public/avatars/'
  if (!url) return null
  const limpia = url.split('?')[0]
  const i = limpia.indexOf(marca)
  return i === -1 ? null : limpia.slice(i + marca.length)
}

// ── Principal ──────────────────────────────────────────────────────────────
const objetos = await inventario()
const { data: usuarios, error: eU } = await supabase
  .from('usuarios')
  .select('id, nombre_completo, foto_url')
  .not('foto_url', 'is', null)
if (eU) throw eU

const referenciados = new Set(usuarios.map(u => pathDesdeUrl(u.foto_url)).filter(Boolean))
const porUsuario = new Map(usuarios.map(u => [u.id, u]))

const huerfanos = objetos.filter(o => !referenciados.has(o.path))
const aNormalizar = objetos.filter(
  o => referenciados.has(o.path) && (o.size > UMBRAL_BYTES || o.mime !== 'image/webp'),
)

console.log(`\nBucket avatars: ${objetos.length} objetos, ${kb(objetos.reduce((s, o) => s + o.size, 0))}`)
console.log(`A normalizar:   ${aNormalizar.length}`)
console.log(`Sueltos:        ${huerfanos.length} (nadie los referencia; se dejan quietos)\n`)
console.log(APLICAR ? '── APLICANDO ──\n' : '── SIMULACRO (usa --aplicar para ejecutar) ──\n')

let ahorro = 0
let hechos = 0
let fallos = 0

for (const o of aNormalizar) {
  const usuario = porUsuario.get(o.usuarioId)
  const nombre = usuario?.nombre_completo ?? '(sin usuario en la base)'
  const destino = `${o.usuarioId}/foto.webp`

  try {
    const { data: blob, error: eD } = await bucket.download(o.path)
    if (eD || !blob) throw new Error(eD?.message ?? 'no se pudo descargar')

    const original = Buffer.from(await blob.arrayBuffer())
    const nuevo = await sharp(original)
      .rotate()                                   // respeta la orientación EXIF
      .resize(LADO, LADO, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: CALIDAD })
      .toBuffer()

    // Solo se sustituye si de verdad mejora. Una foto ya pequeña puede salir
    // más pesada al recodificarla, y entonces no vale la pena tocarla.
    if (nuevo.length >= original.length) {
      console.log(`  ·  ${nombre}: ya está óptima (${kb(o.size)}), se deja`)
      continue
    }

    console.log(
      `  ${APLICAR ? '✓' : '→'}  ${nombre}: ${kb(original.length)} → ${kb(nuevo.length)}` +
      `  (${Math.round((1 - nuevo.length / original.length) * 100)}% menos)` +
      (o.path !== destino ? `   [${o.path} → ${destino}]` : ''),
    )
    ahorro += original.length - nuevo.length

    if (!APLICAR) { hechos++; continue }

    // Respaldo antes de sustituir. Sin esto la operación no tendría vuelta
    // atrás: de un WebP de 11 KB no se recupera el original de 800 KB.
    mkdirSync(RESPALDO, { recursive: true })
    writeFileSync(new URL(`${o.path.replace('/', '__')}`, RESPALDO), original)

    const { error: eS } = await bucket.upload(destino, nuevo, {
      contentType: 'image/webp',
      upsert: true,
    })
    if (eS) throw new Error(`subida: ${eS.message}`)

    if (usuario) {
      const nuevaUrl =
        `${URL_SUPABASE}/storage/v1/object/public/avatars/${destino}?v=${Date.now()}`
      const { error: eB } = await supabase
        .from('usuarios')
        .update({ foto_url: nuevaUrl })
        .eq('id', o.usuarioId)
      if (eB) throw new Error(`base de datos: ${eB.message}`)
    }

    // El viejo se va solo cuando el nuevo ya está arriba y referenciado.
    if (o.path !== destino) {
      const { error: eR } = await bucket.remove([o.path])
      if (eR) console.log(`     aviso: no se pudo borrar ${o.path}: ${eR.message}`)
    }
    hechos++
  } catch (e) {
    fallos++
    console.log(`  ✗  ${nombre}: ${e.message}`)
  }
}

if (huerfanos.length) {
  console.log('\nSueltos, sin tocar (ningún usuario los referencia):')
  for (const h of huerfanos) console.log(`     ${h.path}  ${kb(h.size)}`)
  console.log('     Revisar a mano antes de borrar: puede ser la única copia.')
}

console.log(
  `\n${APLICAR ? 'Hecho' : 'Simulacro'}: ${hechos} fotos, ${kb(ahorro)} menos` +
  (fallos ? `, ${fallos} con error` : '') + '\n',
)
