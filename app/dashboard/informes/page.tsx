import { requireRole } from '@/lib/auth'
import InformesClient from './InformesClient'

export default async function InformesPage() {
  await requireRole(['admin', 'supervisor', 'asesor'])
  return <InformesClient />
}
