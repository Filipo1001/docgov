'use client'

/**
 * El estado del campo «Plazo (días)» de los formularios de contrato (crear y editar).
 *
 * Mientras nadie lo toca, el campo SIGUE a las fechas: muestra la sugerencia (primer y último día contados) y se actualiza si
 * cambian. En cuanto alguien escribe, manda lo escrito —es lo que dice el contrato— y la sugerencia pasa a ser un aviso. Vaciar el
 * campo NO lo devuelve a la sugerencia a mitad de una corrección: se queda vacío (con la sugerencia de fondo) hasta que se
 * escribe otra cosa o se pulsa «Usar N días». Un campo vacío al guardar se guarda con la sugerencia.
 *
 * Las reglas están en lib/plazo-contrato.ts; esto solo las pega a un formulario.
 */

import { useCallback, useState } from 'react'
import { resolverPlazo } from './plazo-contrato'

export interface EstadoDePlazo {
  /** Lo que muestra el campo. */
  valor: string
  /** Alguien escribió (o vino de un archivo): ya no sigue a las fechas. */
  escrito: boolean
  /** El plazo que se guardaría: lo escrito, o la sugerencia si el campo está vacío; `null` si no hay ninguno o lo escrito no vale. */
  efectivo: number | null
  /** Hay algo escrito que no es un plazo. */
  invalido: boolean
  alEscribir: (texto: string) => void
  /** Vuelve a seguir a las fechas. */
  usarSugerencia: () => void
  /** Fija un plazo que viene de fuera (el Excel de contratación). */
  fijar: (dias: number) => void
}

/** `inicial`: un plazo ya escrito (al editar un contrato cuyo plazo no coincide con sus fechas), o `null` para seguir a las fechas. */
export function usePlazo(porFechas: number | null, inicial: string | null = null): EstadoDePlazo {
  const [texto, setTexto] = useState(inicial ?? '')
  const [tocado, setTocado] = useState(inicial !== null)

  const alEscribir = useCallback((t: string) => { setTexto(t.replace(/\D/g, '').slice(0, 5)); setTocado(true) }, [])
  const usarSugerencia = useCallback(() => { setTexto(''); setTocado(false) }, [])
  const fijar = useCallback((dias: number) => { setTexto(String(dias)); setTocado(true) }, [])

  return { ...resolverPlazo(porFechas, texto, tocado), escrito: tocado, alEscribir, usarSugerencia, fijar }
}
