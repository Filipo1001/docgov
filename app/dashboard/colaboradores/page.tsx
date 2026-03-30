import { requireRole } from '@/lib/auth'
import ColaboradoresClient from './ColaboradoresClient'

export default async function ColaboradoresPage() {
  await requireRole(['admin', 'supervisor'])
  return <ColaboradoresClient />
}
