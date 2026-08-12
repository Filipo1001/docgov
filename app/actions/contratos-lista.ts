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
    .select('rol, dependencia_id')
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
      periodos(estado, mes, anio, es_historico, habilitado_tardio)
    `)
    .order('numero', { ascending: true })

  // Scoping derivado del rol verificado en servidor.
  if (yo.rol === 'supervisor') query = query.eq('supervisor_id', user.id)
  else if (yo.rol === 'contratista') query = query.eq('contratista_id', user.id)
  // El asesor se acota a SU DEPENDENCIA, no a todo el municipio. Su política de
  // lectura es más amplia, pero `requireContractAccess` solo le abre los de su
  // dependencia y /dashboard/informes ya lo filtraba igual: devolver aquí los
  // 118 contratos le llenaba la lista de tarjetas que al abrirlas rebotan.
  else if (yo.rol === 'asesor' && yo.dependencia_id) {
    query = query.eq('dependencia_id', yo.dependencia_id)
  }
  // admin y contratación: todo el municipio.

  const { data, error } = await query
  if (error) throw error

  // Las obligaciones llegan como [{ count }]; los periodos, como filas, porque
  // la tarjeta necesita algo más que cuántos hay: cuáles esperan revisión y
  // cuáles quedaron atrás sin enviar. Son cinco campos escalares por periodo.
  return ((data ?? []) as any[]).map(c => ({
    ...c,
    num_obligaciones: c.obligaciones?.[0]?.count ?? 0,
    num_periodos: c.periodos?.length ?? 0,
  })) as unknown as ContratoListItem[]
}
