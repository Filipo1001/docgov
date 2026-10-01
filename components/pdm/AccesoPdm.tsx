'use client'

/**
 * Quién entra al módulo y con qué alcance: lo que antes decidía la barra lateral solo para el
 * administrador y ahora se reparte.
 *
 * El administrador habilita a cualquiera con cualquiera de los tres niveles. Una secretaría solo
 * habilita como «responsable» a la gente de SU dependencia y solo les quita ese acceso: lo exige la
 * base, y la pantalla no ofrece lo que la base negaría. Quien solo consulta (Control Interno) ve la
 * lista sin botones.
 *
 * Habilitar NO es asignar: darle acceso a alguien no le pone indicadores, y asignarle indicadores
 * no le da acceso. Son dos decisiones, y las dos quedan en el historial.
 */

import { useMemo, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { sinTildes } from '@/lib/pdm/texto'
import { fechaCorta } from '@/lib/pdm/contrato'
import {
  AYUDA_NIVEL, ETIQUETA_NIVEL, NIVELES_HABILITABLES, gestiona, type NivelHabilitable, type NivelPdm,
} from '@/lib/pdm/niveles'
import type { AccionesPdm } from '@/lib/pdm/acciones'
import type { PersonaDirectorio } from '@/lib/pdm/personas'
import Dialogo from './Dialogo'
import { Avatar, LineaContrato } from './PersonaVista'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function DialogoHabilitar({ candidatas, niveles, acciones, onCerrar, onHecho }: {
  candidatas: PersonaDirectorio[]
  niveles: readonly NivelHabilitable[]
  acciones: AccionesPdm
  onCerrar: () => void
  onHecho: (mensaje: string) => void
}) {
  const [q, setQ] = useState('')
  const [elegida, setElegida] = useState<string | null>(null)
  const [nivel, setNivel] = useState<NivelHabilitable>(niveles[0])
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const t = sinTildes(q.trim())
  const visibles = useMemo(() => candidatas.filter(p => !t || sinTildes(p.nombre).includes(t)), [candidatas, t])
  const persona = candidatas.find(p => p.id === elegida) ?? null

  async function habilitar() {
    if (!persona || enviando) return
    setEnviando(true)
    setError(null)
    const r = await acciones.habilitar({ usuario: persona.id, nivel, motivo })
    setEnviando(false)
    if (!r.ok) { setError(r.error); return }
    onHecho(`${persona.nombre} ya puede entrar al módulo como ${ETIQUETA_NIVEL[nivel].toLowerCase()}.`)
  }

  return (
    <Dialogo
      titulo="Habilitar a alguien"
      subtitulo="Le da acceso al módulo. No le asigna indicadores: eso se hace en Indicadores."
      onCerrar={onCerrar}
      pie={
        <div className="space-y-3">
          {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={onCerrar} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">
              Cancelar
            </button>
            <button
              id="pdm-habilitar"
              onClick={habilitar}
              disabled={!persona || enviando}
              className="rounded-xl bg-[#192031] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#242F45] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviando ? 'Habilitando…' : persona ? `Habilitar a ${persona.nombre}` : 'Habilitar'}
            </button>
          </div>
        </div>
      }
    >
      <label className="relative block">
        <span className="sr-only">Buscar persona</span>
        <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          id="pdm-habilitar-buscar"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar persona"
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
        />
      </label>

      {candidatas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          Todas las personas que puedes habilitar ya tienen acceso.
        </p>
      ) : visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">Nadie coincide con lo que buscas.</p>
      ) : (
        <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
          {visibles.map(p => {
            const activa = p.id === elegida
            return (
              <li key={p.id}>
                <button
                  onClick={() => { setElegida(p.id); setError(null) }}
                  aria-pressed={activa}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400 ${activa ? 'bg-teal-50' : 'hover:bg-gray-50'}`}
                >
                  <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} tamano="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{p.nombre}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {p.secretaria ?? 'Sin secretaría'}
                      {p.indicadores > 0 && ` · ${plural(p.indicadores, 'indicador', 'indicadores')}`}
                    </span>
                    <LineaContrato contrato={p.contrato} />
                  </span>
                  {activa && <Icono glifo={Iconos.estado.ok} tamano="sm" className="shrink-0 text-teal-700" etiqueta="Elegida" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {niveles.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-gray-600">Qué puede hacer</legend>
          {niveles.map(n => (
            <label key={n} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 px-3 py-2.5 has-[:checked]:border-teal-300 has-[:checked]:bg-teal-50/60">
              <input type="radio" name="pdm-nivel" checked={nivel === n} onChange={() => setNivel(n)} className="mt-0.5 h-4 w-4 accent-teal-700" />
              <span className="text-sm text-gray-900"><b className="font-semibold">{ETIQUETA_NIVEL[n]}</b><span className="block text-xs text-gray-500">{AYUDA_NIVEL[n]}</span></span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
          Entrará como <b className="font-semibold">{ETIQUETA_NIVEL[niveles[0]].toLowerCase()}</b>: {AYUDA_NIVEL[niveles[0]].charAt(0).toLowerCase() + AYUDA_NIVEL[niveles[0]].slice(1)}
        </p>
      )}

      <label className="block">
        <span className="text-xs font-semibold text-gray-600">Motivo <span className="font-normal text-gray-500">(opcional; queda en el historial)</span></span>
        <input
          id="pdm-habilitar-motivo"
          type="text"
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          maxLength={500}
          className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
        />
      </label>
    </Dialogo>
  )
}

export default function AccesoPdm({ personas, nivel, yoId, acciones }: {
  personas: PersonaDirectorio[]
  nivel: NivelPdm
  /** Quién mira: no se le ofrece cambiarse su propio acceso. */
  yoId: string
  acciones: AccionesPdm
}) {
  const [abierto, setAbierto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [confirmaQuitar, setConfirmaQuitar] = useState<string | null>(null)

  const puede = gestiona(nivel)
  const esAdmin = nivel === 'admin'
  const yo = personas.find(p => p.id === yoId)
  const habilitados = useMemo(
    () => personas.filter(p => p.acceso).sort((a, b) =>
      NIVELES_HABILITABLES.indexOf(a.acceso!.nivel) - NIVELES_HABILITABLES.indexOf(b.acceso!.nivel) || a.nombre.localeCompare(b.nombre, 'es')),
    [personas],
  )
  // Quién puede recibir acceso: el administrador, a cualquiera; una secretaría, a gente de SU dependencia.
  // (La base lo exige igual; esto evita ofrecer lo que se negaría.)
  const candidatas = useMemo(
    () => personas.filter(p => !p.acceso && p.rol !== 'admin' && p.id !== yoId && (esAdmin || (yo?.secretaria != null && p.secretaria === yo.secretaria))),
    [personas, yoId, esAdmin, yo],
  )
  const niveles: readonly NivelHabilitable[] = esAdmin ? NIVELES_HABILITABLES : ['responsable']

  async function cambiarNivel(p: PersonaDirectorio, nuevo: NivelHabilitable) {
    if (trabajando) return
    setTrabajando(p.id); setError(null); setAviso(null)
    const r = await acciones.habilitar({ usuario: p.id, nivel: nuevo })
    setTrabajando(null)
    if (!r.ok) setError(r.error)
    else setAviso(`${p.nombre} ahora entra como ${ETIQUETA_NIVEL[nuevo].toLowerCase()}.`)
  }

  async function quitar(p: PersonaDirectorio) {
    if (trabajando) return
    setTrabajando(p.id); setError(null); setAviso(null)
    const r = await acciones.deshabilitar({ usuario: p.id })
    setTrabajando(null); setConfirmaQuitar(null)
    if (!r.ok) setError(r.error)
    else setAviso(`${p.nombre} ya no entra al módulo. Sus indicadores siguen a su cargo.`)
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-bold text-gray-900">Acceso al módulo</h2>
          <span className="text-xs text-gray-500">{plural(habilitados.length, 'persona', 'personas')} además del administrador</span>
        </div>
        {puede && (
          <button
            id="pdm-habilitar-abrir"
            onClick={() => { setAviso(null); setError(null); setAbierto(true) }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#192031] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#242F45]"
          >
            <Icono glifo={Iconos.accion.agregar} tamano="sm" />
            Habilitar a alguien
          </button>
        )}
      </div>

      {aviso && (
        <p role="status" className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 text-emerald-700 hover:text-emerald-900"><Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta="Cerrar aviso" /></button>
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}

      {habilitados.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Solo el administrador entra al módulo por ahora. Habilita a las secretarías para que repartan sus indicadores,
          y a quien deba verlos o reportarlos. Habilitar no asigna indicadores: son dos pasos.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {habilitados.map(p => {
            const a = p.acceso!
            const esYo = p.id === yoId
            // Una secretaría solo toca el acceso de «responsable»; el administrador, todos.
            const toca = puede && !esYo && (esAdmin || a.nivel === 'responsable')
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 py-3">
                <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-semibold text-gray-900">{p.nombre}</p>
                  <p className="truncate text-xs text-gray-500">{p.secretaria ?? 'Sin secretaría'}</p>
                  <p className="truncate text-[11px] text-gray-400">
                    {a.por ? `Habilitada por ${a.por}` : 'Habilitada'}{a.desde ? ` · ${fechaCorta(a.desde.slice(0, 10))}` : ''}
                  </p>
                </div>
                {toca && esAdmin ? (
                  <select
                    aria-label={`Nivel de ${p.nombre}`}
                    value={a.nivel}
                    disabled={trabajando !== null}
                    onChange={e => cambiarNivel(p, e.target.value as NivelHabilitable)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-50"
                  >
                    {NIVELES_HABILITABLES.map(n => <option key={n} value={n}>{ETIQUETA_NIVEL[n]}</option>)}
                  </select>
                ) : (
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">{ETIQUETA_NIVEL[a.nivel]}</span>
                )}
                {toca && (
                  confirmaQuitar === p.id ? (
                    <span className="flex items-center gap-2">
                      <button onClick={() => quitar(p)} disabled={trabajando !== null} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                        {trabajando === p.id ? 'Quitando…' : 'Sí, quitar'}
                      </button>
                      <button onClick={() => setConfirmaQuitar(null)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100">No</button>
                    </span>
                  ) : (
                    <button onClick={() => { setError(null); setConfirmaQuitar(p.id) }} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
                      Quitar acceso
                    </button>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}

      {abierto && (
        <DialogoHabilitar
          candidatas={candidatas}
          niveles={niveles}
          acciones={acciones}
          onCerrar={() => setAbierto(false)}
          onHecho={m => { setAbierto(false); setAviso(m) }}
        />
      )}
    </section>
  )
}
