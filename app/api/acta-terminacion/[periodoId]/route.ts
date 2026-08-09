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

  const { data: acta } = await admin
    .from('actas_terminacion')
    .select('pdf_path')
    .eq('contrato_id', periodo.contrato_id)
    .maybeSingle()

  if (!acta?.pdf_path) {
    return NextResponse.json({ error: 'El acta de terminación aún no ha sido generada.' }, { status: 404 })
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
