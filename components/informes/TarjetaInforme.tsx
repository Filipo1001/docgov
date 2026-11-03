'use client'

/**
 * La tarjeta de un informe en /dashboard/informes (rediseño de noviembre de 2026, con Felipe).
 *
 * Solo lo que la secretaría necesita, en este orden:
 *   1. La persona: su foto (protagonista) y su nombre.
 *   2. El contrato, abreviado: «CN 002». La sigla de la dependencia sobra para quien solo ve la suya; se muestra solo a
 *      quien ve varias (`mostrarDependencia`).
 *   3. El valor del cobro.
 *   4. En el pie, el estado como texto con su icono (sin óvalos): «Por revisar · hace 3 días», «Aprobado · falta
 *      radicar», «Devuelto» con su motivo. Lo radicado muestra su número: «N.º 02228».
 * Arriba, un velo suave del color del estado: se distingue de lejos qué tarjeta pide qué, sin una etiqueta más.
 *   5. La planilla, solo cuando hay algo que hacer con ella.
 * Arriba a la derecha, los tres puntos con las opciones que cambian según el estado (ver `opcionesDeInforme`). Aprobar es
 * la única acción a la vista; devolver, que pide un motivo, va en el menú. Toda la tarjeta lleva al informe completo.
 */

import { useState } from 'react'
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

/** El estado en el pie: icono y palabra en el color del estado, y un complemento en gris. */
const ESTADO: Record<EstadoTarjeta, { color: string; velo: string; icono: typeof Iconos.estado.ok; texto: string }> = {
  por_revisar: { color: 'text-blue-700', velo: 'from-blue-100/70', icono: Iconos.estado.enEspera, texto: 'Por revisar' },
  aprobado: { color: 'text-indigo-700', velo: 'from-indigo-100/70', icono: Iconos.estado.ok, texto: 'Aprobado' },
  radicado: { color: 'text-emerald-700', velo: 'from-emerald-100/70', icono: Iconos.estado.aprobado, texto: 'Radicado' },
  devuelto: { color: 'text-red-700', velo: 'from-red-100/60', icono: Iconos.accion.devolver, texto: 'Devuelto' },
  sin_enviar: { color: 'text-amber-800', velo: 'from-amber-100/70', icono: Iconos.estado.pendiente, texto: 'Sin enviar' },
  historico: { color: 'text-gray-600', velo: 'from-gray-100', icono: Iconos.estado.bloqueado, texto: 'Histórico' },
}

function complemento(d: DatosTarjetaInforme): string | null {
  if (d.estado === 'por_revisar') return d.diasEsperando === null ? null : hace(d.diasEsperando)
  if (d.estado === 'aprobado') return 'falta radicar'
  return null
}

export default function TarjetaInforme({
  datos,
  href,
  opciones,
  mostrarDependencia = false,
  onAprobar,
  aprobando = false,
  onCopiarRadicado,
}: {
  datos: DatosTarjetaInforme
  /** El informe completo. */
  href: string
  opciones: OpcionMenu[]
  mostrarDependencia?: boolean
  /** Solo para «por revisar»: el botón Aprobar. */
  onAprobar?: () => void
  aprobando?: boolean
  /** Copia el número de radicado; devuelve si se pudo. */
  onCopiarRadicado?: (numero: string) => Promise<boolean>
}) {
  const [copiado, setCopiado] = useState(false)
  const nombre = capitalizarNombre(datos.nombre) || 'Sin nombre'
  const extra = complemento(datos)
  const estado = ESTADO[datos.estado]

  return (
    <article className="group relative flex min-h-[13.5rem] flex-col rounded-2xl border border-gray-200 bg-white transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg focus-within:ring-2 focus-within:ring-gray-900/20 motion-reduce:transition-none motion-reduce:hover:translate-y-0 has-[[aria-expanded=true]]:z-20">
      {/* Un velo suave del color del estado en la parte de arriba. */}
      <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-2xl bg-gradient-to-b ${estado.velo} to-transparent`} />

      {/* Toda la tarjeta lleva al periodo de esa persona: un enlace que la cubre. El contenido de encima deja pasar el toque
          (`pointer-events-none`) para que tocar el nombre, la foto o el valor también abra; solo lo que se pulsa por sí
          mismo (menú, Aprobar, el número de radicado) lo recupera con `pointer-events-auto`. */}
      <Link href={href} aria-label={`Abrir el informe de ${nombre}`} className="absolute inset-0 z-0 rounded-2xl outline-none" />

      <div className="pointer-events-none relative flex flex-1 flex-col p-5 pr-12">
        <div className="flex items-start gap-3.5">
          <Avatar nombre={nombre} foto={datos.foto} clases="h-14 w-14 text-lg ring-4 ring-white shadow-sm" />
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="line-clamp-2 text-base font-semibold leading-snug text-gray-900">{nombre}</h3>
            <p className="mt-1 text-sm font-semibold tabular-nums text-gray-500">
              CN {datos.numeroContrato}
              {mostrarDependencia && datos.dependencia && <span className="font-normal"> · {datos.dependencia}</span>}
            </p>
          </div>
        </div>

        <p className="mt-4 text-xl font-semibold tracking-tight tabular-nums text-gray-900">
          <span className="sr-only">Valor del cobro: </span>{pesos(datos.valor)}
        </p>

        {datos.estado === 'devuelto' && datos.motivo && (
          <p className="mt-2 line-clamp-2 text-sm italic leading-relaxed text-gray-600">«{datos.motivo}»</p>
        )}
      </div>

      <div className="pointer-events-none relative mx-5 mt-auto flex min-h-[3.5rem] flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-100 py-3">
        {datos.estado === 'radicado' && datos.numeroRadicado ? (
          // El número se copia tocándolo. En computador, al pasar el mouse aparece «Copiar»; en el teléfono basta tocarlo.
          <button
            type="button"
            onClick={async () => {
              if (!onCopiarRadicado || !(await onCopiarRadicado(datos.numeroRadicado!))) return
              setCopiado(true)
              setTimeout(() => setCopiado(false), 1800)
            }}
            aria-label={`Radicado con el número ${datos.numeroRadicado}. Copiar el número`}
            className={`group/rad pointer-events-auto relative z-10 -mx-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm font-semibold transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${estado.color}`}
          >
            <Icono glifo={copiado ? Iconos.estado.ok : estado.icono} tamano="sm" />
            <span className="tabular-nums"><span aria-hidden="true">N.º </span>{datos.numeroRadicado}</span>
            <span aria-live="polite" className={`inline-flex items-center gap-1 text-xs font-medium transition-opacity ${copiado ? 'opacity-100' : 'opacity-0 group-hover/rad:opacity-100 group-focus-visible/rad:opacity-100'}`}>
              {copiado ? 'Copiado' : <><Icono glifo={Iconos.accion.copiar} tamano="sm" />Copiar</>}
            </span>
          </button>
        ) : (
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${estado.color}`}>
            <Icono glifo={estado.icono} tamano="sm" />
            {estado.texto}
            {extra && <span className="font-normal text-gray-500">· {extra}</span>}
          </span>
        )}

        {datos.planilla && (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${datos.planilla === 'devuelta' ? 'text-red-700' : 'text-amber-800'}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${datos.planilla === 'devuelta' ? 'bg-red-500' : 'bg-amber-500'}`} />
            {datos.planilla === 'devuelta' ? 'Planilla devuelta' : 'Planilla por revisar'}
          </span>
        )}

        {datos.estado === 'por_revisar' && onAprobar && (
          <button
            type="button"
            onClick={onAprobar}
            disabled={aprobando}
            className="pointer-events-auto relative z-10 ml-auto inline-flex min-h-9 items-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            {aprobando ? 'Aprobando…' : 'Aprobar'}
          </button>
        )}
      </div>

      <div className="absolute right-3 top-3 z-10">
        <MenuOpciones opciones={opciones} etiqueta={`Opciones del informe de ${nombre}`} />
      </div>
    </article>
  )
}
