import { requireRole } from '@/lib/auth'
import AprobacionesClient from './AprobacionesClient'

export default async function AprobacionesPage() {
  await requireRole(['admin', 'supervisor'])
  return <AprobacionesClient />
}
