import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import CorreoMasivoClient from './CorreoMasivoClient'

export const metadata = { title: 'Correo masivo' }

export default async function CorreoMasivoPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: yo } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', session.user.id)
    .single()

  if (yo?.rol !== 'admin') redirect('/dashboard')

  return <CorreoMasivoClient />
}
