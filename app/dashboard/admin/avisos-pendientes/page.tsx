import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import AvisosPendientesClient from './AvisosPendientesClient'

export default async function AvisosPendientesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (me?.rol !== 'admin') redirect('/dashboard')

  return <AvisosPendientesClient />
}
