'use client'

/**
 * La vida del informe en una tira de puntos.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 *
 * Antes esta información se daba en una línea de texto relativa —«Devuelto
 * hace 1 h · se había enviado hace 1 h»— que en el mejor de los casos ocupaba
 * dos renglones y en el peor decía dos veces lo mismo. Y la trazabilidad
 * completa vive al final de la página, en doce filas que nadie recorre para
 * resolver la pregunta de siempre: quién movió esto, cuándo y en calidad de
 * qué.
 *
 * Aquí cabe entera en el alto de una línea. Cada punto es un movimiento; al
 * pasar por encima —o al tocarlo— aparece la ficha con acción, nombre, rol y
 * fecha con hora. En reposo no dice nada, y ese es el objetivo: que esté
 * disponible sin competir con el resto de la pantalla.
 *
 * ── Gris salvo el final ──────────────────────────────────────────────────
 *
 * Todos los puntos son grises menos el último, que toma un tono apagado de su
 * estado. Así se ve de un vistazo en qué acabó sin que la tira se convierta en
 * un semáforo: la línea de estado de al lado ya lleva el color fuerte, y dos
 * cosas gritando el mismo dato es justo lo que satura una pantalla.
 *
 * ── El hover no puede ser la única puerta ────────────────────────────────
 *
 * Mismo criterio que components/ui/NotaSupervision.tsx: en un teléfono no hay
 * puntero. Con ratón se abre al pasar por encima; al tocar queda fijada y se
 * cierra con otro toque, con Escape o tocando fuera.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { MARCA } from '@/lib/marca'
import type { EstadoPeriodo } from '@/lib/types'

export interface EventoTraza {
  id: string
  estado_anterior: EstadoPeriodo | null
  estado_nuevo: EstadoPeriodo | null
  created_at: string
  usuario?: { id: string; nombre_completo: string; rol?: string } | null
}

/**
 * El verbo, no el estado. La trazabilidad responde «qué pasó», y «Enviado» o
 * «Devuelto» se entienden solos donde «enviado»/«rechazado» —los valores de la
 * columna— suenan a jerga de base de datos.
 */
function accionDe(ev: EventoTraza): string {
  const a = ev.estado_anterior
  switch (ev.estado_nuevo) {
    case 'borrador':  return 'Devuelto a borrador'
    case 'enviado':
      // El mismo estado destino significa dos cosas distintas según de dónde
      // venga: si venía de revisión, no es un envío — es la secretaría
      // devolviéndolo a los asesores.
      return a === 'revision' || a === 'enviado' ? 'Devuelto a los asesores' : 'Enviado a revisión'
    case 'revision':  return 'Revisado por el asesor'
    case 'aprobado':  return 'Aprobado'
    case 'rechazado': return 'Devuelto para corrección'
    case 'radicado':  return 'Radicado'
    default:          return 'Actualizado'
  }
}

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  asesor: 'Asesor',
  contratista: 'Contratista',
  contratacion: 'Contratación',
}

/** Tonos apagados a propósito: el color fuerte ya lo lleva la etiqueta de estado. */
function colorDe(estado: EstadoPeriodo | null, esUltimo: boolean): string {
  if (!esUltimo) return 'bg-gray-300'
  switch (estado) {
    case 'aprobado':
    case 'radicado':  return 'bg-emerald-400'
    case 'rechazado': return 'bg-red-300'
    default:          return 'bg-gray-400'
  }
}

function fechaConHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export default function TrazaPeriodo({ eventos }: { eventos: EventoTraza[] }) {
  const [abierto, setAbierto] = useState<number | null>(null)
  const [fijado, setFijado] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const idBase = useId()

  useEffect(() => {
    if (abierto === null) return
    const fuera = (e: MouseEvent | TouchEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) { setAbierto(null); setFijado(false) }
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAbierto(null); setFijado(false) }
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('touchstart', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('touchstart', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  if (!eventos.length) return null

  const hayPuntero = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches

  return (
    <div ref={contenedor} className="relative inline-flex items-center gap-1">
      {eventos.map((ev, i) => {
        const esUltimo = i === eventos.length - 1
        const activo = abierto === i
        return (
          <span key={ev.id} className="inline-flex items-center gap-1">
            {i > 0 && <span className="w-3 h-px bg-gray-200 shrink-0" aria-hidden="true" />}
            <button
              type="button"
              aria-expanded={activo}
              aria-controls={`${idBase}-${i}`}
              aria-label={`${accionDe(ev)} — ${fechaConHora(ev.created_at)}`}
              onMouseEnter={() => { if (hayPuntero() && !fijado) setAbierto(i) }}
              onMouseLeave={() => { if (hayPuntero() && !fijado) setAbierto(null) }}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                const siguiente = !(activo && fijado)
                setAbierto(siguiente ? i : null)
                setFijado(siguiente)
              }}
              /* El punto mide 7px pero el botón 20: por debajo de eso no se
                 acierta con el dedo, y una traza que no se puede abrir en el
                 teléfono no sirve para nada. */
              className="w-5 h-5 -m-1 inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              <span
                className={`block rounded-full transition-all ${colorDe(ev.estado_nuevo, esUltimo)} ${
                  activo ? 'w-2.5 h-2.5' : 'w-[7px] h-[7px]'
                }`}
              />
            </button>
          </span>
        )
      })}

      {abierto !== null && eventos[abierto] && (
        <div
          id={`${idBase}-${abierto}`}
          role="dialog"
          aria-label="Detalle del movimiento"
          onClick={(e) => e.stopPropagation()}
          /* En móvil se ancla al borde inferior: una ficha flotante junto a un
             punto de 7px se sale del viewport. Desde `sm` cuelga bajo la tira.
             Hacia abajo y no hacia arriba porque la tira vive al pie de su
             tarjeta: abriéndose arriba tapaba el mensaje de la tarjeta que la
             contiene, que es justo lo que se había venido a leer. */
          className="fixed inset-x-4 bottom-4 z-50 rounded-2xl p-3.5 shadow-2xl
                     sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:mt-2 sm:w-64"
          style={{ backgroundColor: MARCA }}
        >
          <p className="text-[13px] font-semibold text-white leading-snug">
            {accionDe(eventos[abierto])}
          </p>
          {eventos[abierto].usuario?.nombre_completo && (
            <p className="text-xs text-white/90 mt-1.5 break-words">
              {eventos[abierto].usuario!.nombre_completo}
            </p>
          )}
          {eventos[abierto].usuario?.rol && (
            <p className="text-[11px] text-white/50 mt-0.5">
              {ROL_LABEL[eventos[abierto].usuario!.rol!] ?? eventos[abierto].usuario!.rol}
            </p>
          )}
          <p className="text-[11px] text-white/50 mt-2 pt-2 border-t border-white/10">
            {fechaConHora(eventos[abierto].created_at)}
          </p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAbierto(null); setFijado(false) }}
            className="sm:hidden mt-3 w-full rounded-lg bg-white/10 py-2 text-xs font-semibold text-white/80"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
