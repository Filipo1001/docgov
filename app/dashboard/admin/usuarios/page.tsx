import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getUsuariosAdmin, getContratistasImportados, getDependencias } from '@/services/admin'
import AdminUsuariosClient from './AdminUsuariosClient'

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  // La pestaña llega por URL (?tab=pendientes) y se resuelve en el servidor:
  // así el enlace del panel de contratación aterriza directo en "Por activar",
  // sin necesitar useSearchParams ni un Suspense en el cliente.
  const { tab } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: me } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', session.user.id)
    .single()

  if (me?.rol !== 'admin' && me?.rol !== 'contratacion') redirect('/dashboard')

  const [usuarios, pendientes, dependencias] = await Promise.all([
    getUsuariosAdmin(),
    getContratistasImportados(),
    getDependencias(),
  ])

  return (
    <AdminUsuariosClient
      usuarios={usuarios}
      pendientes={pendientes}
      dependencias={dependencias}
      tabInicial={tab === 'pendientes' ? 'pendientes' : 'activos'}
    />
  )
}
