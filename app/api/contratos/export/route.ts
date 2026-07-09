/**
 * GET /api/contratos/export — relación de contratos en Excel (.xlsx).
 *
 * Acceso: admin y contratación. Genera un libro con una fila por contrato:
 * número, contratista, cédula, dependencia, supervisor, valores, plazo,
 * fechas y estado de vigencia. Pensado para las relaciones que Contratación
 * entrega a Hacienda / control interno.
 */

import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: yo } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  if (!yo || !['admin', 'contratacion'].includes(yo.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const admin = createAdminSupabaseClient()
  const { data: contratos } = await admin
    .from('contratos')
    .select(`
      numero, anio, objeto, valor_total, valor_mensual, plazo_dias,
      fecha_inicio, fecha_fin, cdp, crp,
      contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula, email, telefono),
      supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo),
      dependencia:dependencias(nombre)
    `)
    .order('numero')

  type Row = {
    numero: string; anio: number; objeto: string; valor_total: number; valor_mensual: number
    plazo_dias: number; fecha_inicio: string; fecha_fin: string; cdp: string | null; crp: string | null
    contratista: { nombre_completo: string; cedula: string | null; email: string | null; telefono: string | null } | null
    supervisor: { nombre_completo: string } | null
    dependencia: { nombre: string } | null
  }
  const rows = (contratos ?? []) as unknown as Row[]
  const hoy = new Date().toISOString().slice(0, 10)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Contratista Digital'
  const ws = wb.addWorksheet('Contratos')

  ws.columns = [
    { header: 'N.° Contrato', key: 'numero', width: 14 },
    { header: 'Año', key: 'anio', width: 8 },
    { header: 'Contratista', key: 'contratista', width: 34 },
    { header: 'Cédula', key: 'cedula', width: 16 },
    { header: 'Correo', key: 'email', width: 28 },
    { header: 'Teléfono', key: 'telefono', width: 14 },
    { header: 'Dependencia', key: 'dependencia', width: 28 },
    { header: 'Supervisor', key: 'supervisor', width: 30 },
    { header: 'Objeto', key: 'objeto', width: 50 },
    { header: 'Valor total', key: 'valor_total', width: 18 },
    { header: 'Valor mensual', key: 'valor_mensual', width: 16 },
    { header: 'Plazo (días)', key: 'plazo_dias', width: 12 },
    { header: 'Fecha inicio', key: 'fecha_inicio', width: 14 },
    { header: 'Fecha fin', key: 'fecha_fin', width: 14 },
    { header: 'CDP', key: 'cdp', width: 12 },
    { header: 'CRP', key: 'crp', width: 12 },
    { header: 'Estado', key: 'estado', width: 12 },
  ]

  // Encabezado con estilo
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
  ws.getRow(1).alignment = { vertical: 'middle' }

  for (const c of rows) {
    ws.addRow({
      numero: c.numero,
      anio: c.anio,
      contratista: c.contratista?.nombre_completo ?? '',
      cedula: c.contratista?.cedula ?? '',
      email: c.contratista?.email ?? '',
      telefono: c.contratista?.telefono ?? '',
      dependencia: c.dependencia?.nombre ?? '',
      supervisor: c.supervisor?.nombre_completo ?? '',
      objeto: c.objeto,
      valor_total: c.valor_total,
      valor_mensual: c.valor_mensual,
      plazo_dias: c.plazo_dias,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
      cdp: c.cdp ?? '',
      crp: c.crp ?? '',
      estado: c.fecha_fin >= hoy ? 'Vigente' : 'Terminado',
    })
  }

  // Formato de moneda en las columnas de valor
  ws.getColumn('valor_total').numFmt = '"$"#,##0'
  ws.getColumn('valor_mensual').numFmt = '"$"#,##0'

  const buffer = await wb.xlsx.writeBuffer()
  const nombre = `Contratos_${hoy}.xlsx`

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
    },
  })
}
