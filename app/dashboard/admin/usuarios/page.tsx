import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getUsuariosAdmin, getContratistasImportados, getDependencias } from '@/services/admin'
import AdminUsuariosClient from './AdminUsuariosClient'

export default async function AdminUsuariosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: me } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', session.user.id)
    .single()

  if (me?.rol !== 'admin') redirect('/dashboard')

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
    />
  )
}
