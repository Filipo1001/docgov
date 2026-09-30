'use client'

/**
 * El indicador completo: qué mide, cómo va, quién responde y qué ha pasado.
 *
 * ── Trazabilidad ─────────────────────────────────────────────────────────
 *
 * La historia del indicador es la lista de sus reportes, del más reciente al
 * más antiguo, cada uno con autor, fecha, valor anterior, valor nuevo, la
 * explicación y la evidencia. Al fondo va el corte del archivo original, para
 * que se vea de dónde parte el sistema. Nada se sobrescribe: un reporte nuevo
 * añade una fila, no cambia las anteriores.
 *
 * ── Por qué la evidencia es obligatoria ─────────────────────────────────
 *
 * Es el punto del módulo. El archivo actual registra el avance como un número
 * sin documento que lo respalde; aquí no se puede reportar sin adjuntar al
 * menos uno. En la vista previa el archivo no se sube a ninguna parte: se
 * muestra su nombre y nada más.
 *
 * Va montado en <body> con un portal: el dashboard usa `transform` en contenedores
 * que convierten un `position: fixed` en algo relativo a ellos y no a la
 * pantalla (ya pasó con el modal de notificaciones).
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  ESTADOS, ROTULO_RESPONSABLE, estadoDe, fmt, fmtRazon, razon, sinResponsableUnico, tipoResponsable,
  type Indicador, type Reporte,
} from '@/lib/pdm/plan'
import { BarraAvance } from './Barras'
import { Avatar, LineaContrato } from './PersonaVista'
import type { MotivoSinVincular, PersonaFicha } from '@/lib/pdm/personas'

const fechaHora = (t: number) =>
  new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium leading-snug text-gray-900">{valor}</dd>
    </div>
  )
}

const NOTA_SIN_USUARIO: Record<MotivoSinVincular, string> = {
  planta: 'Personal de planta. Aún no tiene usuario en la plataforma.',
  pendiente: 'Aún no se ha confirmado quién es esta persona en la plataforma.',
  no_encontrado: 'Su usuario en la plataforma ya no existe.',
}

export default function IndicadorModal({
  indicador, reportes, puedeReportar, onCerrar, onReportar, persona,
}: {
  indicador: Indicador | null
  reportes: Reporte[]
  puedeReportar: boolean
  onCerrar: () => void
  onReportar: (id: number, r: Omit<Reporte, 'fecha' | 'autor' | 'anterior'>) => void
  /** Quién es el responsable en la plataforma, si se sabe. Sin él se muestra el texto del archivo. */
  persona?: PersonaFicha
}) {
  const [valor, setValor] = useState('')
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState('')
  const [enviado, setEnviado] = useState(false)
  const cerrarRef = useRef<HTMLButtonElement>(null)

  // Escape, bloqueo del fondo y foco al abrir. Depende del id: que el padre se
  // vuelva a pintar con el modal abierto no debe repetirlo.
  const id = indicador?.id
  const cerrarFn = useRef(onCerrar)
  useEffect(() => { cerrarFn.current = onCerrar })
  useEffect(() => {
    if (id === undefined) return
    const previo = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrarRef.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarFn.current() }
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
      previo?.focus?.()
    }
  }, [id])

  if (!indicador) return null

  const vigente = reportes[0]?.nuevo
  const estado = estadoDe(indicador, vigente)
  const r = razon(indicador, vigente)
  const huerfano = sinResponsableUnico(indicador)
  const numero = Number(valor.replace(',', '.'))
  const valido = valor.trim() !== '' && Number.isFinite(numero) && numero >= 0
    && texto.trim().length >= 10 && archivo !== ''

  function enviar() {
    if (!valido || !indicador) return
    onReportar(indicador.id, { nuevo: numero, texto: texto.trim(), evidencia: archivo })
    setValor(''); setTexto(''); setArchivo(''); setEnviado(true)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={indicador.indicador}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="shrink-0 border-b border-gray-100 px-5 pb-4 pt-5 sm:px-7">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600">{indicador.codigo}</span>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ESTADOS[estado].chip}`}>{ESTADOS[estado].rotulo}</span>
              </div>
              <h2 className="mt-2 text-lg font-bold leading-snug tracking-tight text-[#192031] sm:text-xl">{indicador.indicador}</h2>
            </div>
            <button
              ref={cerrarRef}
              onClick={onCerrar}
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              <Icono glifo={Iconos.accion.cerrar} tamano="md" etiqueta="Cerrar" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">

          {/* Avance */}
          <section>
            <div className="flex items-end justify-between gap-4">
              <p className="text-4xl font-bold tabular-nums leading-none text-gray-900">
                {fmt(vigente ?? indicador.avance)}
                <span className="ml-2 text-base font-medium text-gray-400">de {fmt(indicador.meta2026)}</span>
              </p>
              {r !== null && <p className="text-2xl font-bold tabular-nums text-gray-700">{fmtRazon(r)}</p>}
            </div>
            <div className="mt-3"><BarraAvance razon={r} estado={estado} /></div>
            <p className="mt-2 text-xs text-gray-500">{indicador.unidad} · meta 2026</p>
          </section>

          {/* Responsable */}
          <section className={`rounded-xl border px-4 py-3 ${huerfano ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Responsable</p>
            {!huerfano && persona && 'nombre' in persona ? (
              <div className="mt-2 flex items-center gap-3">
                <Avatar nombre={persona.nombre} fotoUrl={persona.fotoUrl} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{persona.nombre}</p>
                  <p className="text-xs text-gray-500">{persona.secretaria ?? 'Sin secretaría'}</p>
                  <LineaContrato contrato={persona.contrato} />
                </div>
              </div>
            ) : (
              <>
                <p className={`mt-1 text-sm font-semibold ${huerfano ? 'text-red-800' : 'text-gray-900'}`}>
                  {huerfano ? ROTULO_RESPONSABLE[tipoResponsable(indicador.responsable)] : indicador.responsable}
                </p>
                {!huerfano && persona && 'sinUsuario' in persona && (
                  <p className="mt-1 text-xs text-gray-500">{NOTA_SIN_USUARIO[persona.sinUsuario]}</p>
                )}
                {huerfano && (
                  <p className="mt-1 text-xs leading-relaxed text-red-700">
                    {indicador.responsable && indicador.responsable !== '-' ? `En el archivo figura «${indicador.responsable}». ` : ''}
                    Nadie tiene la obligación de reportar este indicador ni de responder por él. Asignarle una persona lo resuelve.
                  </p>
                )}
              </>
            )}
          </section>

          {/* Qué es */}
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dato rotulo="Secretaría" valor={indicador.dependencia} />
            <Dato rotulo="Línea estratégica" valor={indicador.linea} />
            <Dato rotulo="Programa" valor={indicador.programa} />
            <Dato rotulo="Sector" valor={indicador.sector} />
            <Dato rotulo="Producto" valor={indicador.producto} />
            <Dato rotulo="Línea base · Meta cuatrienio" valor={`${fmt(indicador.lineaBase)} · ${fmt(indicador.metaCuatrienio)}`} />
          </dl>

          {/* Trazabilidad */}
          <section>
            <h3 className="text-sm font-bold text-gray-900">Trazabilidad</h3>
            <ol className="mt-3 space-y-0">
              {reportes.map((rep, k) => (
                <li key={rep.fecha} className="relative border-l-2 border-gray-200 pb-5 pl-5 last:pb-1">
                  <span className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full ${k === 0 ? 'bg-[#192031]' : 'bg-gray-300'}`} />
                  <p className="text-xs text-gray-500">{fechaHora(rep.fecha)} · {rep.autor}</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900">
                    {fmt(rep.anterior)} <span className="text-gray-400">→</span> {fmt(rep.nuevo)}
                  </p>
                  <p className="mt-1 text-sm leading-snug text-gray-700">{rep.texto}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Icono glifo={Iconos.documentos.adjunto} tamano="sm" />{rep.evidencia}
                  </p>
                </li>
              ))}
              <li className="relative border-l-2 border-transparent pl-5">
                <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-gray-300" />
                <p className="text-xs text-gray-500">Corte de junio de 2026 · archivo original</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">{fmt(indicador.avance)}</p>
                <p className="mt-1 text-xs text-gray-500">Sin autor, sin fecha exacta y sin evidencia: el archivo no los registra.</p>
              </li>
            </ol>
          </section>

          {/* Reportar */}
          {puedeReportar && (
            <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
              <h3 className="text-sm font-bold text-gray-900">Reportar avance</h3>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Nuevo valor acumulado ({indicador.unidad.toLowerCase()})</span>
                  <input
                    id="pdm-valor"
                    type="text"
                    inputMode="decimal"
                    value={valor}
                    onChange={e => { setValor(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9)); setEnviado(false) }}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm tabular-nums text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">¿Qué se hizo?</span>
                  <textarea
                    id="pdm-texto"
                    value={texto}
                    onChange={e => { setTexto(e.target.value); setEnviado(false) }}
                    rows={3}
                    maxLength={1000}
                    className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  />
                </label>
                <div>
                  <span className="text-xs font-semibold text-gray-600">Evidencia <span className="font-normal text-gray-500">(obligatoria)</span></span>
                  <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-600 transition-colors hover:border-gray-400">
                    <Icono glifo={Iconos.documentos.subir} tamano="sm" className="shrink-0 text-gray-500" />
                    <span className="min-w-0 truncate">{archivo || 'Adjuntar foto, acta o documento'}</span>
                    <input
                      id="pdm-evidencia"
                      type="file"
                      className="sr-only"
                      onChange={e => { setArchivo(e.target.files?.[0]?.name ?? ''); setEnviado(false) }}
                    />
                  </label>
                </div>
                <button
                  id="pdm-enviar"
                  onClick={enviar}
                  disabled={!valido}
                  className="w-full rounded-xl bg-[#192031] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#242F45] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Registrar reporte
                </button>
                {enviado
                  ? <p role="status" className="text-center text-xs font-medium text-emerald-700">Reporte registrado en la trazabilidad. En la vista previa no se guarda.</p>
                  : <p className="text-center text-xs text-gray-500">Vista previa: lo que reportes aquí no se guarda.</p>}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
