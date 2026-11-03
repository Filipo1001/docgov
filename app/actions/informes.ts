'use server'

/**
 * Server Action: los informes de un mes para /dashboard/informes (administración, secretarías y asesores).
 *
 * POR QUÉ EXISTE. La pantalla cargaba el mes que se abre con datos del servidor (rápido), pero al cambiar de mes —«estoy en
 * noviembre y quiero ver octubre»— pedía los datos con el cliente de Supabase del NAVEGADOR. Es el mismo defecto que ya tuvo
 * el panel de inicio (ver app/actions/dashboard.ts): la capa de autenticación de ese cliente se puede quedar colgada —una
 * promesa que nunca se asienta, sobre todo tras volver a una pestaña dormida o con la red móvil intermitente—, y entonces
 * la consulta ni sale, ni falla: la pantalla queda en «Cargando…» para siempre y solo se arregla recargando. Se midió que
 * la consulta en sí tarda 1,5 ms en la base: la demora nunca fue de los datos.
 *
 * Por el servidor, la petición viaja por HTTP a Next y pasa por el middleware, que renueva la cookie de sesión: la capa de
 * autenticación del navegador sale de la ruta crítica.
 *
 * La identidad y la dependencia salen SIEMPRE de la sesión, nunca de parámetros del cliente. Lo que cada rol ve lo sigue
 * decidiendo la base (las mismas reglas de acceso de siempre): el supervisor solo ve sus contratos.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { MESES } from '@/lib/constants'
import { SELECT_INFORMES_MES, separarInformesDelMes, type InformesDelMes } from '@/lib/informes-mes'
import type { Periodo } from '@/lib/types'

const ROLES_CON_INFORMES = ['admin', 'supervisor', 'asesor']

export async function obtenerInformesDelMes(mes: string, anio: number): Promise<InformesDelMes> {
  if (!(MESES as readonly string[]).includes(mes) || !Number.isInteger(anio) || anio < 2020 || anio > 2100) {
    throw new Error('Mes no válido')
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesión no disponible')

  const { data: yo } = await supabase.from('usuarios').select('rol, dependencia_id').eq('id', user.id).single()
  if (!yo || !ROLES_CON_INFORMES.includes(yo.rol as string)) throw new Error('No autorizado')

  const { data, error } = await supabase
    .from('periodos')
    .select(SELECT_INFORMES_MES)
    .eq('mes', mes)
    .eq('anio', anio)
    .order('fecha_envio', { ascending: true })
  // Errores lanzados, no tragados: un fallo es un estado de la pantalla (con «Reintentar»), no una lista vacía.
  if (error) throw error

  const depId = yo.rol === 'asesor' ? ((yo.dependencia_id as string | null) ?? undefined) : undefined
  return separarInformesDelMes((data ?? []) as unknown as Periodo[], depId)
}

/** Un paso del historial de un informe, con quién lo dio. */
export interface PasoHistorial {
  id: string
  estado_anterior: string | null
  estado_nuevo: string | null
  comentario: string | null
  created_at: string
  usuario: { nombre_completo: string; rol: string | null } | null
}

/**
 * El historial de UN informe, para la ventana «Historial del informe» de /dashboard/informes. Se lee con la sesión de quien
 * mira: si la base no le deja ver ese periodo, la lista sale vacía, igual que en la página del periodo.
 */
export async function obtenerHistorialInforme(periodoId: string): Promise<PasoHistorial[]> {
  if (!/^[0-9a-f-]{36}$/i.test(periodoId)) throw new Error('Informe no válido')

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesión no disponible')

  const { data, error } = await supabase
    .from('historial_periodos')
    .select('id, estado_anterior, estado_nuevo, comentario, created_at, usuario:usuarios!historial_periodos_usuario_id_fkey(nombre_completo, rol)')
    .eq('periodo_id', periodoId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as PasoHistorial[]
}
