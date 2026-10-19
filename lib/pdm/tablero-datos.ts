import 'server-only'
import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { FilaDeCifras } from './tablero'

/**
 * Lo que el tablero del secretario lee de la base además del plan (migración 071). Las dos lecturas van con la SESIÓN de quien mira:
 * la base decide qué le entrega (las cifras entre secretarías solo a administrador, secretaría y Control Interno; el ritmo según la
 * seguridad por filas). Si una falla devuelve `null` y el tablero dice que esa parte no está disponible: nunca se cae entero.
 *
 * `cache` de React: una sola lectura por petición.
 */

export const cargarCifrasPorSecretaria = cache(async (): Promise<FilaDeCifras[] | null> => {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.rpc('pdm_cifras_por_secretaria')
    if (error || !Array.isArray(data)) {
      console.error('[pdm/tablero] cifras por secretaría no leídas:', error?.message ?? 'respuesta inesperada')
      return null
    }
    return data as FilaDeCifras[]
  } catch (e) {
    console.error('[pdm/tablero] cifras por secretaría:', e instanceof Error ? e.message : e)
    return null
  }
})

export const cargarRitmoSemanal = cache(async (desde: string): Promise<{ semana: string; enviados: number; aprobados: number }[] | null> => {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.rpc('pdm_ritmo_semanal', { p_desde: desde })
    if (error || !Array.isArray(data)) {
      console.error('[pdm/tablero] ritmo semanal no leído:', error?.message ?? 'respuesta inesperada')
      return null
    }
    return data as { semana: string; enviados: number; aprobados: number }[]
  } catch (e) {
    console.error('[pdm/tablero] ritmo semanal:', e instanceof Error ? e.message : e)
    return null
  }
})
