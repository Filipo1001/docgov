'use client'

/**
 * La tarjeta de un informe en /dashboard/informes (rediseño de noviembre de 2026, con Felipe).
 *
 * Solo lo que la secretaría necesita, en este orden:
 *   1. La persona: su foto (protagonista) y su nombre.
 *   2. El contrato, abreviado: «CN 002». La sigla de la dependencia sobra para quien solo ve la suya; se muestra solo a
 *      quien ve varias (`mostrarDependencia`, administración).
 *   3. El valor del cobro.
 *   4. UNA etiqueta de estado que dice algo útil: «Por revisar · hace 3 días», «Radicado N.º 2026-004518» (el número en
 *      lugar de la palabra), «Devuelto» con su motivo.
 *   5. La planilla, solo cuando hay algo que hacer con ella.
 * Arriba a la derecha, los tres puntos con las opciones que cambian según el estado (ver `opcionesDeInforme`). Aprobar es
 * la única acción a la vista; devolver, que pide un motivo, va en el menú. Toda la tarjeta lleva al informe completo.
 */

import Link from 'next/link'
import Avatar from '@/components/ui/Avatar'
import Icono from '@/components/ui/Icono'
import MenuOpciones, { type OpcionMenu } from '@/components/ui/MenuOpciones'
import { Iconos } from '@/lib/iconos'
import { capitalizarNombre } from '@/lib/format'
import { pesos } from '@/lib/valor-contrato'

export type EstadoTarjeta = 'por_revisar' | 'aprobado' | 'radicado' | 'devuelto' | 'sin_enviar' | 'historico'

export interface DatosTarjetaInforme {
  id: string
  nombre: string
  foto: string | null
  numeroContrato: string
  /** Sigla de la dependencia (SGG, SH…). Solo se pinta con `mostrarDependencia`. */
  dependencia: string | null
  valor: number | null
  estado: EstadoTarjeta
  /** Días desde que se envió (por revisar). */
  diasEsperando: number | null
  numeroRadicado: string | null
  /** Por qué se devolvió. */
  motivo: string | null
  /** Solo cuando la planilla pide atención. */
  planilla: 'pendiente' | 'devuelta' | null
}

function hace(dias: number | null): string {
  if (dias === null) return ''
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

const ESTADO: Record<EstadoTarjeta, { clase: string; icono: typeof Iconos.estado.ok }> = {
  por_revisar: { clase: 'bg-blue-50 text-blue-800 ring-blue-200', icono: Iconos.estado.enEspera },
  aprobado: { clase: 'bg-indigo-50 text-indigo-800 ring-indigo-200', icono: Iconos.estado.ok },
  radicado: { clase: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icono: Iconos.estado.aprobado },
  devuelto: { clase: 'bg-red-50 text-red-800 ring-red-200', icono: Iconos.accion.devolver },
  sin_enviar: { clase: 'bg-amber-50 text-amber-900 ring-amber-200', icono: Iconos.estado.pendiente },
  historico: { clase: 'bg-gray-100 text-gray-700 ring-gray-200', icono: Iconos.estado.bloqueado },
}

function textoEstado(d: DatosTarjetaInforme): string {
  switch (d.estado) {
    case 'por_revisar': return d.diasEsperando === null ? 'Por revisar' : `Por revisar · ${hace(d.diasEsperando)}`
    case 'aprobado': return 'Aprobado · por radicar'
    case 'radicado': return d.numeroRadicado ? `Radicado N.º ${d.numeroRadicado}` : 'Radicado'
    case 'devuelto': return 'Devuelto'
    case 'sin_enviar': return 'Sin enviar'
    case 'historico': return 'Histórico'
  }
}

export default function TarjetaInforme({
  datos,
  href,
  opciones,
  mostrarDependencia = false,
  onAprobar,
  aprobando = false,
}: {
  datos: DatosTarjetaInforme
  /** El informe completo. */
  href: string
  opciones: OpcionMenu[]
  mostrarDependencia?: boolean
  /** Solo para «por revisar»: el botón Aprobar. */
  onAprobar?: () => void
  aprobando?: boolean
}) {
  const nombre = capitalizarNombre(datos.nombre) || 'Sin nombre'
  const estado = ESTADO[datos.estado]

  return (
    <article className="group relative flex flex-col has-[[aria-expanded=true]]:z-20 rounded-2xl border border-gray-200 bg-white p-4 transition-shadow hover:border-gray-300 hover:shadow-md focus-within:ring-2 focus-within:ring-gray-900/20">
      {/* Toda la tarjeta lleva al informe completo: un enlace que la cubre. Lo que se pulsa encima (menú, Aprobar) va por
          encima con `relative z-10`. */}
      <Link href={href} aria-label={`Abrir el informe de ${nombre}`} className="absolute inset-0 z-0 rounded-2xl outline-none" />

      <div className="flex items-start gap-3">
        <Avatar nombre={nombre} foto={datos.foto} clases="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="truncate text-[15px] font-semibold leading-snug text-gray-900">{nombre}</h3>
          <p className="mt-0.5 text-sm text-gray-600">
            <span className="font-semibold tabular-nums text-gray-900">CN {datos.numeroContrato}</span>
            {mostrarDependencia && datos.dependencia && <span className="text-gray-500"> · {datos.dependencia}</span>}
            <span className="text-gray-400" aria-hidden="true"> · </span>
            <span className="tabular-nums">{pesos(datos.valor)}</span>
          </p>
        </div>
        <div className="relative z-10 -mr-1.5 -mt-1.5">
          <MenuOpciones opciones={opciones} etiqueta={`Opciones del informe de ${nombre}`} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${estado.clase}`}>
          <Icono glifo={estado.icono} tamano="sm" />
          <span className="tabular-nums">{textoEstado(datos)}</span>
        </span>
        {datos.planilla && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
            datos.planilla === 'devuelta' ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-amber-50 text-amber-900 ring-amber-200'
          }`}>
            {datos.planilla === 'devuelta' ? 'Planilla devuelta' : 'Planilla por revisar'}
          </span>
        )}
      </div>

      {datos.estado === 'devuelto' && datos.motivo && (
        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-gray-600">«{datos.motivo}»</p>
      )}

      {datos.estado === 'por_revisar' && onAprobar && (
        <div className="relative z-10 mt-3.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onAprobar}
            disabled={aprobando}
            className="inline-flex min-h-9 items-center rounded-lg bg-gray-900 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            {aprobando ? 'Aprobando…' : 'Aprobar'}
          </button>
        </div>
      )}
    </article>
  )
}
