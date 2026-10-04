'use client'

/**
 * Crear o editar un grupo: nombre, secretaría, quiénes lo forman y quién lo lidera.
 *
 * El líder es OPCIONAL. Con líder, él queda como responsable principal de lo que el
 * grupo lleve y los demás de apoyo. Sin líder, el grupo entra a los indicadores solo
 * como apoyo y el principal sigue siendo quien ya era (por ejemplo, el secretario).
 * El botón de guardar se apaga mientras falte el nombre o las personas, y se dice
 * cuál falta.
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
import { MAX_DESCRIPCION, MAX_MIEMBROS, MAX_NOMBRE_GRUPO, type AccionesPdm } from '@/lib/pdm/acciones'
import type { GrupoVista, PersonaDirectorio, SecretariaPlan } from '@/lib/pdm/personas'
import Dialogo from './Dialogo'
import BotonAccion, { Despliegue, useConfirmar } from './Movimiento'
import { T } from './tema'
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
  const [descripcion, setDescripcion] = useState(grupo?.descripcion ?? '')
  const [secretariaId, setSecretariaId] = useState(grupo?.secretariaId ?? secretarias[0]?.id ?? '')
  const [miembros, setMiembros] = useState<string[]>(grupo?.miembros ?? [])
  const [liderId, setLiderId] = useState<string | null>(grupo?.liderId ?? null)
  const [q, setQ] = useState('')
  const [todas, setTodas] = useState(false)
  const [motivo, setMotivo] = useState('')
  const { fase, correr, ocupado: enviando } = useConfirmar()
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
      setMiembros([...miembros, id])
    }
  }

  const nombreLimpio = nombre.trim()
  const falta = nombreLimpio === '' ? 'Falta el nombre del grupo.'
    : !secretaria ? 'Falta la secretaría.'
    : miembros.length === 0 ? 'Elige a quienes forman el grupo.'
    : null
  const puede = falta === null && !enviando

  const cambiaLider = grupo !== undefined && grupo.indicadores > 0 && liderId !== grupo.liderId
  const salen = grupo ? grupo.miembros.filter(id => !elegidos.has(id)).length : 0

  async function guardar() {
    if (!puede || !secretaria) return
    setError(null)
    await correr(
      () => acciones.guardarGrupo({
        grupo: grupo?.id, nombre: nombreLimpio, secretaria: secretaria.id, lider: liderId, miembros,
        descripcion: descripcion.trim(), motivo,
      }),
      {
        alTerminar: () => onHecho(grupo ? `Grupo «${nombreLimpio}» guardado.` : `Grupo «${nombreLimpio}» creado.`),
        alFallar: setError,
        quedarseHecho: true,
      },
    )
  }

  async function disolver() {
    if (!grupo || enviando) return
    setError(null)
    await correr(
      () => acciones.eliminarGrupo({ grupo: grupo.id, motivo }),
      {
        alTerminar: () => onHecho(`Grupo «${grupo.nombre}» disuelto. Sus indicadores siguen a cargo de cada persona.`),
        alFallar: e => { setError(e); setConfirmaDisolver(false) },
        quedarseHecho: true,
      },
    )
  }

  return (
    <Dialogo
      titulo={grupo ? 'Editar grupo' : 'Crear grupo'}
      subtitulo={grupo ? undefined : 'Personas que responden juntas por varios indicadores.'}
      onCerrar={onCerrar}
      ancho="sm:max-w-2xl"
      pie={
        <div>
          {/* Lo que falta o lo que salió mal se despliega: aparecer de golpe sacudía el pie de la ventana. */}
          <Despliegue abierto={!!error || !!falta}>
            {error
              ? <p role="alert" className="text-sm font-medium text-[#B42318]">{error}</p>
              : falta ? <p className="text-xs text-[#667085]">{falta}</p> : null}
          </Despliegue>
          {confirmaDisolver ? (
            <div className="space-y-2 rounded-lg border border-[#F1C0BB] bg-[#FDF3F2] px-3 py-3">
              <p className="text-sm text-[#912018]">
                ¿Disolver «{grupo?.nombre}»?{' '}
                {(grupo?.indicadores ?? 0) === 0
                  ? 'No tiene indicadores asignados.'
                  : `Sus ${plural(grupo?.indicadores ?? 0, 'indicador', 'indicadores')} siguen a cargo de cada persona, pero ya no se actualizan en conjunto.`}
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button onClick={() => setConfirmaDisolver(false)} disabled={enviando} className={T.accionSecundaria}>No, conservarlo</button>
                <BotonAccion
                  fase={fase}
                  onClick={disolver}
                  className="!bg-[#B42318] hover:!bg-[#912018]"
                  etiquetas={{ reposo: 'Sí, disolver', trabajando: 'Disolviendo', hecho: 'Disuelto' }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              {grupo ? (
                <button onClick={() => setConfirmaDisolver(true)} className="text-left text-sm font-semibold text-[#B42318] underline-offset-2 hover:underline">
                  Disolver grupo
                </button>
              ) : <span />}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button onClick={onCerrar} disabled={enviando} className={T.accionSecundaria}>Cancelar</button>
                <BotonAccion
                  id="pdm-guardar-grupo"
                  fase={fase}
                  inhabilitado={falta !== null}
                  onClick={guardar}
                  etiquetas={{
                    reposo: grupo ? 'Guardar cambios' : 'Crear grupo',
                    trabajando: 'Guardando',
                    hecho: grupo ? 'Guardado' : 'Creado',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Nombre del grupo</span>
          <input
            id="pdm-grupo-nombre"
            type="text"
            value={nombre}
            onChange={e => { setNombre(e.target.value); setError(null) }}
            maxLength={MAX_NOMBRE_GRUPO}
            placeholder="Por ejemplo: Equipo de desarrollo rural"
            className="mt-1 w-full rounded-lg border border-[#DCE0E8] bg-white px-3 py-2.5 text-sm text-[#192031] placeholder-[#98A2B3] outline-none focus:border-[#192031] focus:ring-1 focus:ring-[#192031]"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Secretaría</span>
          <select
            id="pdm-grupo-secretaria"
            value={secretariaId}
            onChange={e => { setSecretariaId(e.target.value); setTodas(false) }}
            disabled={bloqueaSecretaria}
            className="mt-1 w-full rounded-lg border border-[#DCE0E8] bg-white px-3 py-2.5 text-sm text-[#192031] outline-none focus:border-[#192031] focus:ring-1 focus:ring-[#192031] disabled:bg-[#F7F8FA] disabled:text-[#667085]"
          >
            {secretarias.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {bloqueaSecretaria && <span className="mt-1 block text-xs text-[#667085]">No se cambia: el grupo ya lleva indicadores.</span>}
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Descripción <span className="font-normal text-[#667085]">(opcional)</span></span>
        <textarea
          id="pdm-grupo-descripcion"
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          maxLength={MAX_DESCRIPCION}
          rows={2}
          placeholder="Para qué existe este grupo"
          className="mt-1 w-full resize-none rounded-lg border border-[#DCE0E8] bg-white px-3 py-2.5 text-sm text-[#192031] placeholder-[#98A2B3] outline-none focus:border-[#192031] focus:ring-1 focus:ring-[#192031]"
        />
      </label>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Quiénes lo forman</h3>
          <span className="text-xs text-[#667085]">{plural(miembros.length, 'persona', 'personas')}{miembros.length >= MAX_MIEMBROS ? ' (máximo)' : ''}</span>
        </div>
        <p className="text-xs leading-relaxed text-[#667085]">
          El líder es opcional. Con líder, él es el responsable principal de lo que el grupo lleve y los demás apoyan.
          Sin líder, el grupo entra solo como apoyo y el principal sigue siendo quien ya era.
          {liderId !== null && (
            <button onClick={() => setLiderId(null)} className="ml-1.5 font-semibold text-[#192031] underline-offset-2 hover:underline">
              Quitar el líder
            </button>
          )}
        </p>
        <label className="relative block">
          <span className="sr-only">Buscar persona</span>
          <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input
            id="pdm-grupo-buscar"
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar persona"
            className="w-full rounded-lg border border-[#DCE0E8] bg-white py-2.5 pl-10 pr-3 text-sm text-[#192031] placeholder-[#98A2B3] outline-none focus:border-[#192031] focus:ring-1 focus:ring-[#192031]"
          />
        </label>
        {secretaria && !t && (
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[#667085]">
            <span>{todas ? 'Personas de todas las secretarías' : `Personas de ${secretaria.nombre}`}</span>
            <button onClick={() => setTodas(v => !v)} className="font-semibold text-[#192031] underline-offset-2 hover:underline">
              {todas ? `Solo ${secretaria.nombre}` : 'Ver todas las secretarías'}
            </button>
          </p>
        )}

        {visibles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#C5CBD6] px-4 py-8 text-center text-sm text-[#667085]">Nadie coincide con lo que buscas.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-[#E6E9EF] overflow-y-auto rounded-lg border border-[#DCE0E8]">
            {visibles.map(p => {
              const dentro = elegidos.has(p.id)
              const esLider = p.id === liderId
              return (
                <li key={p.id} className={`flex items-center gap-3 px-3 py-2.5 ${dentro ? 'bg-[#EDF0F5]/60' : ''}`}>
                  <button
                    onClick={() => alternar(p.id)}
                    aria-pressed={dentro}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] rounded-lg"
                  >
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${dentro ? 'border-[#192031] bg-[#192031] text-white' : 'border-[#C5CBD6] bg-white'}`}
                    >
                      {dentro && <Icono glifo={Iconos.estado.ok} tamano="sm" className="h-3.5 w-3.5" />}
                    </span>
                    <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} tamano="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#192031]">{p.nombre}</span>
                      <span className="block truncate text-xs text-[#667085]">{p.secretaria ?? 'Sin secretaría'}</span>
                      <LineaContrato contrato={p.contrato} />
                    </span>
                  </button>
                  {dentro && (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#2D3648]">
                      <input
                        type="radio"
                        name="pdm-lider"
                        checked={esLider}
                        onChange={() => { setLiderId(p.id); setError(null) }}
                        className="h-4 w-4 accent-[#192031]"
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
        <p role="status" className="flex items-start gap-2 rounded-lg border border-[#EBD9A8] bg-[#FBF6E7] px-3 py-2.5 text-xs leading-relaxed text-[#7A5410]">
          <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-0.5 shrink-0" />
          <span>
            Este grupo lleva {plural(grupo.indicadores, 'indicador', 'indicadores')}.
            {cambiaLider && (liderId === null
              ? ' Sin líder, el responsable principal de los que el grupo sostiene no cambia: sigue siendo quien es.'
              : ' Al cambiar de líder, el responsable principal de los que el grupo sostiene pasa al nuevo líder.')}
            {salen > 0 && ` ${plural(salen, 'persona que sale pierde', 'personas que salen pierden')} su participación en ellos.`}
            {' '}Todo queda en el historial.
          </span>
        </p>
      )}

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Motivo <span className="font-normal text-[#667085]">(opcional; queda en el historial)</span></span>
        <input
          id="pdm-grupo-motivo"
          type="text"
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          maxLength={500}
          className="mt-1 w-full rounded-lg border border-[#DCE0E8] bg-white px-3 py-2.5 text-sm text-[#192031] outline-none focus:border-[#192031] focus:ring-1 focus:ring-[#192031]"
        />
      </label>
    </Dialogo>
  )
}
