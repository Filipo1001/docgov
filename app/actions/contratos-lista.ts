'use server'

/**
 * Server Action: lista de contratos con datos bancarios del contratista.
 *
 * Reemplaza a services/contratos.getTodosContratos para la página
 * /dashboard/contratos: las columnas bancarias de usuarios ya no tienen
 * SELECT para authenticated, así que la query corre server-side con el
 * admin client. El scoping por rol se deriva de la SESIÓN (no de parámetros
 * del cliente), por lo que un caller malicioso no puede pedir el scope de otro.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import type { ContratoListItem } from '@/services/contratos'

export async function getTodosContratosConBanco(): Promise<ContratoListItem[]> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: yo } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()
  if (!yo) return []

  const admin = createAdminSupabaseClient()
  let query = admin
    .from('contratos')
    .select(`
      id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses,
      fecha_inicio, fecha_fin,
      contratista:usuarios!contratos_contratista_id_fkey(
        id, nombre_completo, cedula, email, telefono, foto_url,
        firma_url, cargo, banco, tipo_cuenta, numero_cuenta
      ),
      supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
      dependencia:dependencias(id, nombre, abreviatura),
      estado, estado_fecha,
      obligaciones(count),
      periodos(count)
    `)
    .order('numero', { ascending: true })

  // Scoping espejo del RLS, derivado del rol verificado en servidor
  if (yo.rol === 'supervisor') query = query.eq('supervisor_id', user.id)
  else if (yo.rol === 'contratista') query = query.eq('contratista_id', user.id)
  // admin y asesor: todos los contratos (igual que sus policies de lectura)

  const { data, error } = await query
  if (error) throw error

  // Los conteos llegan como [{ count }]; se aplanan para que la tarjeta pueda
  // señalar el contrato que quedó a medias sin consultas extra.
  return ((data ?? []) as any[]).map(c => ({
    ...c,
    num_obligaciones: c.obligaciones?.[0]?.count ?? 0,
    num_periodos: c.periodos?.[0]?.count ?? 0,
  })) as unknown as ContratoListItem[]
}
