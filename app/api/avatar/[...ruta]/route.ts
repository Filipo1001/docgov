/**
 * API Route: GET /api/avatar/{userId}/foto.{ext}
 *
 * Sirve la foto de perfil desde el bucket privado `avatars`.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 *
 * El bucket era el único público del proyecto. Las rutas son predecibles
 * —`{id de usuario}/foto.jpg`—, así que cualquiera con el enlace, o con el id
 * de un usuario, abría la fotografía de un contratista sin haber iniciado
 * sesión. Una foto de la cara es un dato personal (Ley 1581 de 2012); el resto
 * de los buckets ya eran privados.
 *
 * ── Por qué se sirven los bytes y no una signed URL ──────────────────────
 *
 * Redirigir a una URL firmada es lo que hacen las actas, pero ahí se descarga
 * un documento a la vez. Un listado de contratistas pinta decenas de avatares:
 * cada redirección duplicaría las peticiones y ninguna se podría cachear,
 * porque la firma cambia en cada carga. Devolviendo la imagen desde una ruta
 * estable el navegador la guarda y no vuelve a pedirla.
 *
 * `private` en el Cache-Control es deliberado: el navegador de quien la pidió
 * puede guardarla, la CDN compartida no. Sin eso volveríamos a dejar la imagen
 * accesible fuera de la sesión, que es justo lo que se está corrigiendo.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * La ruta se arma con datos que vienen de la URL. Sin esta forma fija, el
 * cliente de administración —que se salta las políticas de acceso— podría
 * pedir cualquier objeto del bucket. Solo se acepta lo que la subida genera.
 */
const RUTA_VALIDA = /^[0-9a-fA-F-]{36}\/foto\.(jpg|jpeg|png|webp|heic)$/

const TIPOS: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
}

/** Tamaños que pide la aplicación. Acotado para no convertir la ruta en un
 *  redimensionador abierto: cada combinación nueva es una transformación que
 *  Supabase cobra y cachea aparte. */
const ANCHOS_PERMITIDOS = [80, 160, 192, 320, 640]

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ruta: string[] }> },
) {
  // Basta con haber iniciado sesión: dentro de la aplicación los listados ya
  // muestran nombre y foto de todo el mundo. Lo que se cierra es el acceso
  // anónimo, no el acceso entre usuarios.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { ruta } = await params
  const path = ruta.join('/')
  if (!RUTA_VALIDA.test(path)) {
    return NextResponse.json({ error: 'Ruta no válida' }, { status: 400 })
  }

  const ext = path.split('.').pop()!.toLowerCase()
  const pedido = Number(req.nextUrl.searchParams.get('px'))
  const px = ANCHOS_PERMITIDOS.includes(pedido) ? pedido : 160

  const admin = createAdminSupabaseClient()
  const bucket = admin.storage.from('avatars')

  // Las transformaciones son un servicio aparte del almacenamiento: agotado el
  // cupo del plan, Supabase deja de responderlas aunque el archivo esté
  // intacto. Sin este segundo intento, ese día todos los avatares aparecerían
  // rotos. Se paga tamaño completo, que es mejor que no mostrar nada.
  let { data, error } = await bucket.download(path, {
    transform: { width: px, height: px, resize: 'cover', quality: 75 },
  })
  if (error || !data) {
    ({ data, error } = await bucket.download(path))
  }

  if (error || !data) {
    return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': TIPOS[ext] ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600, must-revalidate',
    },
  })
}
