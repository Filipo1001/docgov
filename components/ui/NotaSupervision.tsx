'use client'

/**
 * La nota de la supervisión, en una tarjeta emergente.
 *
 * El contratista veía la etiqueta «Con nota» pero para leerla tenía que salir
 * al acta de supervisión —el documento donde va redactada—, buscarla y volver.
 * La corrección vivía lejos del trabajo que la corrige.
 *
 * ── Por qué emergente y no en línea ──────────────────────────────────────
 *
 * El primer intento la puso en el cuerpo de la obligación. Funcionaba, pero un
 * periodo con varias notas convertía la pantalla en un muro de texto: cada
 * obligación sumaba un párrafo que solo importa mientras se corrige esa. Aquí
 * el texto aparece cuando se pide y desaparece cuando no.
 *
 * ── El hover no puede ser la única puerta ────────────────────────────────
 *
 * En un teléfono no existe el puntero, y este producto se usa sobre todo desde
 * el teléfono: el contratista carga sus evidencias desde donde esté. Un
 * `onMouseEnter` como único disparador dejaría la nota inalcanzable justo para
 * quien más la necesita.
 *
 * Por eso hay dos caminos, y el de tocar es el que manda:
 *
 *   · Con ratón, se abre al pasar por encima y se cierra al salir.
 *   · Al tocar o hacer clic queda FIJADA: no se cierra al mover el puntero,
 *     solo con otro clic, con Escape o tocando fuera. Sin esto, en un portátil
 *     con pantalla táctil la tarjeta se abriría y cerraría sola.
 *
 * El hover se consulta con `matchMedia('(hover: hover)')` y no por ancho de
 * pantalla: una tableta con teclado tiene ancho de escritorio y ningún puntero.
 *
 * ── Un detalle que rompía el clic ────────────────────────────────────────
 *
 * La etiqueta vive dentro de la zona que despliega la obligación. Sin
 * `stopPropagation`, abrir la nota colapsaría la fila debajo.
 */

import { useEffect, useId, useRef, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { MARCA } from '@/lib/marca'

export default function NotaSupervision({
  nota,
  /** Una obligación sin aprobar pide corregir; una aprobada solo comenta. */
  esCorreccion,
}: {
  nota: string
  esCorreccion: boolean
}) {
  const [abierta, setAbierta] = useState(false)
  const [fijada, setFijada] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const idPanel = useId()

  // Cerrar con Escape y al tocar fuera. Solo se escucha mientras hay algo
  // abierto: registrar oyentes globales por cada nota de la pantalla, con
  // decenas de obligaciones, sería trabajo por nada.
  useEffect(() => {
    if (!abierta) return

    const alTocarFuera = (e: MouseEvent | TouchEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) {
        setAbierta(false)
        setFijada(false)
      }
    }
    const alPulsarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAbierta(false); setFijada(false) }
    }

    document.addEventListener('mousedown', alTocarFuera)
    document.addEventListener('touchstart', alTocarFuera)
    document.addEventListener('keydown', alPulsarTecla)
    return () => {
      document.removeEventListener('mousedown', alTocarFuera)
      document.removeEventListener('touchstart', alTocarFuera)
      document.removeEventListener('keydown', alPulsarTecla)
    }
  }, [abierta])

  const hayPuntero = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches

  const acento = esCorreccion ? '#F59E0B' : '#38BDF8'

  return (
    <div
      ref={contenedor}
      className="relative inline-flex"
      onMouseEnter={() => { if (hayPuntero()) setAbierta(true) }}
      onMouseLeave={() => { if (hayPuntero() && !fijada) setAbierta(false) }}
    >
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idPanel}
        onClick={(e) => {
          // La etiqueta está dentro de la zona que despliega la obligación.
          e.stopPropagation()
          e.preventDefault()
          const siguiente = !(abierta && fijada)
          setAbierta(siguiente)
          setFijada(siguiente)
        }}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium
          border transition-colors cursor-pointer
          ${esCorreccion
            ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'}`}
      >
        <Icono glifo={Iconos.aviso.mensaje} tamano="sm" className="w-3.5 h-3.5" />
        {esCorreccion ? 'Ver qué corregir' : 'Ver nota'}
      </button>

      {abierta && (
        <div
          id={idPanel}
          role="dialog"
          aria-label={esCorreccion ? 'Qué debes corregir' : 'Nota de la supervisión'}
          onClick={(e) => e.stopPropagation()}
          /* En móvil se ancla al borde inferior de la pantalla: una tarjeta
             flotante de 320 px junto a una etiqueta se sale del viewport o
             queda recortada por el `overflow` de la tarjeta que la contiene.
             Desde `sm` sí flota junto a la etiqueta. */
          className="fixed inset-x-4 bottom-4 z-50 rounded-2xl p-4 shadow-2xl
                     sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:left-0 sm:mt-2
                     sm:w-80"
          style={{ backgroundColor: MARCA }}
        >
          <div className="flex items-start gap-2.5">
            <span
              className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${acento}22` }}
            >
              <Icono
                glifo={esCorreccion ? Iconos.estado.advertencia : Iconos.estado.informacion}
                tamano="sm"
                className={esCorreccion ? 'text-amber-400' : 'text-sky-400'}
              />
            </span>
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: acento }}
              >
                {esCorreccion ? 'Qué debes corregir' : 'Nota de la supervisión'}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/90 whitespace-pre-line break-words">
                {nota}
              </p>
            </div>
          </div>

          {/* Solo en móvil: con el dedo no hay «salir del elemento», y el toque
              fuera puede caer sobre otro control de la pantalla. Un cierre
              explícito evita que la tarjeta se sienta atrapada. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAbierta(false); setFijada(false) }}
            className="sm:hidden mt-3 w-full rounded-lg bg-white/10 py-2 text-xs font-semibold text-white/80"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
