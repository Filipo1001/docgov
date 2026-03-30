import { requireRole } from '@/lib/auth'
import ContratistasClient from './ContratistasClient'

export default async function ContratistasPage() {
  await requireRole(['admin', 'asesor'])
  return <ContratistasClient />
}
