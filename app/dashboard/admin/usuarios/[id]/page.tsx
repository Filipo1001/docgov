import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getUsuarioAdmin, getDependencias } from '@/services/admin'
import { firmarUrls } from '@/lib/storage-firmado'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { hoyEnColombia, vigenciaDe } from '@/lib/vigencia-contrato'
import type { ContratoDelUsuario } from './ContratosDelUsuario'
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

  // La firma vive en el bucket privado: se muestra con una URL firmada. Solo se consulta si el usuario la tiene.
  const firmaUrl = usuario.firma_url
    ? (await firmarUrls('documentos', [usuario.firma_url]))[usuario.firma_url] ?? null
    : null

  // Los contratos que tuvo como contratista (vigentes y finalizados). Se leen con el cliente de servicio porque la página
  // ya verificó que quien mira es admin o contratación; «vigente» o «finalizado» lo decide la regla común del sistema.
  const { data: filas } = await createAdminSupabaseClient()
    .from('contratos')
    .select('id, numero, anio, valor_total, estado, fecha_fin, fecha_terminacion, fecha_fin_efectiva')
    .eq('contratista_id', id)
    .order('anio', { ascending: false })
    .order('numero', { ascending: false })
  const hoy = hoyEnColombia()
  const contratos: ContratoDelUsuario[] = (filas ?? []).map(c => ({
    id: c.id as string,
    numero: c.numero as string,
    anio: c.anio as number,
    valorTotal: Number(c.valor_total ?? 0),
    vigencia: vigenciaDe(c, hoy),
  }))

  return <EditarUsuarioClient usuario={usuario} dependencias={dependencias} firmaUrl={firmaUrl} contratos={contratos} />
}
