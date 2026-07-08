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

  if (me?.rol !== 'admin' && me?.rol !== 'contratacion') redirect('/dashboard')

  const { id } = await params
  const [usuario, dependencias] = await Promise.all([
    getUsuarioAdmin(id),
    getDependencias(),
  ])

  if (!usuario) notFound()

  // Contratación solo puede editar cuentas de contratistas — nunca roles
  // internos ni admin (las actions también lo rechazan; esto evita mostrar
  // el formulario que fallaría al guardar).
  if (me?.rol === 'contratacion' && usuario.rol !== 'contratista') {
    redirect('/dashboard/admin/usuarios')
  }

  return <EditarUsuarioClient usuario={usuario} dependencias={dependencias} />
}
