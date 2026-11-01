import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { firmarUrl } from '@/lib/storage-firmado'
import { whatsappDisponible } from '@/lib/whatsapp-cloud'
import MiCuentaClient, { type DatosMiCuenta } from './MiCuentaClient'

/**
 * «Mi cuenta»: el perfil y la configuración en una sola pantalla (antes /dashboard/perfil y /dashboard/configuracion,
 * que ahora redirigen aquí).
 *
 * Se carga en el servidor, de una vez: las dos pantallas viejas cargaban desde el navegador y mostraban un esqueleto
 * mientras tanto. La fila propia se lee con el cliente de servicio porque las columnas bancarias no tienen SELECT
 * para `authenticated` (CLAUDE.md, regla 2); solo se lee la fila de quien está en sesión.
 *
 * Lo que no funciona no se ofrece: WhatsApp solo aparece si el canal está configurado en este entorno, y no hay
 * interruptor para la campana porque la campana avisa siempre.
 */
export default async function MiCuentaPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: u } = await admin
    .from('usuarios')
    .select('nombre_completo, cedula, tipo_documento, email, telefono, direccion, cargo, rol, foto_url, firma_url, banco, tipo_cuenta, numero_cuenta, dependencia_id')
    .eq('id', user.id)
    .single()
  if (!u) redirect('/login')

  const [dependencia, preferencias, firma] = await Promise.all([
    u.dependencia_id
      ? admin.from('dependencias').select('nombre').eq('id', u.dependencia_id).single().then(r => r.data?.nombre ?? null)
      : Promise.resolve(null),
    admin.from('preferencias_notificacion').select('canal, habilitado').eq('usuario_id', user.id).then(r => r.data ?? []),
    u.firma_url ? firmarUrl('documentos', u.firma_url).catch(() => null) : Promise.resolve(null),
  ])

  // Mismo criterio que el envío (lib/notifications.ts): un canal está activo salvo que la persona lo haya apagado.
  const activo = (canal: string) => preferencias.find(p => p.canal === canal)?.habilitado !== false

  const datos: DatosMiCuenta = {
    nombre: u.nombre_completo ?? '',
    documento: u.cedula ?? null,
    tipoDocumento: u.tipo_documento ?? null,
    correo: u.email ?? user.email ?? '',
    telefono: u.telefono ?? '',
    direccion: u.direccion ?? null,
    cargo: u.cargo ?? null,
    rol: u.rol,
    dependencia,
    foto: u.foto_url ?? null,
    firma,
    // La cuenta bancaria solo existe para quien cobra, y se muestra completa: esta pantalla solo la ve su dueño.
    cuentaBancaria: u.rol === 'contratista'
      ? { banco: u.banco ?? null, tipo: u.tipo_cuenta ?? null, numero: u.numero_cuenta ? String(u.numero_cuenta) : null }
      : null,
    avisoCorreo: activo('email'),
    whatsapp: whatsappDisponible() ? { activo: activo('whatsapp') } : null,
  }

  return <MiCuentaClient datos={datos} />
}
