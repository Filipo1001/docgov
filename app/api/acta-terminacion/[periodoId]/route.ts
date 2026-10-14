import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verificarAccesoPeriodo } from '@/lib/pdf/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Sirve el Acta de Terminación ya generada para el contrato al que pertenece
 * este periodo. El documento es inmutable —se generó una vez al aceptarlo— así
 * que aquí solo se resuelve una signed URL del bucket privado y se redirige.
 *
 * Espejo de /api/certificacion/[periodoId].
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ periodoId: string }> },
) {
  const { periodoId } = await params
  const supabase = await createServerSupabaseClient()

  const acceso = await verificarAccesoPeriodo(supabase, periodoId)
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.message }, { status: acceso.status })
  }

  const admin = createAdminSupabaseClient()

  const { data: periodo } = await admin
    .from('periodos')
    .select('contrato_id')
    .eq('id', periodoId)
    .single()
  if (!periodo) return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })

  // Un contrato puede conservar actas anteriores «sin efecto» (migración 063). Se sirve la aceptada en ESTE periodo; y si
  // en este no se aceptó ninguna, la vigente del contrato (que es lo que se servía cuando solo había una).
  const { data: actas } = await admin
    .from('actas_terminacion')
    .select('pdf_path, periodo_id, vigencia')
    .eq('contrato_id', periodo.contrato_id)
    .order('created_at', { ascending: false })
  const acta = actas?.find(a => a.periodo_id === periodoId) ?? actas?.find(a => a.vigencia === 'vigente') ?? null

  // Sin `pdf_path` el acta fue aceptada por el contratista pero la
  // administración aún no la ha suscrito: no hay documento que servir.
  if (!acta?.pdf_path) {
    return NextResponse.json(
      { error: 'El acta de terminación se emitirá cuando el supervisor apruebe el informe final.' },
      { status: 404 },
    )
  }

  const { data: signed } = await admin.storage
    .from('actas-terminacion')
    .createSignedUrl(acta.pdf_path, 300)

  if (!signed?.signedUrl) {
    return NextResponse.json({ error: 'No se pudo acceder al documento.' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
