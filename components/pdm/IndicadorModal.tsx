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
 * reportado y aún sin validar se ve en la trazabilidad y en el chip del año, pero no cuenta.
 *
 * ── Por qué la evidencia es obligatoria ─────────────────────────────────
 *
 * Es el punto del módulo. El archivo del que se partió registra el avance como un número sin
 * documento que lo respalde; aquí no se puede reportar sin adjuntar al menos uno, y la base de
 * datos lo exige aunque alguien se salte la pantalla.
 *
 * El marco (velo, entrada y salida, bloqueo del fondo, Escape, foco) es `Ventana`, que comparte con los diálogos.
 * Va montado en <body> con un portal: el dashboard usa `transform` en contenedores que convierten un
 * `position: fixed` en algo relativo a ellos y no a la pantalla (ya pasó con el modal de notificaciones).
 * Quien la cierra desde fuera la envuelve en `Presencia` para que se despida y no desaparezca de golpe.
 */

import { useState } from 'react'
import {
  coincideNombre, estadoDe, fmt, fmtRazon, razon, rotuloMeta, sinAsignar, tipoResponsable,
  type Indicador,
} from '@/lib/pdm/plan'
import { BarraAnio, BarraAvance } from './Barras'
import Ventana, { BotonCerrarVentana } from './Ventana'
import { TextoEstable, useConfirmar } from './Movimiento'
import { useAvisar } from './Avisos'
import ConfirmarQuitar from './ConfirmarQuitar'
import IconoSector from './IconoSector'
import { EstadoTexto, Rotulo, Seccion, SituacionTexto } from './ui'
import { T } from './tema'
import SeguimientoIndicador, { type ContextoSeguimiento } from './SeguimientoIndicador'
import { Avatar, LineaContrato } from './PersonaVista'
import type { MotivoSinVincular, PersonaFicha } from '@/lib/pdm/personas'
import type { AsignadoVista } from '@/lib/pdm/asignados'
import type { Resultado } from '@/lib/pdm/acciones'
import { fechaHoraBogota, type EntradaHistorial } from '@/lib/pdm/historial'
import { nombrePropio } from '@/lib/pdm/personas'

const NOTA_SIN_USUARIO: Record<MotivoSinVincular, string> = {
  planta: 'Personal de planta. Aún no tiene usuario en la plataforma.',
  pendiente: 'Aún no se ha confirmado quién es esta persona en la plataforma.',
  no_encontrado: 'Su usuario en la plataforma ya no existe.',
}

export default function IndicadorModal({
  indicador, onCerrar, persona, asignados, onAsignar, onQuitar, onCargarHistorial, seguimiento, onAnio,
}: {
  /** El indicador visto en el año que se mira (`indicador.anio`). */
  indicador: Indicador | null
  onCerrar: () => void
  /** Con esto, el cuadro «Por año» deja cambiar el año que se mira. Sin esto, solo informa. */
  onAnio?: (anio: number) => void
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
  // Quitar a alguien pregunta antes: `confirma` es a quién se le está preguntando; `objetivo`, a quién se está quitando
  // (no se borra al cerrar la pregunta, para que su botón no vuelva a «Sí, quitar» mientras la pregunta se pliega).
  const [confirma, setConfirma] = useState<string | null>(null)
  const [objetivo, setObjetivo] = useState<string | null>(null)
  const [errorQuitar, setErrorQuitar] = useState<string | null>(null)
  const { fase: faseQuitar, correr: correrQuitar, ocupado: quitando } = useConfirmar()
  const avisar = useAvisar()
  // El historial cargado se guarda con la firma de quién llevaba el indicador cuando se leyó.
  const [cargado, setCargado] = useState<{ firma: string; datos: EntradaHistorial[] } | null>(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [errorLeido, setErrorLeido] = useState<{ firma: string; mensaje: string } | null>(null)

  // Si cambia quién lleva el indicador, el historial que se había cargado ya no está al día: deja de contar.
  const firma = asignados?.map(a => `${a.usuarioId}${a.principal ? 'P' : 'A'}`).join(',') ?? ''
  const historial = cargado?.firma === firma ? cargado.datos : null
  const errorHistorial = errorLeido?.firma === firma ? errorLeido.mensaje : null

  if (!indicador) return null

  const estado = estadoDe(indicador)
  const r = razon(indicador)
  const enAnio = indicador.enAnio
  // Nadie asignado Y el Excel tampoco nombraba a una persona: no hay a quién preguntarle.
  // (Si el Excel nombraba a alguien que aún no tiene usuario, se muestra su nombre y por qué.)
  const huerfano = sinAsignar(indicador) && tipoResponsable(indicador.responsable) !== 'persona'
  const nombraAlgo = /\p{L}/u.test(indicador.responsable)
  // Las barras por año de la ficha: por ahora solo el administrador (como los gráficos del Resumen).
  const conGraficos = seguimiento?.nivel === 'admin'
  const principalVista = asignados?.find(a => a.principal)
  const apoyos = asignados?.filter(a => !a.principal) ?? []

  function preguntarQuitar(usuarioId: string) {
    setErrorQuitar(null)
    setConfirma(usuarioId)
  }

  async function quitar(a: AsignadoVista) {
    if (!onQuitar || quitando) return
    setObjetivo(a.usuarioId)
    setErrorQuitar(null)
    await correrQuitar(
      async () => {
        const e = await onQuitar(a.usuarioId)
        return e === null ? { ok: true as const, datos: undefined } : { ok: false as const, error: e }
      },
      {
        alTerminar: () => {
          setConfirma(null)
          avisar(a.principal ? `${a.nombre} ya no es responsable de este indicador.` : `${a.nombre} ya no apoya este indicador.`)
        },
        alFallar: setErrorQuitar,
        // La persona desaparece al recargar la ficha: hasta entonces el botón no vuelve a decir «Sí, quitar».
        quedarseHecho: true,
      },
    )
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

  return (
    <Ventana etiqueta={indicador.indicador} onCerrar={onCerrar} ancho="sm:max-w-3xl">
        {/* Encabezado: código y estado a una línea, el indicador debajo */}
        <div className={`shrink-0 border-b ${T.regla} px-5 pb-4 pt-5 sm:px-7`}>
          <div className="flex items-start gap-3">
            <IconoSector sector={indicador.sector} tamano="md" className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs font-semibold tabular-nums text-[#667085]">Indicador {indicador.codigo}</span>
                <span className="text-xs text-[#667085]">{indicador.sector}</span>
                {(estado !== 'sin_reporte' || !enAnio) && <EstadoTexto estado={estado} />}
                {enAnio && <SituacionTexto situacion={enAnio.situacion} />}
              </div>
              <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-[#192031] [overflow-wrap:anywhere]">{indicador.indicador}</h2>
            </div>
            <BotonCerrarVentana />
          </div>
        </div>

        {/* `relative`: lo escondido con `sr-only` (posición absoluta) se ancla a ESTE cuerpo y se desplaza con él, no al panel. */}
        <div className="relative flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">

          {/* Avance del año: el último reporte aprobado */}
          <Seccion rotulo={`Avance validado · ${indicador.anio}`}>
            <div className="flex items-end justify-between gap-4">
              {indicador.avance === null ? (
                <p className="text-2xl font-semibold leading-none tracking-tight text-[#667085]">
                  Sin avance validado
                  <span className="ml-2 text-base font-medium">· meta {fmt(indicador.meta)}</span>
                </p>
              ) : (
                <p className="text-[40px] font-semibold tabular-nums leading-none tracking-tight text-[#192031]">
                  {fmt(indicador.avance)}
                  <span className="ml-2 text-base font-medium text-[#667085]">de {fmt(indicador.meta)}</span>
                </p>
              )}
              {r !== null && <p className="text-2xl font-semibold tabular-nums text-[#192031]">{fmtRazon(r)}</p>}
            </div>
            <div className="mt-3"><BarraAvance razon={r} estado={estado} /></div>
            <p className="mt-2 text-xs text-[#667085]">{indicador.unidad} · {rotuloMeta(indicador)}</p>
          </Seccion>

          {/* Los cuatro años del plan, lado a lado */}
          <Seccion rotulo="Metas y avance por año">
            <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border ${T.reglaFuerte} bg-[#DCE0E8] sm:grid-cols-4`}>
              {indicador.anios.map(a => {
                const actual = a.anio === indicador.anio
                const contenido = (
                  <>
                    {/* Sobre el fondo teñido del año elegido, el gris de apoyo (#667085) queda en 4,4:1: se oscurece un paso. */}
                    <span className={`${T.rotulo} ${actual ? '!text-[#556072]' : ''}`}>{a.anio}</span>
                    <span className="mt-1 block text-sm font-semibold tabular-nums text-[#192031]">
                      {a.avance === null ? '—' : fmt(a.avance)}
                      <span className={`font-normal ${actual ? 'text-[#556072]' : 'text-[#667085]'}`}> / {a.meta === null ? 'sin meta' : fmt(a.meta)}</span>
                    </span>
                    {conGraficos && (
                      <span className="mt-2 block">
                        <BarraAnio meta={a.meta} avance={a.avance} reporte={a.enAnio?.reporte ?? null} />
                      </span>
                    )}
                    <span className="mt-1.5 block min-h-[1rem]">{a.enAnio && <SituacionTexto situacion={a.enAnio.situacion} className="text-[11px]" />}</span>
                  </>
                )
                const clase = `flex flex-col items-stretch justify-start px-3.5 py-2.5 text-left ${actual ? 'bg-[#EDF0F5]' : 'bg-white'}`
                return onAnio ? (
                  <button
                    key={a.anio}
                    onClick={() => onAnio(a.anio)}
                    aria-pressed={actual}
                    className={`${clase} transition-colors hover:bg-[#F1F3F7] focus-visible:bg-[#F1F3F7] focus-visible:outline-none`}
                  >
                    {contenido}
                  </button>
                ) : (
                  <div key={a.anio} aria-current={actual || undefined} className={clase}>{contenido}</div>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-[#667085]">
              Avance validado / meta de cada año.
              {conGraficos && ' La barra oscura es lo validado; el tramo claro, lo reportado que aún no cuenta.'}
            </p>
          </Seccion>

          {/* Responsable */}
          <Seccion
            rotulo="Responsable"
            acciones={(onAsignar || (onQuitar && puedeQuitarPrincipal)) && (
              <div className="flex shrink-0 items-center gap-2">
                {onQuitar && puedeQuitarPrincipal && principalVista && (
                  <button
                    id="pdm-ficha-quitar"
                    onClick={() => preguntarQuitar(principalVista.usuarioId)}
                    disabled={quitando}
                    aria-expanded={confirma === principalVista.usuarioId}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[#556072] transition-colors hover:bg-[#E6E9EF] hover:text-[#192031] disabled:opacity-50"
                  >
                    Quitar
                  </button>
                )}
                {onAsignar && <button id="pdm-ficha-asignar" onClick={onAsignar} className={T.botonSecChico}>Asignar…</button>}
              </div>
            )}
          >
            <div className={`rounded-lg border px-4 py-3 ${huerfano ? 'border-[#F1C0BB] bg-[#FDF3F2]' : 'border-[#DCE0E8] bg-[#F7F8FA]'}`}>
              {!huerfano && persona && 'nombre' in persona ? (
                <div className="flex items-start gap-3">
                  <Avatar nombre={persona.nombre} fotoUrl={persona.fotoUrl} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5 text-[#192031]">{persona.nombre}</p>
                    <p className="text-xs leading-4 text-[#667085]">{persona.secretaria ?? 'Sin secretaría'}</p>
                    <LineaContrato contrato={persona.contrato} />
                    {nombraAlgo && (tipoResponsable(indicador.responsable) !== 'persona' || !coincideNombre(persona.nombre, indicador.responsable)) && (
                      <p className="mt-0.5 text-[11px] text-[#667085]">En el archivo figuraba «{indicador.responsable}»</p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className={`text-sm font-semibold ${huerfano ? 'text-[#912018]' : 'text-[#192031]'}`}>
                    {huerfano ? 'Sin responsable' : indicador.responsable}
                  </p>
                  {!huerfano && persona && 'sinUsuario' in persona && (
                    <p className="mt-1 text-xs text-[#667085]">{NOTA_SIN_USUARIO[persona.sinUsuario]}</p>
                  )}
                  {huerfano && (
                    <p className="mt-1 text-xs leading-relaxed text-[#912018]">
                      {indicador.responsable && indicador.responsable !== '-' ? `En el archivo figura «${indicador.responsable}». ` : ''}
                      Nadie tiene la obligación de reportar este indicador ni de responder por él. Asignarle una persona lo resuelve.
                    </p>
                  )}
                </>
              )}
              {asignados && (principalVista?.grupo || apoyos.length > 0) && (
                <div className={`mt-3 border-t ${T.reglaFuerte} pt-3`}>
                  {principalVista?.grupo && <p className="text-xs text-[#667085]">Por el grupo «{principalVista.grupo}»</p>}
                  {apoyos.length > 0 && (
                    <>
                      <Rotulo className="mt-1">{apoyos.length === 1 ? 'Apoyo' : 'Apoyos'}</Rotulo>
                      <ul className="mt-2 space-y-2">
                        {apoyos.map(a => (
                          <li key={a.usuarioId}>
                            <div className="flex items-center gap-3">
                              <Avatar nombre={a.nombre} fotoUrl={a.fotoUrl} tamano={a.grupo ? 'md' : 'sm'} apagado={!a.activo} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium leading-5 text-[#192031]">{a.nombre}</span>
                                {a.grupo && <span className="block truncate text-xs leading-4 text-[#667085]">Por el grupo «{a.grupo}»</span>}
                              </span>
                              {onQuitar && !a.grupo && (
                                <button
                                  onClick={() => preguntarQuitar(a.usuarioId)}
                                  disabled={quitando}
                                  aria-expanded={confirma === a.usuarioId}
                                  className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#556072] transition-colors hover:bg-[#E6E9EF] hover:text-[#192031] disabled:opacity-50"
                                >
                                  Quitar
                                </button>
                              )}
                            </div>
                            {onQuitar && !a.grupo && (
                              <ConfirmarQuitar
                                abierto={confirma === a.usuarioId}
                                nombre={a.nombre}
                                comoPrincipal={false}
                                fase={objetivo === a.usuarioId ? faseQuitar : 'reposo'}
                                error={objetivo === a.usuarioId ? errorQuitar : null}
                                onCancelar={() => setConfirma(null)}
                                onConfirmar={() => quitar(a)}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
            {onQuitar && puedeQuitarPrincipal && principalVista && (
              <ConfirmarQuitar
                abierto={confirma === principalVista.usuarioId}
                nombre={principalVista.nombre}
                comoPrincipal
                fase={objetivo === principalVista.usuarioId ? faseQuitar : 'reposo'}
                error={objetivo === principalVista.usuarioId ? errorQuitar : null}
                onCancelar={() => setConfirma(null)}
                onConfirmar={() => quitar(principalVista)}
              />
            )}
          </Seccion>

          {/* Ficha técnica: un cuadro de datos, como el de un formato oficial */}
          <Seccion rotulo="Ficha técnica">
            <dl className={`divide-y ${T.divide} overflow-hidden rounded-lg border ${T.reglaFuerte}`}>
              {([
                ['Secretaría', indicador.dependencia],
                ['Línea estratégica', indicador.linea],
                ['Sector', indicador.sector],
                ['Programa', indicador.programa],
                ['Producto', indicador.producto],
                ['Línea base · Meta cuatrienio', `${fmt(indicador.lineaBase)} · ${fmt(indicador.metaCuatrienio)}`],
              ] as const).map(([rotulo, valor]) => (
                <div key={rotulo} className="grid grid-cols-1 sm:grid-cols-[11.5rem_1fr]">
                  <dt className={`bg-[#F7F8FA] px-3.5 py-2 ${T.rotulo} sm:py-2.5`}>{rotulo}</dt>
                  <dd className="px-3.5 py-2 text-sm leading-snug text-[#192031] sm:py-2.5">{valor}</dd>
                </div>
              ))}
            </dl>
          </Seccion>

          {/* Trazabilidad, reportar, validar y comentar */}
          {seguimiento && <SeguimientoIndicador indicador={indicador} ctx={seguimiento} />}

          {/* Cambios de responsable (solo el administrador): quién cambió qué y cuándo */}
          {onCargarHistorial && (
            <Seccion
              rotulo="Cambios de responsable"
              acciones={historial === null && (
                <button id="pdm-ficha-historial" onClick={cargarHistorial} disabled={cargandoHistorial} className={T.botonSecChico}>
                  <TextoEstable texto={cargandoHistorial ? 'Cargando…' : 'Ver historial'} reserva="Ver historial" />
                </button>
              )}
            >
              {errorHistorial && <p role="alert" className="text-xs font-medium text-[#B42318]">{errorHistorial}</p>}
              {historial === null && !errorHistorial && (
                <p className="text-xs text-[#667085]">Quién asignó o quitó a cada persona, y cuándo.</p>
              )}
              {historial !== null && (
                historial.length === 0 ? (
                  <p className="text-xs text-[#667085]">Nadie ha cambiado a los responsables de este indicador desde que se cargó el plan.</p>
                ) : (
                  <ol className="space-y-3">
                    {historial.map(h => (
                      <li key={h.id} className="relative border-l-2 border-[#DCE0E8] pl-4">
                        <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-[2px] bg-[#98A2B3]" />
                        <p className="text-sm leading-snug text-[#192031]">{h.texto}</p>
                        <p className="mt-0.5 text-xs text-[#667085]">{fechaHoraBogota(h.cuando)} · {nombrePropio(h.quien)}</p>
                        {h.motivo && <p className="mt-0.5 text-xs italic text-[#667085]">«{h.motivo}»</p>}
                      </li>
                    ))}
                  </ol>
                )
              )}
            </Seccion>
          )}
        </div>
    </Ventana>
  )
}
