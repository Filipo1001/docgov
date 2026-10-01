'use client'

/**
 * Ajustes del seguimiento (solo el administrador): cómo se mide el avance, cada cuánto se hacen los
 * cortes y los cortes mismos.
 *
 * Nada de esto está fijo en el código: cuando Control Interno y la Alcaldía decidan, se escribe aquí
 * y el sistema lo aplica a todos igual. Mientras el criterio de avance esté «por definir», el
 * cumplimiento se muestra como provisional. Cada cambio queda en la bitácora del plan.
 */

import { useState } from 'react'
import { fechaLarga, MODOS, claveModo, type AvanceModo, type Corte, type Seguimiento } from '@/lib/pdm/seguimiento'
import { MAX_PERIODICIDAD, type AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import EncabezadoSeccion from './EncabezadoSeccion'
import { Marcador, Panel } from './ui'
import { T } from './tema'
import EditorCorte from './EditorCorte'
import { ACCIONES_SEGUIMIENTO_REALES } from './acciones-seguimiento-reales'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

type Clave = AvanceModo | 'por_definir'
const CLAVES: Clave[] = ['por_definir', 'anual', 'acumulado']

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export default function AjustesPdm({ seguimiento, reportesPorCorte, acciones = ACCIONES_SEGUIMIENTO_REALES }: {
  seguimiento: Seguimiento
  /** Cuántos reportes tiene cada corte; `null` si no se pudo leer (entonces no se ofrece eliminar). */
  reportesPorCorte: Record<string, number> | null
  acciones?: AccionesSeguimiento
}) {
  const { ajustes, cortes, abierto } = seguimiento

  const [criterio, setCriterio] = useState<Clave>(claveModo(ajustes.avanceModo))
  const [periodicidad, setPeriodicidad] = useState(ajustes.periodicidad ?? '')
  const [guardando, setGuardando] = useState(false)
  const [errorAjustes, setErrorAjustes] = useState<string | null>(null)
  const [avisoAjustes, setAvisoAjustes] = useState<string | null>(null)

  // `undefined`: cerrado · `null`: corte nuevo · un corte: editándolo
  const [editando, setEditando] = useState<Corte | null | undefined>(undefined)
  const [confirmando, setConfirmando] = useState<{ id: string; que: 'cerrar' | 'eliminar' } | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [errorCortes, setErrorCortes] = useState<string | null>(null)
  const [avisoCortes, setAvisoCortes] = useState<string | null>(null)

  const cambiado = criterio !== claveModo(ajustes.avanceModo) || periodicidad.trim() !== (ajustes.periodicidad ?? '')

  async function guardarAjustes() {
    if (guardando || !cambiado) return
    setGuardando(true)
    setErrorAjustes(null)
    setAvisoAjustes(null)
    const r = await acciones.configurarPlan({ avanceModo: criterio === 'por_definir' ? null : criterio, periodicidad })
    setGuardando(false)
    if (!r.ok) { setErrorAjustes(r.error); return }
    setAvisoAjustes('Ajustes guardados.')
  }

  async function cambiarEstado(c: Corte, estado: 'abierto' | 'cerrado') {
    setTrabajando(c.id)
    setErrorCortes(null)
    setAvisoCortes(null)
    const r = await acciones.cambiarEstadoCorte({ corte: c.id, estado })
    setTrabajando(null)
    setConfirmando(null)
    if (!r.ok) { setErrorCortes(r.error); return }
    setAvisoCortes(estado === 'abierto' ? `«${c.nombre}» está abierto: ya se puede reportar.` : `«${c.nombre}» se cerró: nadie más puede reportar en él.`)
  }

  async function eliminar(c: Corte) {
    setTrabajando(c.id)
    setErrorCortes(null)
    setAvisoCortes(null)
    const r = await acciones.eliminarCorte({ corte: c.id })
    setTrabajando(null)
    setConfirmando(null)
    if (!r.ok) { setErrorCortes(r.error); return }
    setAvisoCortes(`«${c.nombre}» se eliminó.`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <EncabezadoSeccion
        titulo="Ajustes"
        detalle="Cómo se mide el avance y cuándo se reporta."
        datos={[
          { rotulo: 'Criterio de avance', valor: MODOS[claveModo(ajustes.avanceModo)].titulo },
          { rotulo: 'Corte abierto', valor: abierto ? abierto.nombre : 'Ninguno' },
        ]}
      />

      <Panel titulo="Cómo se mide el avance">
        <p className="text-xs leading-relaxed text-[#667085]">
          Define qué significa el valor que reportan los responsables. Cambiarlo recalcula el cumplimiento de todos los
          indicadores; los reportes ya hechos no se tocan.
        </p>
        <fieldset className="mt-3 space-y-2" disabled={guardando}>
          <legend className="sr-only">Criterio de avance</legend>
          {CLAVES.map(c => (
            <label
              key={c}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                criterio === c ? 'border-[#192031] bg-[#F4F5F8]' : 'border-[#DCE0E8] hover:border-[#9AA3B5]'
              }`}
            >
              <input
                type="radio"
                name="pdm-criterio"
                id={`pdm-criterio-${c}`}
                checked={criterio === c}
                onChange={() => { setCriterio(c); setAvisoAjustes(null) }}
                className="mt-0.5 h-4 w-4 accent-[#192031]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#192031]">{MODOS[c].titulo}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[#556072]">{MODOS[c].nota}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="mt-4 block">
          <span className={T.rotulo}>Cada cuánto se hacen los cortes <span className="font-normal normal-case tracking-normal">(opcional, solo informativo)</span></span>
          <input
            id="pdm-periodicidad"
            type="text"
            value={periodicidad}
            maxLength={MAX_PERIODICIDAD}
            placeholder="Por ejemplo: cada mes, o cada trimestre"
            onChange={e => { setPeriodicidad(e.target.value); setAvisoAjustes(null) }}
            disabled={guardando}
            className={`${T.campo} mt-1.5`}
          />
        </label>

        {errorAjustes && <p role="alert" className={`mt-3 ${T.avisoMal}`}>{errorAjustes}</p>}
        <div className="mt-4 flex items-center justify-end gap-3">
          {avisoAjustes && !cambiado && <p role="status" className="text-xs font-medium text-[#1F5D43]">{avisoAjustes}</p>}
          <button id="pdm-ajustes-guardar" onClick={guardarAjustes} disabled={!cambiado || guardando} className={T.boton}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </Panel>

      <Panel
        titulo="Cortes"
        nota={plural(cortes.length, 'corte', 'cortes')}
        acciones={
          <button id="pdm-corte-nuevo" onClick={() => { setAvisoCortes(null); setErrorCortes(null); setEditando(null) }} className={T.botonChico}>
            <Icono glifo={Iconos.accion.agregar} tamano="sm" />
            Nuevo corte
          </button>
        }
      >
        {avisoCortes && (
          <p role="status" className={`mb-3 flex items-start justify-between gap-3 ${T.avisoBien}`}>
            <span>{avisoCortes}</span>
            <button onClick={() => setAvisoCortes(null)} className="shrink-0 text-[#1F5D43] hover:text-[#144432]">
              <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta="Cerrar aviso" />
            </button>
          </p>
        )}
        {errorCortes && <p role="alert" className={`mb-3 ${T.avisoMal}`}>{errorCortes}</p>}

        {cortes.length === 0 ? (
          <p className="text-xs leading-relaxed text-[#667085]">
            Aún no hay cortes. Crea el primero y ábrelo para que los responsables empiecen a reportar el avance de sus indicadores.
          </p>
        ) : (
          <ul className={`-my-1 divide-y ${T.divide}`}>
            {cortes.map(c => {
              const n = reportesPorCorte?.[c.id]
              const ocupado = trabajando === c.id
              const aqui = confirmando?.id === c.id ? confirmando.que : null
              return (
                <li key={c.id} className="py-3.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-[14rem] flex-1">
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-[#192031]">
                        <span className="min-w-0 break-words">{c.nombre}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                          <Marcador clase={c.abierto ? 'bg-[#2E7D5B]' : 'bg-[#98A2B3]'} />
                          {c.abierto ? 'Abierto' : 'Cerrado'}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-[#667085]">
                        {fechaLarga(c.fecha)}{n !== undefined ? ` · ${plural(n, 'reporte', 'reportes')}` : ''}
                      </p>
                    </div>
                    {!aqui && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {c.abierto ? (
                          <button onClick={() => setConfirmando({ id: c.id, que: 'cerrar' })} disabled={trabajando !== null} className={T.botonSecChico}>
                            Cerrar
                          </button>
                        ) : (
                          <button
                            onClick={() => cambiarEstado(c, 'abierto')}
                            disabled={trabajando !== null || abierto !== null}
                            title={abierto ? `Cierra «${abierto.nombre}» para abrir este corte` : undefined}
                            className={T.botonSecChico}
                          >
                            {ocupado ? 'Abriendo…' : 'Abrir'}
                          </button>
                        )}
                        <button
                          onClick={() => { setAvisoCortes(null); setErrorCortes(null); setEditando(c) }}
                          disabled={trabajando !== null}
                          className={T.botonSecChico}
                        >
                          Editar
                        </button>
                        {n === 0 && (
                          <button
                            onClick={() => setConfirmando({ id: c.id, que: 'eliminar' })}
                            disabled={trabajando !== null}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#B42318] transition-colors hover:bg-[#FDF3F2] disabled:opacity-50"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {aqui && (
                    <div className={`mt-2.5 flex flex-wrap items-center justify-between gap-2 ${T.avisoNota}`}>
                      <p className="text-xs leading-relaxed">
                        {aqui === 'cerrar'
                          ? 'Al cerrarlo, nadie más podrá reportar en este corte. Lo ya reportado se conserva.'
                          : 'Este corte no tiene reportes: se elimina sin dejar nada.'}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmando(null)} disabled={ocupado} className={T.botonSecChico}>Cancelar</button>
                        <button
                          onClick={() => (aqui === 'cerrar' ? cambiarEstado(c, 'cerrado') : eliminar(c))}
                          disabled={ocupado}
                          className={aqui === 'eliminar' ? T.botonPeligro : T.botonChico}
                        >
                          {ocupado ? 'Un momento…' : aqui === 'cerrar' ? 'Cerrar el corte' : 'Eliminar el corte'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {abierto && cortes.some(c => !c.abierto) && (
          <p className="mt-3 text-xs text-[#667085]">Para abrir otro corte, primero cierra «{abierto.nombre}»: solo se reporta en uno a la vez.</p>
        )}
      </Panel>

      {editando !== undefined && (
        <EditorCorte
          key={editando?.id ?? 'nuevo'}
          corte={editando ?? undefined}
          otroAbierto={abierto && abierto.id !== editando?.id ? abierto.nombre : null}
          conReportes={editando ? (reportesPorCorte?.[editando.id] ?? 1) > 0 : false}
          acciones={acciones}
          onCerrar={() => setEditando(undefined)}
          onHecho={mensaje => { setEditando(undefined); setAvisoCortes(mensaje) }}
        />
      )}
    </div>
  )
}
