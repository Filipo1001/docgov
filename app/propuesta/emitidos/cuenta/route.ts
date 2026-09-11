import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

/**
 * La cuenta de documentos emitidos, para que la página se actualice sola.
 *
 * Va por service-role porque `documentos_emitidos` tiene RLS sin políticas:
 * nadie más la lee. Lo único que sale de aquí es un ENTERO — ni códigos, ni
 * nombres, ni contratos. Eso es lo que hace que este extremo pueda ser
 * público sin pedirle nada a nadie.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = createAdminSupabaseClient()
  const { count, error } = await admin
    .from('documentos_emitidos')
    .select('*', { count: 'exact', head: true })

  if (error) return NextResponse.json({ error: 'no disponible' }, { status: 503 })

  return NextResponse.json(
    { emitidos: count ?? 0, momento: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
