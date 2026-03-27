/**
 * API Route: GET /api/supervisor/colaboradores/:id
 *
 * Returns full detail for a person (usuario UUID) including all contracts + periods.
 * Only returns contracts supervised by the authenticated supervisor.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function isContratoActivo(inicio: string, fin: string): boolean {
  const now = new Date().toISOString().slice(0, 10)
  return inicio <= now && fin >= now
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: usuarioId } = await params

  // 1. Verify supervisor
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('usuarios')
    .select('id, rol')
    .eq('id', user.id)
    .single()

  if (!currentUser || (currentUser.rol !== 'supervisor' && currentUser.rol !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supervisorId = currentUser.id

  // 2. Get user profile
  const { data: userProfile } = await supabase
    .from('usuarios')
    .select('id, nombre_completo, cedula, email, telefono, foto_url, cargo, direccion')
    .eq('id', usuarioId)
    .single()

  if (!userProfile) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  // 3. Get all contracts for this person supervised by this supervisor
  const { data: contratos } = await supabase
    .from('contratos')
    .select(`
      id, numero, objeto, valor_total, valor_mensual,
      fecha_inicio, fecha_fin, plazo_meses,
      dependencia:dependencias(nombre, abreviatura),
      periodos(id, contrato_id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado, fecha_envio, motivo_rechazo)
    `)
    .eq('contratista_id', usuarioId)
    .eq('supervisor_id', supervisorId)
    .order('fecha_inicio', { ascending: false })

  return NextResponse.json({
    persona: {
      importado_id: 0,
      nombre_completo: userProfile.nombre_completo,
      cedula: userProfile.cedula,
      cargo: userProfile.cargo ?? '',
      secretaria: null,
      activado: true,
    },
    usuario: userProfile,
    contratos: (contratos ?? []).map((c: any) => ({
      id: c.id,
      numero: c.numero,
      objeto: c.objeto,
      valor_total: c.valor_total,
      valor_mensual: c.valor_mensual,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
      plazo_meses: c.plazo_meses,
      activo: isContratoActivo(c.fecha_inicio, c.fecha_fin),
      dependencia: c.dependencia,
      periodos: ((c.periodos ?? []) as any[]).sort(
        (a: any, b: any) => a.numero_periodo - b.numero_periodo
      ),
    })),
  })
}
