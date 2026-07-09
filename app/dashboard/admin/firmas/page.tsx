import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { firmarUrls } from '@/lib/storage-firmado'
import FirmasAdminClient from './FirmasAdminClient'

export interface ContratistaFirma {
  id: string
  nombre_completo: string
  contrato_numero: string
  contrato_anio: number
  firma_url: string | null
}

export default async function FirmasAdminPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: me } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', session.user.id)
    .single()

  if (me?.rol !== 'admin') redirect('/dashboard')

  const adminClient = createAdminSupabaseClient()

  const { data } = await adminClient
    .from('contratos')
    .select(`
      numero,
      anio,
      contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, firma_url)
    `)
    .eq('activo', true)
    .order('numero')

  // Bucket documentos privado: firmar todas las firmas en un solo batch
  const firmadas = await firmarUrls(
    'documentos',
    (data ?? []).map((c: any) => c.contratista?.firma_url as string | undefined),
  )

  const contratistas: ContratistaFirma[] = (data ?? [])
    .map((c: any) => ({
      id: c.contratista?.id ?? '',
      nombre_completo: c.contratista?.nombre_completo ?? '',
      contrato_numero: c.numero,
      contrato_anio: c.anio,
      firma_url: c.contratista?.firma_url
        ? (firmadas[c.contratista.firma_url] ?? c.contratista.firma_url)
        : null,
    }))
    .filter((c) => c.id && !c.nombre_completo.toLowerCase().includes('prueba'))
    .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo))

  return <FirmasAdminClient contratistas={contratistas} />
}
