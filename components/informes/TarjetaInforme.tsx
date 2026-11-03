'use client'

/**
 * La tarjeta de un informe en /dashboard/informes (rediseño de noviembre de 2026, con Felipe).
 *
 * Solo lo que la secretaría necesita, en este orden:
 *   1. La persona: su foto (protagonista) y su nombre.
 *   2. El contrato, abreviado: «CN 002». Además va grande y vertical en el fondo, como marca de agua. La sigla de la
 *      dependencia sobra para quien solo ve la suya; se muestra solo a quien ve varias (`mostrarDependencia`).
 *   3. El valor del cobro.
 *   4. En el pie, el estado como texto con su icono (sin óvalos): «Por revisar · hace 3 días», «Aprobado · falta
 *      radicar», «Devuelto» con su motivo. Lo radicado no lleva la palabra: es un sello con su número.
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

/** El estado en el pie: icono y palabra en el color del estado, y un complemento en gris. */
const ESTADO: Record<Exclude<EstadoTarjeta, 'radicado'>, { color: string; icono: typeof Iconos.estado.ok; texto: string }> = {
  por_revisar: { color: 'text-blue-700', icono: Iconos.estado.enEspera, texto: 'Por revisar' },
  aprobado: { color: 'text-indigo-700', icono: Iconos.estado.aprobado, texto: 'Aprobado' },
  devuelto: { color: 'text-red-700', icono: Iconos.accion.devolver, texto: 'Devuelto' },
  sin_enviar: { color: 'text-amber-800', icono: Iconos.estado.pendiente, texto: 'Sin enviar' },
  historico: { color: 'text-gray-600', icono: Iconos.estado.bloqueado, texto: 'Histórico' },
}

function complemento(d: DatosTarjetaInforme): string | null {
  if (d.estado === 'por_revisar') return d.diasEsperando === null ? null : hace(d.diasEsperando)
  if (d.estado === 'aprobado') return 'falta radicar'
  return null
}

/** Para la marca de agua basta el consecutivo: «170-2026» → «170». */
function consecutivo(numero: string): string {
  return numero.split('-')[0] || numero
}

/** El radicado como un sello de ventanilla: solo el número, con «N.º» y el icono del sello. */
function SelloRadicado({ numero }: { numero: string | null }) {
  return (
    <span
      className="inline-flex -rotate-2 items-center gap-2 rounded-lg border-[3px] border-double border-emerald-600/70 bg-emerald-50/60 px-3 py-1.5 text-emerald-800"
      title="Número de radicado"
    >
      <Icono glifo={Iconos.estado.radicado} tamano="md" />
      <span className="sr-only">Número de radicado: </span>
      {numero ? (
        <span className="font-mono text-lg font-bold leading-none tracking-wide tabular-nums">
          <span aria-hidden="true" className="mr-1 text-xs font-semibold opacity-70">N.º</span>{numero}
        </span>
      ) : (
        <span className="text-sm font-semibold">Radicado</span>
      )}
    </span>
  )
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
  const extra = complemento(datos)

  return (
    <article className="group relative flex min-h-[13.5rem] flex-col rounded-2xl border border-gray-200 bg-white transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg focus-within:ring-2 focus-within:ring-gray-900/20 motion-reduce:transition-none motion-reduce:hover:translate-y-0 has-[[aria-expanded=true]]:z-20">
      {/* El contrato, grande y vertical en el borde derecho: marca de agua, solo decorativa. Va en su propia capa
          recortada para que el menú de los tres puntos (que se sale de la tarjeta) no quede cortado. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <span className="absolute -right-1.5 bottom-2 select-none whitespace-nowrap text-[3.6rem] font-black leading-none tracking-tighter text-gray-900/[0.045] [writing-mode:vertical-rl] rotate-180 transition-colors duration-200 group-hover:text-gray-900/[0.07]">
          CN {consecutivo(datos.numeroContrato)}
        </span>
      </div>

      {/* Toda la tarjeta lleva al informe completo: un enlace que la cubre. Lo que se pulsa encima (menú, Aprobar) va por
          encima con `relative z-10`. */}
      <Link href={href} aria-label={`Abrir el informe de ${nombre}`} className="absolute inset-0 z-0 rounded-2xl outline-none" />

      <div className="relative flex flex-1 flex-col p-5 pr-14">
        <div className="flex items-start gap-3.5">
          <Avatar nombre={nombre} foto={datos.foto} clases="h-14 w-14 text-lg" />
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

      <div className="relative mx-5 mt-auto flex min-h-[3.5rem] flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-100 py-3 pr-9">
        {datos.estado === 'radicado' ? (
          <SelloRadicado numero={datos.numeroRadicado} />
        ) : (
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${ESTADO[datos.estado].color}`}>
            <Icono glifo={ESTADO[datos.estado].icono} tamano="sm" />
            {ESTADO[datos.estado].texto}
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
            className="relative z-10 ml-auto inline-flex min-h-9 items-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
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
