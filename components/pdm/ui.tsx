/**
 * Las piezas de pantalla que se repiten en todo el módulo.
 *
 * Son de presentación pura (sin estado ni efectos), así que sirven igual desde el servidor que
 * desde el navegador. La razón de que existan es la misma de `tema.ts`: que un rótulo, un estado o
 * una franja de cifras se vean idénticos en todas las pantallas sin copiar clases.
 */

import type { ReactNode } from 'react'
import { ESTADOS, type Estado } from '@/lib/pdm/plan'
import { SITUACIONES, type SituacionAnio } from '@/lib/pdm/seguimiento'
import { T } from './tema'

/** Rótulo en mayúscula sostenida, como los de los formatos oficiales. */
export function Rotulo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`${T.rotulo} ${className}`}>{children}</p>
}

/**
 * El marcador de un estado: un cuadradito de color. Hueco = «falta algo por hacer» (todavía no es
 * ningún estado, es un pendiente). Nunca va solo: siempre lo acompaña la palabra.
 */
export function Marcador({ clase, hueco = false }: { clase: string; hueco?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-[2px] ${hueco ? 'border-[1.5px] border-[#192031] bg-transparent' : clase}`}
    />
  )
}

/** Cómo va un indicador frente a su meta: marcador + palabra. */
export function EstadoTexto({ estado, className = '' }: { estado: Estado; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#192031] ${className}`}>
      <Marcador clase={ESTADOS[estado].punto} />
      {ESTADOS[estado].rotulo}
    </span>
  )
}

/** En qué punto va un indicador dentro del año: marcador + palabra. */
export function SituacionTexto({ situacion, className = '' }: { situacion: SituacionAnio; className?: string }) {
  const s = SITUACIONES[situacion]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#192031] ${className}`}>
      <Marcador clase={s.punto} hueco={situacion === 'falta'} />
      {s.rotulo}
    </span>
  )
}

/** Un sello pequeño con borde, para marcar algo («Corrección», «Versión anterior», «Conservada»). */
export function Sello({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[4px] border border-[#C5CBD6] bg-white px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.1em] text-[#556072]">
      {children}
    </span>
  )
}

/** Un panel: la unidad con que se ordena toda pantalla. Con rótulo opcional y regla debajo. */
export function Panel({ titulo, nota, acciones, className = '', sinRelleno = false, children }: {
  titulo?: string
  /** Texto corto a la derecha del título (una cuenta, una fecha). */
  nota?: ReactNode
  acciones?: ReactNode
  className?: string
  /** Para listas que llegan de borde a borde (cada fila pone su propio relleno). */
  sinRelleno?: boolean
  children: ReactNode
}) {
  return (
    <section className={`${T.panel} ${className}`}>
      {(titulo || acciones) && (
        <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b ${T.regla} px-4 py-3 sm:px-5`}>
          <div className="flex items-baseline gap-3">
            {titulo && <h2 className={T.rotulo}>{titulo}</h2>}
            {nota && <span className={`text-xs ${T.tenue}`}>{nota}</span>}
          </div>
          {acciones}
        </div>
      )}
      {sinRelleno ? children : <div className="px-4 py-4 sm:px-5">{children}</div>}
    </section>
  )
}

export interface Cifra {
  titulo: string
  valor: string
  nota: string
  /** `alerta` pinta la cifra en rojo: solo para lo que de verdad exige acción. */
  tono?: 'neutro' | 'alerta' | 'bien'
}

/**
 * Las cifras que se leen primero, en UNA franja con divisiones finas (una hoja de totales) y no
 * en cuatro tarjetas sueltas. Con `gap-px` sobre un fondo de regla, las divisiones salen solas, a
 * cualquier ancho y número de columnas.
 */
export function Cifras({ items }: { items: Cifra[] }) {
  const color = { neutro: 'text-[#192031]', alerta: 'text-[#B42318]', bien: 'text-[#2E7D5B]' }
  return (
    <dl className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border ${T.reglaFuerte} bg-[#DCE0E8] ${items.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
      {items.map(c => (
        <div key={c.titulo} className="bg-white px-4 py-4 sm:px-5">
          <dt className={T.rotulo}>{c.titulo}</dt>
          <dd className={`mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums ${color[c.tono ?? 'neutro']}`}>{c.valor}</dd>
          <dd className={`mt-2 text-xs leading-snug ${T.suave}`}>{c.nota}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Los datos de referencia de una pantalla, en celdas con rótulo, como el cuadro de datos de un
 * formato oficial (código, versión, fecha). Es lo que dice, de un vistazo, de qué año y de qué
 * plan se está hablando.
 */
export function FichaDatos({ datos, className = '' }: { datos: { rotulo: string; valor: ReactNode }[]; className?: string }) {
  return (
    <dl className={`flex flex-wrap gap-px overflow-hidden rounded-lg border ${T.reglaFuerte} bg-[#DCE0E8] ${className}`}>
      {datos.map(d => (
        <div key={d.rotulo} className="min-w-[6.5rem] flex-auto bg-white px-3.5 py-2">
          <dt className={T.rotulo}>{d.rotulo}</dt>
          <dd className="mt-0.5 whitespace-nowrap text-sm font-semibold text-[#192031]">{d.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Una sección de la ficha de un indicador: rótulo en mayúscula y, debajo, el contenido. Las secciones
 * se separan entre sí con una regla fina (como los apartados de un formato), no con cajas.
 */
export function Seccion({ rotulo, acciones, children }: { rotulo: string; acciones?: ReactNode; children: ReactNode }) {
  return (
    <section className={`border-t ${T.regla} pt-5 first:border-t-0 first:pt-0`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Rotulo>{rotulo}</Rotulo>
        {acciones}
      </div>
      {children}
    </section>
  )
}
