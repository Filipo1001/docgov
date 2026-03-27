/**
 * API Route: GET /api/supervisor/colaboradores
 *
 * Returns all contratistas that have contracts supervised by this supervisor.
 * Queries contratos directly — does NOT use contratistas_importados.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  // 1. Verify the user is a supervisor (or admin)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, rol')
    .eq('id', user.id)
    .single()

  if (!usuario || (usuario.rol !== 'supervisor' && usuario.rol !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supervisorId = usuario.id

  // 2. Query all contracts for this supervisor with contratista info and periods
  const { data: contratos } = await supabase
    .from('contratos')
    .select(`
      id, numero, contratista_id, valor_mensual, fecha_inicio, fecha_fin,
      contratista:usuarios!contratos_contratista_id_fkey(
        id, nombre_completo, cedula, email, foto_url, cargo
      ),
      dependencia:dependencias(nombre, abreviatura),
      periodos(estado)
    `)
    .eq('supervisor_id', supervisorId)
    .order('created_at', { ascending: false })

  if (!contratos?.length) return NextResponse.json([])

  const now = new Date().toISOString().slice(0, 10)

  // 3. Group by contratista_id (one person can have multiple contracts)
  const map = new Map<string, any>()

  for (const c of contratos as any[]) {
    const cont = c.contratista
    if (!cont) continue

    const isActivo = c.fecha_inicio <= now && c.fecha_fin >= now
    const periodos: { estado: string }[] = c.periodos ?? []

    const contratoInfo = {
      id: c.id,
      numero: c.numero,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
      valor_mensual: c.valor_mensual,
      resumen: {
        total: periodos.length,
        aprobados: periodos.filter(p => p.estado === 'aprobado' || p.estado === 'radicado').length,
        pendientes: periodos.filter(p => p.estado === 'enviado').length,
      },
    }

    const existing = map.get(cont.id)

    if (!existing) {
      map.set(cont.id, {
        importado_id: 0,
        nombre_completo: cont.nombre_completo,
        cedula: cont.cedula ?? null,
        cargo: cont.cargo ?? '',
        secretaria: (c.dependencia as any)?.nombre ?? null,
        activado: true,
        usuario_id: cont.id,
        foto_url: cont.foto_url ?? null,
        tiene_contrato: true,
        contrato_activo: isActivo ? contratoInfo : null,
        num_contratos: 1,
      })
    } else {
      existing.num_contratos++
      if (isActivo && !existing.contrato_activo) {
        existing.contrato_activo = contratoInfo
      }
    }
  }

  const resultado = Array.from(map.values()).sort((a, b) => {
    const aPend = a.contrato_activo?.resumen.pendientes ?? 0
    const bPend = b.contrato_activo?.resumen.pendientes ?? 0
    if (aPend > 0 && bPend === 0) return -1
    if (aPend === 0 && bPend > 0) return 1
    if (a.contrato_activo && !b.contrato_activo) return -1
    if (!a.contrato_activo && b.contrato_activo) return 1
    return a.nombre_completo.localeCompare(b.nombre_completo)
  })

  return NextResponse.json(resultado)
}
