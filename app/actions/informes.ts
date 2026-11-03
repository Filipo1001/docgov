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
import { firmarUrls } from '@/lib/storage-firmado'
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

/** La planilla de un informe, lista para verla en una ventana: los dos documentos ya firmados y lo necesario para decidir. */
export interface PlanillaInforme {
  estado: string
  esHistorico: boolean
  numero: string | null
  revision: 'pendiente' | 'aprobada' | 'rechazada' | null
  comentario: string | null
  planilla: { url: string; esPdf: boolean } | null
  soporte: { url: string; esPdf: boolean } | null
  /** La cédula del contratista: la contraseña con que suelen venir cifradas las planillas. */
  cedula: string | null
}

const esPdf = (url: string) => /\.pdf($|\?)/i.test(url)

/**
 * La planilla de seguridad social (y su soporte de pago) de UN informe, para la ventana de /dashboard/informes.
 *
 * El periodo se lee con la sesión de quien mira: si la base no le deja verlo (el supervisor solo ve sus contratos), no hay
 * nada que firmar. Solo entonces se firman los enlaces, que caducan como los de la página del periodo.
 */
export async function obtenerPlanillaInforme(periodoId: string): Promise<PlanillaInforme> {
  if (!/^[0-9a-f-]{36}$/i.test(periodoId)) throw new Error('Informe no válido')

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesión no disponible')

  const { data: yo } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  if (!yo || !ROLES_CON_INFORMES.includes(yo.rol as string)) throw new Error('No autorizado')

  const { data: p, error } = await supabase
    .from('periodos')
    .select('estado, es_historico, numero_planilla, planilla_estado, planilla_comentario, planilla_ss_url, soporte_pago_url, contrato:contratos(contratista:usuarios!contratos_contratista_id_fkey(cedula))')
    .eq('id', periodoId)
    .single()
  if (error || !p) throw new Error('No se encontró el informe')

  const fila = p as unknown as {
    estado: string; es_historico: boolean; numero_planilla: string | null
    planilla_estado: PlanillaInforme['revision']; planilla_comentario: string | null
    planilla_ss_url: string | null; soporte_pago_url: string | null
    contrato: { contratista: { cedula: string | null } | null } | null
  }
  const firmadas = await firmarUrls('documentos', [fila.planilla_ss_url, fila.soporte_pago_url])
  const documento = (url: string | null) => url ? { url: firmadas[url] ?? url, esPdf: esPdf(url) } : null

  return {
    estado: fila.estado,
    esHistorico: fila.es_historico,
    numero: fila.numero_planilla,
    revision: fila.planilla_estado,
    comentario: fila.planilla_comentario,
    planilla: documento(fila.planilla_ss_url),
    soporte: documento(fila.soporte_pago_url),
    cedula: fila.contrato?.contratista?.cedula ?? null,
  }
}
