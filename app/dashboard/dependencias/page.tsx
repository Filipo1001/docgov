import { requireRole } from '@/lib/auth'
import { listarDependencias } from '@/app/actions/dependencias'
import DependenciasClient from './DependenciasClient'

export default async function DependenciasPage() {
  await requireRole(['admin', 'contratacion'])
  const dependencias = await listarDependencias()
  return <DependenciasClient initial={dependencias} />
}
