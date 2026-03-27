import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getDependencias } from '@/services/admin'
import NuevoUsuarioClient from './NuevoUsuarioClient'

export default async function NuevoUsuarioPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: me } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', session.user.id)
    .single()

  if (me?.rol !== 'admin') redirect('/dashboard')

  const dependencias = await getDependencias()

  return <NuevoUsuarioClient dependencias={dependencias} />
}
