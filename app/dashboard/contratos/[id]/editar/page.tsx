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
  const [{ data: contrato }, dependencias, usuarios, bloqueo, historial] = await Promise.all([
    admin.from('contratos').select('*').eq('id', id).single(),
    getDependencias(),
    getUsuariosParaSelect(),
    getCamposBloqueados(id),
    getHistorialContrato(id),
  ])

  if (!contrato) redirect('/dashboard/contratos')

  return (
    <EditarContratoClient
      contrato={contrato}
      dependencias={dependencias.map(d => ({ id: d.id, nombre: d.nombre }))}
      supervisores={usuarios.filter(u => u.rol === 'supervisor' || u.rol === 'admin')}
      bloqueo={bloqueo}
      historial={historial}
    />
  )
}
