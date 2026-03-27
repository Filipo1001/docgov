import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getMunicipioAdmin } from '@/services/admin'
import MunicipioClient from './MunicipioClient'

export default async function MunicipioPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: me } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', session.user.id)
    .single()

  if (me?.rol !== 'admin') redirect('/dashboard')

  const municipio = await getMunicipioAdmin()

  return <MunicipioClient municipio={municipio} />
}
