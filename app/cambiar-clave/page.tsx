import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { debeCambiarClave } from '@/lib/clave-inicial'
import CambiarClaveClient from './CambiarClaveClient'

export const metadata = { title: 'Elige tu contraseña', robots: { index: false, follow: false } }

/**
 * Destino de quien entra con la contraseña inicial (su cédula): el middleware lo trae aquí hasta que elija una propia.
 * Ver lib/clave-inicial.ts. La página verifica la sesión de verdad (`getUser` valida el token contra el servidor): sin
 * sesión va al login, y una cuenta que ya no tiene la marca vuelve a la aplicación.
 */
export default async function CambiarClavePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!debeCambiarClave(user.app_metadata)) redirect('/dashboard')

  const nombre = (user.user_metadata?.nombre_completo as string | undefined)?.split(' ')[0]
  return <CambiarClaveClient nombre={nombre ?? null} />
}
