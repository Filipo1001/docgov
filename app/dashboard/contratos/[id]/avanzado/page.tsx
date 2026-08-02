import { requireRole } from '@/lib/auth'
import AvanzadoClient from './AvanzadoClient'

export default async function OpcionesAvanzadasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireRole(['admin', 'contratacion'], `/dashboard/contratos/${id}`)
  return <AvanzadoClient contratoId={id} />
}
