'use client'

import { useState } from 'react'
import type { AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'

/**
 * Abrir un archivo de evidencia en otra pestaña.
 *
 * El servidor firma un enlace de cinco minutos solo si quien pide ve la evidencia (lo decide la base). La pestaña se
 * abre YA, en el clic: si se abriera después de esperar al servidor, el navegador la bloquearía.
 */

function abrirVentana(): Window | null {
  const w = window.open('about:blank', '_blank')
  if (w) w.opener = null
  return w
}

export function useAbrirEvidencia(acciones: Pick<AccionesSeguimiento, 'urlEvidencia'>) {
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function abrir(id: string) {
    setError(null)
    setAbriendo(id)
    const ventana = abrirVentana()
    const r = await acciones.urlEvidencia(id)
    setAbriendo(null)
    if (!r.ok) { ventana?.close(); setError(r.error); return }
    if (ventana) ventana.location.assign(r.datos.url)
    else window.location.assign(r.datos.url)
  }

  return { abrir, abriendo, error }
}
