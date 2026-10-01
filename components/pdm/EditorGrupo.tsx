'use client'

/**
 * Crear o editar un grupo: nombre, secretaría, quiénes lo forman y quién lo lidera.
 *
 * El líder es obligatorio y es quien queda como responsable principal de lo que el
 * grupo lleve; los demás, de apoyo. Por eso el botón de guardar se apaga mientras
 * falte el nombre, la secretaría o el líder, y se dice cuál falta.
 *
 * Al EDITAR, lo que el grupo ya lleva se actualiza solo (la base lo sincroniza en
 * la misma operación): quien sale pierde sus filas, quien entra recibe apoyo, y si
 * cambia el líder el principal pasa a él. Se avisa antes de guardar cuando eso
 * importa. La secretaría de un grupo que ya lleva indicadores no se cambia.
 *
 * Disolver un grupo NO desasigna: sus indicadores siguen a cargo de cada persona,
 * solo que ya no se actualizan en conjunto.
 */

import { useMemo, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { sinTildes } from '@/lib/pdm/texto'
import { MAX_MIEMBROS, MAX_NOMBRE_GRUPO, type AccionesPdm } from '@/lib/pdm/acciones'
import type { GrupoVista, PersonaDirectorio, SecretariaPlan } from '@/lib/pdm/personas'
import Dialogo from './Dialogo'
import { Avatar, LineaContrato } from './PersonaVista'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export default function EditorGrupo({ grupo, personas, secretarias, acciones, onCerrar, onHecho }: {
  /** Sin él se crea un grupo nuevo. */
  grupo?: GrupoVista
  personas: PersonaDirectorio[]
  secretarias: SecretariaPlan[]
  acciones: AccionesPdm
  onCerrar: () => void
  onHecho: (mensaje: string) => void
}) {
  const [nombre, setNombre] = useState(grupo?.nombre ?? '')
  const [secretariaId, setSecretariaId] = useState(grupo?.secretariaId ?? secretarias[0]?.id ?? '')
  const [miembros, setMiembros] = useState<string[]>(grupo?.miembros ?? [])
  const [liderId, setLiderId] = useState<string | null>(grupo?.liderId ?? null)
  const [q, setQ] = useState('')
  const [todas, setTodas] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmaDisolver, setConfirmaDisolver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const secretaria = secretarias.find(s => s.id === secretariaId)
  const t = sinTildes(q.trim())
  const elegidos = useMemo(() => new Set(miembros), [miembros])
  const bloqueaSecretaria = (grupo?.indicadores ?? 0) > 0

  const visibles = useMemo(() => {
    // Los miembros primero, luego el resto por nombre. Sin búsqueda, solo la secretaría del grupo (salvo «ver todas»).
    const filtrar = !t && !todas && secretaria !== undefined
    return personas
      .filter(p => elegidos.has(p.id) || ((!filtrar || p.secretaria === secretaria?.nombre) && (!t || sinTildes(p.nombre).includes(t))))
      .filter(p => !t || sinTildes(p.nombre).includes(t))
      .sort((a, b) => Number(elegidos.has(b.id)) - Number(elegidos.has(a.id)) || a.nombre.localeCompare(b.nombre, 'es'))
  }, [personas, elegidos, t, todas, secretaria])

  function alternar(id: string) {
    setError(null)
    if (miembros.includes(id)) {
      setMiembros(miembros.filter(x => x !== id))
      if (id === liderId) setLiderId(null)
    } else {
      // El primero que se añade queda de líder: lo más común es que el grupo nazca con una cabeza visible.
      if (miembros.length === 0 && liderId === null) setLiderId(id)
      setMiembros([...miembros, id])
    }
  }

  const nombreLimpio = nombre.trim()
  const falta = nombreLimpio === '' ? 'Falta el nombre del grupo.'
    : !secretaria ? 'Falta la secretaría.'
    : miembros.length === 0 ? 'Elige a quienes forman el grupo.'
    : liderId === null ? 'Elige quién lidera el grupo.'
    : null
  const puede = falta === null && !enviando

  const cambiaLider = grupo !== undefined && grupo.indicadores > 0 && liderId !== null && liderId !== grupo.liderId
  const salen = grupo ? grupo.miembros.filter(id => !elegidos.has(id)).length : 0

  async function guardar() {
    if (!puede || !secretaria || liderId === null) return
    setEnviando(true)
    setError(null)
    const r = await acciones.guardarGrupo({
      grupo: grupo?.id, nombre: nombreLimpio, secretaria: secretaria.id, lider: liderId, miembros, motivo,
    })
    setEnviando(false)
    if (!r.ok) { setError(r.error); return }
    onHecho(grupo ? `Grupo «${nombreLimpio}» guardado.` : `Grupo «${nombreLimpio}» creado.`)
  }

  async function disolver() {
    if (!grupo || enviando) return
    setEnviando(true)
    setError(null)
    const r = await acciones.eliminarGrupo({ grupo: grupo.id, motivo })
    setEnviando(false)
    if (!r.ok) { setError(r.error); setConfirmaDisolver(false); return }
    onHecho(`Grupo «${grupo.nombre}» disuelto. Sus indicadores siguen a cargo de cada persona.`)
  }

  return (
    <Dialogo
      titulo={grupo ? 'Editar grupo' : 'Crear grupo'}
      subtitulo={grupo ? undefined : 'Personas que responden juntas por varios indicadores. El líder responde por todos.'}
      onCerrar={onCerrar}
      ancho="sm:max-w-2xl"
      pie={
        <div className="space-y-3">
          {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
          {!error && falta && <p className="text-xs text-gray-500">{falta}</p>}
          {confirmaDisolver ? (
            <div className="space-y-2 rounded-xl bg-red-50 px-3 py-3">
              <p className="text-sm text-red-900">
                ¿Disolver «{grupo?.nombre}»?{' '}
                {(grupo?.indicadores ?? 0) === 0
                  ? 'No tiene indicadores asignados.'
                  : `Sus ${plural(grupo?.indicadores ?? 0, 'indicador', 'indicadores')} siguen a cargo de cada persona, pero ya no se actualizan en conjunto.`}
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button onClick={() => setConfirmaDisolver(false)} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">No, conservarlo</button>
                <button onClick={disolver} disabled={enviando} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {enviando ? 'Disolviendo…' : 'Sí, disolver'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              {grupo ? (
                <button onClick={() => setConfirmaDisolver(true)} className="text-left text-sm font-semibold text-red-700 underline-offset-2 hover:underline">
                  Disolver grupo
                </button>
              ) : <span />}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button onClick={onCerrar} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  id="pdm-guardar-grupo"
                  onClick={guardar}
                  disabled={!puede}
                  className="rounded-xl bg-[#192031] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#242F45] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {enviando ? 'Guardando…' : grupo ? 'Guardar cambios' : 'Crear grupo'}
                </button>
              </div>
            </div>
          )}
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Nombre del grupo</span>
          <input
            id="pdm-grupo-nombre"
            type="text"
            value={nombre}
            onChange={e => { setNombre(e.target.value); setError(null) }}
            maxLength={MAX_NOMBRE_GRUPO}
            placeholder="Por ejemplo: Equipo de desarrollo rural"
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Secretaría</span>
          <select
            id="pdm-grupo-secretaria"
            value={secretariaId}
            onChange={e => { setSecretariaId(e.target.value); setTodas(false) }}
            disabled={bloqueaSecretaria}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50 disabled:text-gray-500"
          >
            {secretarias.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {bloqueaSecretaria && <span className="mt-1 block text-xs text-gray-500">No se cambia: el grupo ya lleva indicadores.</span>}
        </label>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-900">Quiénes lo forman</h3>
          <span className="text-xs text-gray-500">{plural(miembros.length, 'persona', 'personas')}{miembros.length >= MAX_MIEMBROS ? ' (máximo)' : ''}</span>
        </div>
        <label className="relative block">
          <span className="sr-only">Buscar persona</span>
          <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="pdm-grupo-buscar"
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar persona"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
          />
        </label>
        {secretaria && !t && (
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>{todas ? 'Personas de todas las secretarías' : `Personas de ${secretaria.nombre}`}</span>
            <button onClick={() => setTodas(v => !v)} className="font-semibold text-teal-700 underline-offset-2 hover:underline">
              {todas ? `Solo ${secretaria.nombre}` : 'Ver todas las secretarías'}
            </button>
          </p>
        )}

        {visibles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">Nadie coincide con lo que buscas.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
            {visibles.map(p => {
              const dentro = elegidos.has(p.id)
              const esLider = p.id === liderId
              return (
                <li key={p.id} className={`flex items-center gap-3 px-3 py-2.5 ${dentro ? 'bg-teal-50/60' : ''}`}>
                  <button
                    onClick={() => alternar(p.id)}
                    aria-pressed={dentro}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded-lg"
                  >
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${dentro ? 'border-teal-700 bg-teal-700 text-white' : 'border-gray-300 bg-white'}`}
                    >
                      {dentro && <Icono glifo={Iconos.estado.ok} tamano="sm" className="h-3.5 w-3.5" />}
                    </span>
                    <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} tamano="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900">{p.nombre}</span>
                      <span className="block truncate text-xs text-gray-500">{p.secretaria ?? 'Sin secretaría'}</span>
                      <LineaContrato contrato={p.contrato} />
                    </span>
                  </button>
                  {dentro && (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-gray-700">
                      <input
                        type="radio"
                        name="pdm-lider"
                        checked={esLider}
                        onChange={() => { setLiderId(p.id); setError(null) }}
                        className="h-4 w-4 accent-teal-700"
                      />
                      Líder
                    </label>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {grupo && (cambiaLider || salen > 0) && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
          <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-0.5 shrink-0" />
          <span>
            Este grupo lleva {plural(grupo.indicadores, 'indicador', 'indicadores')}.
            {cambiaLider && ' Al cambiar de líder, el responsable principal de los que el grupo sostiene pasa al nuevo líder.'}
            {salen > 0 && ` ${plural(salen, 'persona que sale pierde', 'personas que salen pierden')} su participación en ellos.`}
            {' '}Todo queda en el historial.
          </span>
        </p>
      )}

      <label className="block">
        <span className="text-xs font-semibold text-gray-600">Motivo <span className="font-normal text-gray-500">(opcional; queda en el historial)</span></span>
        <input
          id="pdm-grupo-motivo"
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
