'use client'

/**
 * «Informe PDF»: abre un recuadro donde el secretario decide si el documento lleva a su equipo por nombre y lo descarga.
 *
 * El informe se pide al servidor con lo que se ve (el año y la medida de la pantalla) y se baja con `fetch`, no con un enlace: así,
 * si algo falla, el recuadro lo dice en vez de dejar un archivo roto en la carpeta de descargas. Por defecto el documento no trae a
 * nadie por su nombre; lo marca quien lo pide, cada vez.
 */

import { useEffect, useId, useRef, useState } from 'react'
import type { MedidaDelTablero } from '@/lib/pdm/tablero'

const BOTON = 'rounded-md border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-1'

type Estado = 'quieto' | 'generando' | 'error'

export default function BotonDeInforme({ anio, medida }: { anio: number; medida: MedidaDelTablero }) {
  const [abierto, setAbierto] = useState(false)
  const [conEquipo, setConEquipo] = useState(false)
  const [estado, setEstado] = useState<Estado>('quieto')
  const raiz = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const idPanel = useId()

  // Se cierra con Esc o con un clic fuera; al cerrar con Esc el foco vuelve al botón.
  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus() } }
    const alHacerClic = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('keydown', alTeclear)
    document.addEventListener('mousedown', alHacerClic)
    return () => { document.removeEventListener('keydown', alTeclear); document.removeEventListener('mousedown', alHacerClic) }
  }, [abierto])

  async function descargar() {
    setEstado('generando')
    try {
      const r = await fetch(`/api/pdm-tablero/pdf?anio=${anio}&medida=${medida}&equipo=${conEquipo ? 1 : 0}`, { credentials: 'same-origin' })
      if (!r.ok) throw new Error(String(r.status))
      const nombre = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? `tablero-${anio}.pdf`
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a')
      a.href = url; a.download = nombre
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setEstado('quieto')
      setAbierto(false)
    } catch {
      setEstado('error')
    }
  }

  return (
    <div ref={raiz} className="relative">
      <button
        ref={boton} type="button" aria-expanded={abierto} aria-controls={idPanel} onClick={() => { setAbierto(a => !a); setEstado('quieto') }}
        className={`${BOTON} border-[#C5CBD6] bg-white text-[#556072] hover:border-[#192031] hover:text-[#192031]`}
      >Informe PDF</button>
      {abierto && (
        <div id={idPanel} role="dialog" aria-label="Informe en PDF" className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-[#DCE0E8] bg-white p-4">
          <p className="text-[13px] font-semibold text-[#192031]">Informe de {anio}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#556072]">
            Una hoja A4 apaisada con tu secretaría, el plan, la comparación, lo que necesita atención y los sectores. Lleva lo que ves ahora: el año {anio} y la medida elegida.
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-[#192031]">
            <input type="checkbox" checked={conEquipo} onChange={e => setConEquipo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#192031]" />
            <span>
              Incluir la lista de mi equipo, con nombres
              <span className="mt-0.5 block text-[#556072]">Va en una segunda hoja. Sin marcarla, el informe no trae a nadie por su nombre.</span>
            </span>
          </label>
          {estado === 'error' && <p role="alert" className="mt-3 text-xs font-medium text-[#B42318]">No se pudo generar el informe. Vuelve a intentarlo en unos minutos.</p>}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setAbierto(false); boton.current?.focus() }} className={`${BOTON} border-[#C5CBD6] bg-white text-[#556072] hover:border-[#192031] hover:text-[#192031]`}>Cerrar</button>
            <button
              type="button" onClick={descargar} disabled={estado === 'generando'} aria-busy={estado === 'generando'}
              className={`${BOTON} border-[#192031] bg-[#192031] text-white hover:bg-[#242F45] disabled:cursor-wait disabled:opacity-70`}
            >{estado === 'generando' ? 'Generando…' : 'Descargar'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
