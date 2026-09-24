/**
 * El envío del correo masivo del administrador.
 *
 * ── POR QUÉ UNA RUTA Y NO UNA SERVER ACTION ──────────────────────────────
 *
 * Todo correo sale por `enviarCorreo`, que espacia los envíos 550 ms porque
 * Resend acepta dos por segundo. Con 118 destinatarios eso es algo más de un
 * minuto, y una server action no puede declarar `maxDuration`. Aquí sí.
 *
 * (El correo masivo del asesor, que es de antes, llama a Resend directo y
 * dispara todos en paralelo: la mayoría vuelve con 429 y se descarta en
 * silencio, contándose igual como enviada. Ese arreglo va aparte.)
 *
 * Se responde cuando ha terminado, con el parte completo: cuántos salieron y
 * quiénes no, con su motivo. Un minuto de espera con un aviso claro en
 * pantalla es preferible a un envío que se va al fondo y del que nadie sabe
 * nunca si llegó.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { enviarCorreo } from '@/lib/resend'
import { baseHtml } from '@/lib/emails/templates'
import { MARCA } from '@/lib/marca'
import {
  CANDADO_DESTINO, DOMINIO_MARCADOR, ROLES_EQUIPO,
  cuerpoAHtml, primerNombreDe,
  type FiltroMasivo, type Destinatario,
} from '@/lib/correo-masivo'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })

  const { data: yo } = await supabase
    .from('usuarios').select('rol').eq('id', session.user.id).single()
  if (yo?.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const cuerpoPeticion = await request.json().catch(() => null)
  const filtro  = cuerpoPeticion?.filtro as FiltroMasivo | undefined
  const asunto  = (cuerpoPeticion?.asunto ?? '').toString().trim()
  const mensaje = (cuerpoPeticion?.mensaje ?? '').toString().trim()

  if (!filtro)  return NextResponse.json({ error: 'Falta el destinatario' }, { status: 400 })
  if (!asunto)  return NextResponse.json({ error: 'El asunto es obligatorio' }, { status: 400 })
  if (!mensaje) return NextResponse.json({ error: 'El mensaje es obligatorio' }, { status: 400 })

  const admin = createAdminSupabaseClient()
  let consulta = admin
    .from('usuarios')
    .select('nombre_completo, email, rol')
    .eq('activo', true)
    .order('nombre_completo')

  if (filtro === 'contratistas') consulta = consulta.eq('rol', 'contratista')
  if (filtro === 'equipo')       consulta = consulta.in('rol', [...ROLES_EQUIPO])

  const { data, error } = await consulta
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const vistos = new Set<string>()
  let destinatarios: Destinatario[] = []
  let excluidos = 0

  for (const f of (data ?? []) as Destinatario[]) {
    const email = (f.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@') || email.endsWith(DOMINIO_MARCADOR)) { excluidos++; continue }
    if (vistos.has(email)) continue
    vistos.add(email)
    destinatarios.push({ ...f, email })
  }

  // El candado. La lista se calculó entera —el parte dice a cuántos habría
  // ido— pero lo que sale es UN correo, a la dirección autorizada.
  //
  // No se filtra la lista, se SUSTITUYE. Filtrar dejaba un hueco: con el
  // filtro «Equipo» la dirección autorizada no aparece —su cuenta es de
  // contratista— y la prueba se iba a cero destinatarios sin explicar por qué.
  // Así cualquier filtro se puede probar.
  const alcanceReal = destinatarios.length
  if (CANDADO_DESTINO) {
    const permitido = CANDADO_DESTINO.toLowerCase()
    const { data: suyo } = await admin
      .from('usuarios')
      .select('nombre_completo')
      .ilike('email', permitido)
      .limit(1)
      .maybeSingle()
    destinatarios = [{
      nombre_completo: (suyo as { nombre_completo?: string } | null)?.nombre_completo ?? 'Prueba',
      email: permitido,
      rol: 'prueba',
    }]
  }

  const fallidos: { email: string; error: string }[] = []
  let enviados = 0

  for (const d of destinatarios) {
    const html = baseHtml(asunto, cuerpoAHtml(mensaje, primerNombreDe(d.nombre_completo)), MARCA)
    const res = await enviarCorreo({ to: d.email, subject: asunto, html })
    if (res.ok) enviados++
    else fallidos.push({ email: d.email, error: res.error ?? 'desconocido' })
  }

  return NextResponse.json({
    enviados,
    fallidos,
    excluidos,
    alcanceReal,
    candado: CANDADO_DESTINO,
  })
}
