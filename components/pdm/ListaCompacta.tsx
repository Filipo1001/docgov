'use client'

/**
 * Una lista de archivos que, con muchos, se muestra COMPACTA: los primeros y, debajo, «Ver los N archivos restantes». Cuándo se
 * compacta y cuántos se ven lo dice `lib/pdm/lista-compacta.ts` (una sola regla para todo el módulo).
 *
 * ── Sin saltos ───────────────────────────────────────────────────────────
 *
 *   · Lo escondido se despliega con la curva de `Despliegue`: crece, no aparece de golpe.
 *   · «Ver menos» al fondo de una lista larga: plegada con la curva, lo que se mira saldría disparado hacia arriba y la persona
 *     quedaría en otra parte de la pantalla. Si el comienzo de lo desplegado quedó por ENCIMA de la vista, se pliega de golpe y en el
 *     mismo instante se corrige el desplazamiento (de la ventana o de la ficha que lo contiene): el botón se queda bajo el dedo.
 *   · Lo que importa de lo escondido se dice junto al botón (`resumen`: «2 no se pudieron subir», «1 devuelto»): nada urgente queda
 *     detrás de un clic sin que se sepa.
 *
 * Pinta dos `<ul>` con las mismas clases (lo que se ve y lo que se despliega) y el botón; quien la usa pinta cada `<li>`.
 */

import { Fragment, useId, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { partirLista, textoVerResto } from '@/lib/pdm/lista-compacta'
import { Despliegue } from './Movimiento'

/** Lo que se desplaza cuando la lista crece: la ventana o, dentro de una ficha con su propio desplazamiento, la ficha. */
function contenedorConScroll(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && p.scrollHeight > p.clientHeight) return p
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement
}

/** El botón en el módulo, y en la verificación pública (que tiene su propia paleta). */
const TONOS = {
  pdm: {
    boton: 'text-[#2D3648] focus-visible:ring-[#192031]',
    etiqueta: 'decoration-[#C5CBD6] group-hover:text-[#192031] group-hover:decoration-[#192031]',
    tenue: 'text-[#667085]',
  },
  publico: {
    boton: 'text-slate-700 focus-visible:ring-slate-900',
    etiqueta: 'decoration-slate-300 group-hover:text-slate-900 group-hover:decoration-slate-900',
    tenue: 'text-slate-500',
  },
} as const

export default function ListaCompacta<T>({
  lista, clave, children: pintar, className = '', separacion = 'pt-1.5', resumen, nombre, tono = 'pdm', claseBoton = 'mt-0.5',
}: {
  lista: readonly T[]
  clave: (elemento: T) => string
  /** Cómo se pinta cada elemento: un `<li>`. */
  children: (elemento: T) => ReactNode
  /** Las clases de cada `<ul>` (las dos mitades llevan las mismas). */
  className?: string
  /** El espacio entre lo que se ve y lo que se despliega: el mismo que hay entre dos elementos (con `space-y-1.5`, `pt-1.5`). */
  separacion?: string
  /** Lo que importa de lo escondido, dicho junto al botón mientras está plegado (o nada). */
  resumen?: (resto: readonly T[]) => ReactNode
  /** Cómo se llaman los elementos en el botón (por defecto, «archivo» / «archivos»). */
  nombre?: { uno: string; varios: string }
  tono?: keyof typeof TONOS
  /** El margen del botón respecto de la lista (ya tiene 4 px de aire arriba y abajo para el dedo). */
  claseBoton?: string
}) {
  const { primeros, resto } = partirLista(lista)
  const [abierta, setAbierta] = useState(false)
  const [deGolpe, setDeGolpe] = useState(false)
  const id = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const desplegado = useRef<HTMLDivElement>(null)

  function alternar() {
    if (!abierta) { setDeGolpe(false); setAbierta(true); return }
    const b = boton.current
    const d = desplegado.current
    if (!b || !d) { setAbierta(false); return }
    const caja = contenedorConScroll(b)
    const techo = caja === document.scrollingElement || caja === document.documentElement ? 0 : caja.getBoundingClientRect().top
    // Lo desplegado empieza dentro de la vista: plegarlo con la curva no saca a nadie de donde estaba.
    if (d.getBoundingClientRect().top >= techo) { setDeGolpe(false); setAbierta(false); return }
    const antes = b.getBoundingClientRect().top
    flushSync(() => { setDeGolpe(true); setAbierta(false) })
    caja.scrollTop += b.getBoundingClientRect().top - antes
  }

  const t = TONOS[tono]
  const dicho = !abierta && resto.length > 0 && resumen ? resumen(resto) : null
  return (
    <>
      <ul className={className}>
        {primeros.map(x => <Fragment key={clave(x)}>{pintar(x)}</Fragment>)}
      </ul>
      {resto.length > 0 && (
        <>
          <div id={id} ref={desplegado}>
            <Despliegue abierto={abierta} separacion={separacion} deGolpe={deGolpe}>
              <ul className={className}>
                {resto.map(x => <Fragment key={clave(x)}>{pintar(x)}</Fragment>)}
              </ul>
            </Despliegue>
          </div>
          <button
            ref={boton}
            type="button"
            onClick={alternar}
            aria-expanded={abierta}
            aria-controls={id}
            // `flex w-fit`: en su propia línea (lo que venga después no se le pega al lado), y del ancho de lo que dice. `py-1`: 24 px de alto
            // para el dedo, sin que se vea más grande.
            className={`group flex w-fit max-w-full items-center gap-1.5 rounded py-1 text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 ${t.boton} ${claseBoton}`}
          >
            <Icono glifo={Iconos.accion.desplegar} tamano="sm" className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${t.tenue} ${abierta ? 'rotate-180' : ''}`} />
            <span className={`underline underline-offset-2 ${t.etiqueta}`}>{abierta ? 'Ver menos' : textoVerResto(resto.length, nombre)}</span>
            {dicho && <span className={`font-normal ${t.tenue}`}>· {dicho}</span>}
          </button>
        </>
      )}
    </>
  )
}
