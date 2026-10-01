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
      <EncabezadoSeccion titulo="Ajustes" detalle="Cómo se mide el avance y cuándo se reporta" />

      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
        <h2 className="text-sm font-bold text-gray-900">Cómo se mide el avance</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Define qué significa el valor que reportan los responsables. Cambiarlo recalcula el cumplimiento de todos los
          indicadores; los reportes ya hechos no se tocan.
        </p>
        <fieldset className="mt-3 space-y-2" disabled={guardando}>
          <legend className="sr-only">Criterio de avance</legend>
          {CLAVES.map(c => (
            <label
              key={c}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                criterio === c ? 'border-teal-600 bg-teal-50/50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="pdm-criterio"
                id={`pdm-criterio-${c}`}
                checked={criterio === c}
                onChange={() => { setCriterio(c); setAvisoAjustes(null) }}
                className="mt-0.5 h-4 w-4 border-gray-300 text-teal-700 focus:ring-teal-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">{MODOS[c].titulo}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-gray-600">{MODOS[c].nota}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-gray-600">Cada cuánto se hacen los cortes <span className="font-normal text-gray-500">(opcional, solo informativo)</span></span>
          <input
            id="pdm-periodicidad"
            type="text"
            value={periodicidad}
            maxLength={MAX_PERIODICIDAD}
            placeholder="Por ejemplo: cada mes, o cada trimestre"
            onChange={e => { setPeriodicidad(e.target.value); setAvisoAjustes(null) }}
            disabled={guardando}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
          />
        </label>

        {errorAjustes && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{errorAjustes}</p>}
        <div className="mt-3 flex items-center justify-end gap-3">
          {avisoAjustes && !cambiado && <p role="status" className="text-xs font-medium text-emerald-700">{avisoAjustes}</p>}
          <button
            id="pdm-ajustes-guardar"
            onClick={guardarAjustes}
            disabled={!cambiado || guardando}
            className="rounded-xl bg-[#192031] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#242F45] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-bold text-gray-900">Cortes</h2>
            <span className="text-xs text-gray-500">{plural(cortes.length, 'corte', 'cortes')}</span>
          </div>
          <button
            id="pdm-corte-nuevo"
            onClick={() => { setAvisoCortes(null); setErrorCortes(null); setEditando(null) }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#192031] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#242F45]"
          >
            <Icono glifo={Iconos.accion.agregar} tamano="sm" />
            Nuevo corte
          </button>
        </div>

        {avisoCortes && (
          <p role="status" className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
            <span>{avisoCortes}</span>
            <button onClick={() => setAvisoCortes(null)} className="shrink-0 text-emerald-700 hover:text-emerald-900">
              <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta="Cerrar aviso" />
            </button>
          </p>
        )}
        {errorCortes && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800">{errorCortes}</p>}

        {cortes.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            Aún no hay cortes. Crea el primero y ábrelo para que los responsables empiecen a reportar el avance de sus indicadores.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {cortes.map(c => {
              const n = reportesPorCorte?.[c.id]
              const ocupado = trabajando === c.id
              const aqui = confirmando?.id === c.id ? confirmando.que : null
              return (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-[14rem] flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-gray-900">
                        <span className="min-w-0 break-words">{c.nombre}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          c.abierto ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-100 text-gray-600'
                        }`}>
                          {c.abierto ? 'Abierto' : 'Cerrado'}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {fechaLarga(c.fecha)}{n !== undefined ? ` · ${plural(n, 'reporte', 'reportes')}` : ''}
                      </p>
                    </div>
                    {!aqui && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {c.abierto ? (
                          <button
                            onClick={() => setConfirmando({ id: c.id, que: 'cerrar' })}
                            disabled={trabajando !== null}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
                          >
                            Cerrar
                          </button>
                        ) : (
                          <button
                            onClick={() => cambiarEstado(c, 'abierto')}
                            disabled={trabajando !== null || abierto !== null}
                            title={abierto ? `Cierra «${abierto.nombre}» para abrir este corte` : undefined}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {ocupado ? 'Abriendo…' : 'Abrir'}
                          </button>
                        )}
                        <button
                          onClick={() => { setAvisoCortes(null); setErrorCortes(null); setEditando(c) }}
                          disabled={trabajando !== null}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                        >
                          Editar
                        </button>
                        {n === 0 && (
                          <button
                            onClick={() => setConfirmando({ id: c.id, que: 'eliminar' })}
                            disabled={trabajando !== null}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {aqui && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3.5 py-2.5">
                      <p className="text-xs leading-relaxed text-gray-700">
                        {aqui === 'cerrar'
                          ? 'Al cerrarlo, nadie más podrá reportar en este corte. Lo ya reportado se conserva.'
                          : 'Este corte no tiene reportes: se elimina sin dejar nada.'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmando(null)}
                          disabled={ocupado}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => (aqui === 'cerrar' ? cambiarEstado(c, 'cerrado') : eliminar(c))}
                          disabled={ocupado}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${aqui === 'eliminar' ? 'bg-red-700 hover:bg-red-800' : 'bg-[#192031] hover:bg-[#242F45]'}`}
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
          <p className="mt-2 text-xs text-gray-500">Para abrir otro corte, primero cierra «{abierto.nombre}»: solo se reporta en uno a la vez.</p>
        )}
      </section>

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
