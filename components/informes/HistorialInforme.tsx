'use client'

/**
 * «Historial del informe»: la vida de un informe en una ventana, sin salir de /dashboard/informes.
 *
 * Arriba, tres cifras que responden lo que se pregunta primero: cuándo llegó, cuánto tardó en aprobarse y cuántas veces
 * se devolvió. Debajo, la línea de tiempo: cada paso con quién lo dio (y con qué rol), cuándo, y cuánto pasó desde el
 * anterior. Los motivos de devolución se leen enteros; el número de radicado sale del comentario que deja la radicación.
 *
 * Los ajustes administrativos (correcciones de valor, mes de cotización, planilla aprobada…) son muchos y pesan poco: los
 * seguidos se agrupan en una línea plegada que se abre si hace falta.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import Dialogo from '@/components/ui/Dialogo'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'
import { capitalizarNombre } from '@/lib/format'
import { conLimite } from '@/lib/con-limite'
import { obtenerHistorialInforme, type PasoHistorial } from '@/app/actions/informes'

type Tipo = 'envio' | 'revision' | 'observacion' | 'aprobacion' | 'radicacion' | 'devolucion' | 'reversion' | 'ajuste'

interface Evento {
  paso: PasoHistorial
  tipo: Tipo
  titulo: string
  /** Texto que se lee entero debajo (motivo, observación, comentario). */
  detalle: string | null
  numeroRadicado?: string
}

const ESTILO: Record<Tipo, { icono: LucideIcon; nodo: string; titulo: string }> = {
  envio: { icono: Iconos.accion.enviar, nodo: 'bg-blue-600 text-white', titulo: 'text-gray-900' },
  revision: { icono: Iconos.accion.ver, nodo: 'bg-sky-100 text-sky-700', titulo: 'text-gray-900' },
  observacion: { icono: Iconos.aviso.mensaje, nodo: 'bg-blue-50 text-blue-700', titulo: 'text-gray-900' },
  aprobacion: { icono: Iconos.estado.ok, nodo: 'bg-indigo-600 text-white', titulo: 'text-gray-900' },
  radicacion: { icono: Iconos.estado.aprobado, nodo: 'bg-emerald-600 text-white', titulo: 'text-gray-900' },
  devolucion: { icono: Iconos.accion.devolver, nodo: 'bg-red-600 text-white', titulo: 'text-red-800' },
  reversion: { icono: Iconos.accion.recargar, nodo: 'bg-amber-100 text-amber-800', titulo: 'text-gray-900' },
  ajuste: { icono: Iconos.accion.editar, nodo: 'bg-gray-100 text-gray-500', titulo: 'text-gray-700' },
}

const ROL: Record<string, string> = {
  contratista: 'Contratista',
  supervisor: 'Supervisión',
  asesor: 'Asesoría',
  admin: 'Administración',
  contratacion: 'Contratación',
}

function describir(paso: PasoHistorial): Evento {
  const a = paso.estado_anterior
  const n = paso.estado_nuevo
  const comentario = paso.comentario?.trim() || null
  const rol = paso.usuario?.rol ?? ''

  if (n === 'enviado' && a === 'borrador') return { paso, tipo: 'envio', titulo: 'Envió el informe', detalle: comentario }
  if (n === 'enviado' && a === 'rechazado') return { paso, tipo: 'envio', titulo: 'Reenvió el informe corregido', detalle: comentario }
  if (n === 'revision' && a !== 'revision') {
    return { paso, tipo: 'revision', titulo: rol === 'asesor' ? 'Revisó y lo pasó a la secretaría' : 'Empezó la revisión', detalle: comentario }
  }
  if (n === 'aprobado' && a !== 'aprobado') return { paso, tipo: 'aprobacion', titulo: 'Aprobó el informe', detalle: comentario }
  if (n === 'radicado' && a !== 'radicado') {
    const numero = comentario?.match(/No\.?\s*(\S+)/i)?.[1]
    return { paso, tipo: 'radicacion', titulo: 'Radicó el informe', detalle: numero ? null : comentario, numeroRadicado: numero }
  }
  if (n === 'rechazado' && a !== 'rechazado') return { paso, tipo: 'devolucion', titulo: 'Devolvió el informe', detalle: comentario }
  if (n === 'borrador' && a && a !== 'borrador') return { paso, tipo: 'reversion', titulo: 'Volvió a borrador', detalle: comentario }
  // Sin cambio de estado: una observación de quien revisa, o un ajuste.
  if (a === n && a === 'enviado' && (rol === 'supervisor' || rol === 'asesor') && comentario) {
    return { paso, tipo: 'observacion', titulo: 'Dejó observaciones', detalle: comentario }
  }
  return { paso, tipo: 'ajuste', titulo: comentario ?? 'Ajuste', detalle: null }
}

const fechaLarga = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota',
})
const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })

/** «2 días después», «5 horas después»; nada si fue casi a la vez. */
function despues(desde: string, hasta: string): string | null {
  const ms = new Date(hasta).getTime() - new Date(desde).getTime()
  const horas = ms / 3_600_000
  if (horas < 1) return null
  if (horas < 24) return `${Math.round(horas)} ${Math.round(horas) === 1 ? 'hora' : 'horas'} después`
  const dias = Math.round(horas / 24)
  return `${dias} ${dias === 1 ? 'día' : 'días'} después`
}

function duracion(desde: string, hasta: string): string {
  const dias = (new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000
  if (dias < 1) return 'el mismo día'
  const d = Math.round(dias)
  return `${d} ${d === 1 ? 'día' : 'días'}`
}

/** Los ajustes seguidos van juntos en un grupo plegable; lo demás, uno por uno. */
type Fila = { clase: 'evento'; evento: Evento } | { clase: 'ajustes'; eventos: Evento[] }

function agrupar(eventos: Evento[]): Fila[] {
  const filas: Fila[] = []
  for (const e of eventos) {
    const ultima = filas[filas.length - 1]
    if (e.tipo === 'ajuste' && ultima?.clase === 'ajustes') ultima.eventos.push(e)
    else if (e.tipo === 'ajuste') filas.push({ clase: 'ajustes', eventos: [e] })
    else filas.push({ clase: 'evento', evento: e })
  }
  return filas
}

function Resumen({ eventos }: { eventos: Evento[] }) {
  const envio = eventos.find(e => e.tipo === 'envio')
  const aprobacion = [...eventos].reverse().find(e => e.tipo === 'aprobacion')
  const devoluciones = eventos.filter(e => e.tipo === 'devolucion').length
  const celdas: { etiqueta: string; valor: string }[] = [
    { etiqueta: 'Llegó', valor: envio ? fechaCorta.format(new Date(envio.paso.created_at)) : '—' },
    { etiqueta: 'Se aprobó en', valor: envio && aprobacion ? duracion(envio.paso.created_at, aprobacion.paso.created_at) : '—' },
    { etiqueta: devoluciones === 1 ? 'Devolución' : 'Devoluciones', valor: String(devoluciones) },
  ]
  return (
    <dl className="grid grid-cols-3 divide-x divide-gray-100 rounded-xl bg-gray-50 py-3">
      {celdas.map(c => (
        <div key={c.etiqueta} className="px-3 text-center">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{c.etiqueta}</dt>
          <dd className="mt-1 text-[15px] font-semibold tabular-nums text-gray-900">{c.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

function Paso({ evento, anterior, ultimo }: { evento: Evento; anterior: Evento | null; ultimo: boolean }) {
  const estilo = ESTILO[evento.tipo]
  const quien = evento.paso.usuario ? capitalizarNombre(evento.paso.usuario.nombre_completo) : 'El sistema'
  const rol = evento.paso.usuario?.rol ? ROL[evento.paso.usuario.rol] : null
  const lapso = anterior ? despues(anterior.paso.created_at, evento.paso.created_at) : null
  return (
    <li className="relative flex gap-3.5 pb-6 last:pb-0">
      {/* El hilo que une los pasos. */}
      {!ultimo && <span aria-hidden="true" className="absolute left-[17px] top-10 bottom-1 w-px bg-gray-200" />}
      <span className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full ring-4 ring-white ${estilo.nodo}`}>
        <Icono glifo={estilo.icono} tamano="sm" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        {lapso && <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">{lapso}</p>}
        <p className={`text-sm font-semibold ${estilo.titulo}`}>
          {evento.titulo}
          {evento.numeroRadicado && (
            <span className="ml-1.5 font-semibold tabular-nums text-emerald-700">N.º {evento.numeroRadicado}</span>
          )}
        </p>
        <p className="mt-0.5 text-[13px] text-gray-500">
          {quien}{rol && <span className="text-gray-400"> · {rol}</span>}
        </p>
        <p className="text-xs tabular-nums text-gray-400">
          <time dateTime={evento.paso.created_at}>{fechaLarga.format(new Date(evento.paso.created_at))}</time>
        </p>
        {evento.detalle && (
          <blockquote className={`mt-2 whitespace-pre-line rounded-lg border-l-2 px-3 py-2 text-sm leading-relaxed ${
            evento.tipo === 'devolucion' ? 'border-red-300 bg-red-50/70 text-red-900' : 'border-gray-200 bg-gray-50 text-gray-700'
          }`}>
            {evento.detalle}
          </blockquote>
        )}
      </div>
    </li>
  )
}

function Ajustes({ eventos, ultimo }: { eventos: Evento[]; ultimo: boolean }) {
  const [abierto, setAbierto] = useState(eventos.length === 1)
  return (
    <li className="relative flex gap-3.5 pb-6 last:pb-0">
      {!ultimo && <span aria-hidden="true" className="absolute left-[17px] top-8 bottom-1 w-px bg-gray-200" />}
      <span className="relative ml-[9px] mr-[9px] mt-1.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-gray-200 ring-4 ring-white">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
      </span>
      <div className="min-w-0 flex-1">
        {eventos.length > 1 && (
          <button
            type="button"
            onClick={() => setAbierto(a => !a)}
            aria-expanded={abierto}
            className="inline-flex items-center gap-1 rounded-md py-1 text-[13px] font-medium text-gray-500 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            {eventos.length} ajustes administrativos
            <Icono glifo={abierto ? Iconos.accion.plegar : Iconos.accion.desplegar} tamano="sm" />
          </button>
        )}
        {abierto && (
          <ul className="mt-1 space-y-2">
            {eventos.map(e => (
              <li key={e.paso.id} className="text-[13px] leading-snug">
                <span className="text-gray-700">{e.titulo}</span>
                <span className="block text-xs text-gray-400">
                  {e.paso.usuario ? capitalizarNombre(e.paso.usuario.nombre_completo) : 'El sistema'} ·{' '}
                  {fechaLarga.format(new Date(e.paso.created_at))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

export default function HistorialInforme({
  periodoId,
  nombre,
  contrato,
  hrefInforme,
  onCerrar,
}: {
  periodoId: string
  nombre: string
  contrato: string
  hrefInforme: string
  onCerrar: () => void
}) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['historial-informe', periodoId],
    queryFn: () => conLimite(obtenerHistorialInforme(periodoId), 'Historial del informe', 12_000),
  })
  const eventos = (data ?? []).map(describir)
  const filas = agrupar(eventos)

  return (
    <Dialogo
      titulo="Historial del informe"
      descripcion={`${capitalizarNombre(nombre)} · CN ${contrato}`}
      icono={Iconos.dominio.actividad}
      onCerrar={onCerrar}
      pie={
        <>
          <Link
            href={hrefInforme}
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Abrir el periodo
          </Link>
          <button
            type="button"
            onClick={onCerrar}
            className="ml-auto min-h-11 rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Cerrar
          </button>
        </>
      }
    >
      {isLoading ? (
        <div role="status" aria-busy="true" className="space-y-5">
          <span className="sr-only">Cargando el historial…</span>
          <div className="sk h-[68px] rounded-xl" />
          {[0, 1, 2].map(i => (
            <div key={i} className="flex gap-3.5">
              <div className="sk h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="sk h-3.5 w-1/2 rounded-md" />
                <div className="sk h-3 w-2/3 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : isError && !data ? (
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-gray-900">No se pudo cargar el historial.</p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-3 min-h-10 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {isFetching ? 'Reintentando…' : 'Reintentar'}
          </button>
        </div>
      ) : eventos.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Este informe todavía no tiene movimientos: no se ha enviado.</p>
      ) : (
        <div className="space-y-5">
          <Resumen eventos={eventos} />
          <ol aria-label="Pasos del informe, del primero al último">
            {filas.map((f, i) => {
              const ultimo = i === filas.length - 1
              if (f.clase === 'ajustes') return <Ajustes key={f.eventos[0].paso.id} eventos={f.eventos} ultimo={ultimo} />
              // El lapso se mide desde el paso importante anterior, no desde un ajuste.
              const anterior = [...filas.slice(0, i)].reverse().find(x => x.clase === 'evento')
              return (
                <Paso
                  key={f.evento.paso.id}
                  evento={f.evento}
                  anterior={anterior?.clase === 'evento' ? anterior.evento : null}
                  ultimo={ultimo}
                />
              )
            })}
          </ol>
        </div>
      )}
    </Dialogo>
  )
}
