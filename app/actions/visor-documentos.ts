'use server'

/**
 * Cuando un documento no se puede mostrar dentro de la aplicación, el navegador lo cuenta aquí y queda en el registro del
 * servidor (Vercel), con el navegador y el dispositivo. Sirve para saber POR QUÉ falla en un teléfono concreto sin tener
 * ese teléfono en la mano: el texto que ve la persona es amable; este, el exacto.
 *
 * No guarda nada en la base y no lleva la dirección firmada (solo la ruta, sin el permiso temporal).
 */

import { headers } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function reportarFalloDocumento(fallo: {
  donde: 'paginas' | 'visor'
  mensaje: string
  tecnico: string | null
  ruta: string
}): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const h = await headers()
    const corto = (s: string | null, n: number) => (s ?? '').slice(0, n)
    console.error('[visor-documento] no se pudo mostrar', JSON.stringify({
      donde: fallo.donde,
      mensaje: corto(fallo.mensaje, 300),
      tecnico: corto(fallo.tecnico, 500),
      ruta: corto(fallo.ruta.split('?')[0], 300),
      usuario: user.id,
      navegador: corto(h.get('user-agent'), 400),
    }))
  } catch { /* el reporte nunca molesta a quien mira */ }
}
