import { requireContractAccess } from '@/lib/auth'
import ContratoDetalleClient from './ContratoDetalleClient'

export default async function ContratoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireContractAccess(id)
  return <ContratoDetalleClient />
}
