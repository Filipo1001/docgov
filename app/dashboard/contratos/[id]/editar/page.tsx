import { requireRole } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { getDependencias, getUsuariosParaSelect } from '@/services/admin'
import { getCamposBloqueados, getHistorialContrato } from '@/app/actions/contratos'
import EditarContratoClient from './EditarContratoClient'

export default async function EditarContratoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireRole(['admin', 'contratacion'], `/dashboard/contratos/${id}`)

  const admin = createAdminSupabaseClient()
  const [{ data: contrato }, dependencias, usuarios, bloqueo, historial, { data: otrosies }] = await Promise.all([
    admin.from('contratos').select('*').eq('id', id).single(),
    getDependencias(),
    getUsuariosParaSelect(),
    getCamposBloqueados(id),
    getHistorialContrato(id),
    // Los días de los otrosíes YA aplicados: movieron la fecha de terminación pero no el plazo escrito (lib/plazo-contrato.ts).
    admin.from('otrosies').select('plazo_dias_adicion').eq('contrato_id', id).not('aplicado_en', 'is', null),
  ])
  const diasOtrosi = (otrosies ?? []).reduce((t, o) => t + (Number(o.plazo_dias_adicion) || 0), 0)

  if (!contrato) redirect('/dashboard/contratos')

  return (
    <EditarContratoClient
      contrato={contrato}
      dependencias={dependencias.map(d => ({ id: d.id, nombre: d.nombre }))}
      supervisores={usuarios.filter(u => u.rol === 'supervisor')}
      bloqueo={bloqueo}
      historial={historial}
      diasOtrosi={diasOtrosi}
    />
  )
}
