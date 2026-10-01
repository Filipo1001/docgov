'use client'

/**
 * El indicador completo: qué mide, cómo va, quién responde y qué ha pasado.
 *
 * ── Trazabilidad ─────────────────────────────────────────────────────────
 *
 * La historia del indicador es la lista de sus reportes, del más reciente al más antiguo, cada uno
 * con autor, fecha, valor anterior, valor nuevo, la explicación, la evidencia y lo que dijo la
 * secretaría. Nada se sobrescribe: un reporte nuevo añade una fila. Todo eso lo pinta
 * `SeguimientoIndicador`, que lee el detalle al abrirse.
 *
 * ── Qué cuenta ───────────────────────────────────────────────────────────
 *
 * Las cifras de arriba son el avance VALIDADO: el último reporte que la secretaría aprobó. Lo
 * reportado y aún sin validar se ve en la trazabilidad y en el chip del corte, pero no cuenta.
 *
 * ── Por qué la evidencia es obligatoria ─────────────────────────────────
 *
 * Es el punto del módulo. El archivo del que se partió registra el avance como un número sin
 * documento que lo respalde; aquí no se puede reportar sin adjuntar al menos uno, y la base de
 * datos lo exige aunque alguien se salte la pantalla.
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
  ESTADOS, coincideNombre, estadoDe, fmt, fmtRazon, razon, rotuloMeta, sinAsignar, tipoResponsable,
  type Indicador,
} from '@/lib/pdm/plan'
import { SITUACIONES } from '@/lib/pdm/seguimiento'
import { BarraAvance } from './Barras'
import SeguimientoIndicador, { type ContextoSeguimiento } from './SeguimientoIndicador'
import { Avatar, LineaContrato } from './PersonaVista'
import type { MotivoSinVincular, PersonaFicha } from '@/lib/pdm/personas'
import type { AsignadoVista } from '@/lib/pdm/asignados'
import type { Resultado } from '@/lib/pdm/acciones'
import { fechaHoraBogota, type EntradaHistorial } from '@/lib/pdm/historial'

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
  indicador, onCerrar, persona, asignados, onAsignar, onQuitar, onCargarHistorial, seguimiento,
}: {
  indicador: Indicador | null
  onCerrar: () => void
  /** Quién es el responsable en la plataforma, si se sabe. Sin él se muestra el texto del archivo. */
  persona?: PersonaFicha
  /** Principal y apoyos, con nombre. Sin esto la ficha solo muestra al principal. */
  asignados?: AsignadoVista[]
  /** Con esto la ficha deja repartir el indicador. Sin esto no hay botón: lo ven quienes no pueden asignar. */
  onAsignar?: () => void
  /**
   * Quita a una persona del indicador: a un apoyo siempre, y al principal cuando es la ÚNICA asignación
   * (si hay apoyos, al principal se le reemplaza). Devuelve el mensaje de error, o `null` si salió bien.
   */
  onQuitar?: (usuarioId: string) => Promise<string | null>
  /** Con esto la ficha muestra el historial de cambios de responsable (solo lo lee el administrador). */
  onCargarHistorial?: () => Promise<Resultado<EntradaHistorial[]>>
  /** Con esto la ficha muestra la trazabilidad, deja reportar y validar, y comentar. Sin esto, esa parte no se pinta. */
  seguimiento?: ContextoSeguimiento
}) {
  const [quitando, setQuitando] = useState<string | null>(null)
  const [errorApoyo, setErrorApoyo] = useState<string | null>(null)
  // El historial cargado se guarda con la firma de quién llevaba el indicador cuando se leyó.
  const [cargado, setCargado] = useState<{ firma: string; datos: EntradaHistorial[] } | null>(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [errorLeido, setErrorLeido] = useState<{ firma: string; mensaje: string } | null>(null)
  const cerrarRef = useRef<HTMLButtonElement>(null)

  // Escape, bloqueo del fondo y foco al abrir. Depende del id: que el padre se
  // vuelva a pintar con el modal abierto no debe repetirlo.
  const id = indicador?.id
  // Si cambia quién lleva el indicador, el historial que se había cargado ya no está al día: deja de contar.
  const firma = asignados?.map(a => `${a.usuarioId}${a.principal ? 'P' : 'A'}`).join(',') ?? ''
  const historial = cargado?.firma === firma ? cargado.datos : null
  const errorHistorial = errorLeido?.firma === firma ? errorLeido.mensaje : null
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

  const estado = estadoDe(indicador)
  const r = razon(indicador)
  const corte = indicador.enCorte
  // Nadie asignado Y el Excel tampoco nombraba a una persona: no hay a quién preguntarle.
  // (Si el Excel nombraba a alguien que aún no tiene usuario, se muestra su nombre y por qué.)
  const huerfano = sinAsignar(indicador) && tipoResponsable(indicador.responsable) !== 'persona'
  const nombraAlgo = /\p{L}/u.test(indicador.responsable)
  const principalVista = asignados?.find(a => a.principal)
  const apoyos = asignados?.filter(a => !a.principal) ?? []

  async function quitar(usuarioId: string) {
    if (!onQuitar) return
    setQuitando(usuarioId)
    setErrorApoyo(null)
    const e = await onQuitar(usuarioId)
    setQuitando(null)
    if (e) setErrorApoyo(e)
  }

  async function cargarHistorial() {
    if (!onCargarHistorial) return
    setCargandoHistorial(true)
    setErrorLeido(null)
    const r = await onCargarHistorial()
    setCargandoHistorial(false)
    if (r.ok) setCargado({ firma, datos: r.datos })
    else setErrorLeido({ firma, mensaje: r.error })
  }

  // Al principal solo se le quita si es la única asignación; con apoyos se le reemplaza.
  const puedeQuitarPrincipal = !!principalVista && !principalVista.grupo && (asignados?.length ?? 0) === 1

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
                {(estado !== 'sin_reporte' || !corte) && (
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ESTADOS[estado].chip}`}>{ESTADOS[estado].rotulo}</span>
                )}
                {corte && (
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${SITUACIONES[corte.situacion].chip}`}>
                    {SITUACIONES[corte.situacion].rotulo}
                  </span>
                )}
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

          {/* Avance: el último reporte aprobado */}
          <section>
            <div className="flex items-end justify-between gap-4">
              {indicador.avance === null ? (
                <p className="text-2xl font-bold leading-none text-gray-400">
                  Sin avance validado
                  <span className="ml-2 text-base font-medium">· meta {fmt(indicador.metaMedida)}</span>
                </p>
              ) : (
                <p className="text-4xl font-bold tabular-nums leading-none text-gray-900">
                  {fmt(indicador.avance)}
                  <span className="ml-2 text-base font-medium text-gray-400">de {fmt(indicador.metaMedida)}</span>
                </p>
              )}
              {r !== null && <p className="text-2xl font-bold tabular-nums text-gray-700">{fmtRazon(r, indicador.criterio !== null)}</p>}
            </div>
            <div className="mt-3"><BarraAvance razon={r} estado={estado} /></div>
            <p className="mt-2 text-xs text-gray-500">
              {indicador.unidad} · {rotuloMeta(indicador)}
              {indicador.avanceCorte ? ` · validado en «${indicador.avanceCorte}»` : ''}
            </p>
            {indicador.criterio === null && (
              <p className="mt-1 text-[11px] leading-snug text-gray-400">
                La Alcaldía aún define si el avance es del año o acumulado: el porcentaje es provisional.
              </p>
            )}
          </section>

          {/* Responsable */}
          <section className={`rounded-xl border px-4 py-3 ${huerfano ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Responsable</p>
              {(onAsignar || (onQuitar && puedeQuitarPrincipal)) && (
                <div className="flex shrink-0 items-center gap-2">
                  {onQuitar && puedeQuitarPrincipal && principalVista && (
                    <button
                      id="pdm-ficha-quitar"
                      onClick={() => quitar(principalVista.usuarioId)}
                      disabled={quitando !== null}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50"
                    >
                      {quitando === principalVista.usuarioId ? 'Quitando…' : 'Quitar'}
                    </button>
                  )}
                  {onAsignar && (
                    <button
                      id="pdm-ficha-asignar"
                      onClick={onAsignar}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                    >
                      Asignar…
                    </button>
                  )}
                </div>
              )}
            </div>
            {!huerfano && persona && 'nombre' in persona ? (
              <div className="mt-2 flex items-center gap-3">
                <Avatar nombre={persona.nombre} fotoUrl={persona.fotoUrl} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{persona.nombre}</p>
                  <p className="text-xs text-gray-500">{persona.secretaria ?? 'Sin secretaría'}</p>
                  <LineaContrato contrato={persona.contrato} />
                  {nombraAlgo && (tipoResponsable(indicador.responsable) !== 'persona' || !coincideNombre(persona.nombre, indicador.responsable)) && (
                    <p className="mt-0.5 text-[11px] text-gray-400">En el archivo figuraba «{indicador.responsable}»</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <p className={`mt-1 text-sm font-semibold ${huerfano ? 'text-red-800' : 'text-gray-900'}`}>
                  {huerfano ? 'Sin responsable' : indicador.responsable}
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
            {asignados && (principalVista?.grupo || apoyos.length > 0 || errorApoyo) && (
              <div className="mt-3 border-t border-gray-200 pt-3">
                {principalVista?.grupo && <p className="text-xs text-gray-500">Por el grupo «{principalVista.grupo}»</p>}
                {apoyos.length > 0 && (
                  <>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{apoyos.length === 1 ? 'Apoyo' : 'Apoyos'}</p>
                    <ul className="mt-2 space-y-2">
                      {apoyos.map(a => (
                        <li key={a.usuarioId} className="flex items-center gap-3">
                          <Avatar nombre={a.nombre} fotoUrl={a.fotoUrl} tamano="sm" apagado={!a.activo} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-900">{a.nombre}</span>
                            {a.grupo && <span className="block truncate text-xs text-gray-500">Por el grupo «{a.grupo}»</span>}
                          </span>
                          {onQuitar && !a.grupo && (
                            <button
                              onClick={() => quitar(a.usuarioId)}
                              disabled={quitando !== null}
                              className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50"
                            >
                              {quitando === a.usuarioId ? 'Quitando…' : 'Quitar'}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {errorApoyo && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{errorApoyo}</p>}
              </div>
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

          {/* Trazabilidad, reportar, validar y comentar */}
          {seguimiento && <SeguimientoIndicador indicador={indicador} ctx={seguimiento} />}

          {/* Cambios de responsable (solo el administrador): quién cambió qué y cuándo */}
          {onCargarHistorial && (
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-gray-900">Cambios de responsable</h3>
                {historial === null && (
                  <button
                    id="pdm-ficha-historial"
                    onClick={cargarHistorial}
                    disabled={cargandoHistorial}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {cargandoHistorial ? 'Cargando…' : 'Ver historial'}
                  </button>
                )}
              </div>
              {errorHistorial && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{errorHistorial}</p>}
              {historial !== null && (
                historial.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">Nadie ha cambiado a los responsables de este indicador desde que se cargó el plan.</p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {historial.map(h => (
                      <li key={h.id} className="relative border-l-2 border-gray-200 pl-4">
                        <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-gray-300" />
                        <p className="text-sm leading-snug text-gray-900">{h.texto}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{fechaHoraBogota(h.cuando)} · {h.quien}</p>
                        {h.motivo && <p className="mt-0.5 text-xs italic text-gray-500">«{h.motivo}»</p>}
                      </li>
                    ))}
                  </ol>
                )
              )}
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
