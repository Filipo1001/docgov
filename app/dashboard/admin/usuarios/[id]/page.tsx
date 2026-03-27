import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getUsuarioAdmin, getDependencias } from '@/services/admin'
import EditarUsuarioClient from './EditarUsuarioClient'

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: me } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', session.user.id)
    .single()

  if (me?.rol !== 'admin') redirect('/dashboard')

  const { id } = await params
  const [usuario, dependencias] = await Promise.all([
    getUsuarioAdmin(id),
    getDependencias(),
  ])

  if (!usuario) notFound()

  return <EditarUsuarioClient usuario={usuario} dependencias={dependencias} />
}
