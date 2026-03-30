import { requireRole } from '@/lib/auth'
import NuevoContratoClient from './NuevoContratoClient'

export default async function NuevoContratoPage() {
  await requireRole(['admin'])
  return <NuevoContratoClient />
}
