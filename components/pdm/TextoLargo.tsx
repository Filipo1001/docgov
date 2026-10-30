'use client'

/**
 * Un texto que puede ser largo (lo que se hizo en un reporte: hasta 10.000 caracteres, ver `MAX_TEXTO_REPORTE`) visto en la ficha: se
 * muestran las primeras seis líneas y «Leer todo» despliega el resto. Felipe (30-oct-2026): «recortado con Leer todo», como las listas
 * compactas, para que la ficha no se vuelva kilométrica.
 *
 *   · El botón aparece SOLO si el texto de verdad no cabe: se mide (no se adivina por el número de caracteres), y se vuelve a medir si
 *     cambia el ancho (girar el teléfono, abrir la ficha en otra pantalla).
 *   · «Ver menos» con el comienzo del texto por encima de la vista no saca a nadie de donde estaba (ver `desplazamiento.ts`).
 *   · El recorte es solo visual: un lector de pantalla lee el texto entero.
 */

import { useEffect, useRef, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { empiezaFueraDeVista, plegarSinMoverAncla } from './desplazamiento'

/** Antes de medir, una suposición para no hacer aparecer el botón un instante después: con más de esto, casi seguro no cabe en seis líneas. */
const SUPONER_LARGO_DESDE = 500

export default function TextoLargo({ texto, className = '' }: {
  texto: string
  /** Las clases del párrafo (color, tamaño, interlineado). */
  className?: string
}) {
  const parrafo = useRef<HTMLParagraphElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [noCabe, setNoCabe] = useState(texto.length > SUPONER_LARGO_DESDE)

  // Se mide mientras está recortado: si lo que ocupa el texto es más alto que las seis líneas, no cabe.
  useEffect(() => {
    const p = parrafo.current
    if (!p || abierto) return
    const medir = new ResizeObserver(() => setNoCabe(p.scrollHeight > p.clientHeight + 1))
    medir.observe(p)
    return () => medir.disconnect()
  }, [abierto, texto])

  function alternar() {
    if (!abierto) { setAbierto(true); return }
    const p = parrafo.current
    const b = boton.current
    if (p && b && empiezaFueraDeVista(p, b)) plegarSinMoverAncla(b, () => setAbierto(false))
    else setAbierto(false)
  }

  return (
    <div>
      <p ref={parrafo} className={`whitespace-pre-line [overflow-wrap:anywhere] ${abierto ? '' : 'line-clamp-6'} ${className}`}>{texto}</p>
      {(noCabe || abierto) && (
        <button
          ref={boton}
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          className="group mt-0.5 flex w-fit items-center gap-1.5 rounded py-1 text-xs font-medium text-[#2D3648] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031]"
        >
          <Icono glifo={Iconos.accion.desplegar} tamano="sm" className={`shrink-0 text-[#667085] transition-transform duration-200 motion-reduce:transition-none ${abierto ? 'rotate-180' : ''}`} />
          <span className="underline decoration-[#C5CBD6] underline-offset-2 group-hover:text-[#192031] group-hover:decoration-[#192031]">
            {abierto ? 'Ver menos' : 'Leer todo'}
          </span>
        </button>
      )}
    </div>
  )
}
