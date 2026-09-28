'use server'

/**
 * Apoyo del modal de detalle de una notificación.
 *
 * Los avisos del cron enumeran contratos por su NÚMERO —«186 (LAURA…)»—, que es
 * lo que un gestor reconoce, pero las rutas van por id. Esto traduce lo uno en
 * lo otro para que cada fila del modal sea un enlace al contrato y no un dato
 * muerto que haya que ir a buscar a mano.
 *
 * Va con la sesión del usuario, no con la clave de servicio: si alguien no puede
 * ver un contrato, su número simplemente no se resuelve y la fila queda como
 * texto. La RLS decide, no este archivo.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function resolverContratos(
  numeros: string[],
): Promise<Record<string, string>> {
  const limpios = [...new Set(numeros.map(n => n.trim()).filter(Boolean))].slice(0, 50)
  if (!limpios.length) return {}

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('contratos')
    .select('id, numero')
    .in('numero', limpios)

  if (error) return {}

  const mapa: Record<string, string> = {}
  for (const c of (data ?? []) as { id: string; numero: string }[]) {
    mapa[c.numero] = c.id
  }
  return mapa
}
