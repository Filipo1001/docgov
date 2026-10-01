'use client'

/**
 * Asignar indicadores: a una persona (como principal o como apoyo) o a un grupo.
 *
 * Sirve igual para uno que para cuarenta y nueve: quien lo abre le pasa la lista.
 * Todo lo que podría salir mal se dice ANTES de pulsar, no después:
 *
 *   · «Como apoyo» solo se puede si cada indicador ya tiene un principal; si no,
 *     el botón se apaga y se explica por qué (la base lo rechazaría de todos modos).
 *   · Un grupo solo trabaja en indicadores de SU secretaría y necesita un líder.
 *   · Si algún indicador ya tiene otro responsable principal, se pregunta qué hacer
 *     con él: dejarlo de apoyo (lo normal) o quitarlo. Si ninguno lo tiene, la
 *     pregunta no aparece.
 *   · Un contrato vencido o por vencer se AVISA, no se bloquea: la decisión es del
 *     administrador, que tiene al secretario al lado.
 *
 * La bitácora no se llena aquí: la escribe la base, y lo que se ponga en «Motivo»
 * viaja con cada cambio.
 */

import { useMemo, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { principalDe } from '@/lib/pdm/asignados'
import { sinTildes } from '@/lib/pdm/texto'
import { MAX_MOTIVO, type AccionesPdm, type Anterior, type ResumenCambio } from '@/lib/pdm/acciones'
import type { Indicador } from '@/lib/pdm/plan'
import type { GrupoVista, PersonaDirectorio } from '@/lib/pdm/personas'
import Dialogo from './Dialogo'
import { Avatar, LineaContrato } from './PersonaVista'

type Modo = 'persona' | 'grupo'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export default function SelectorAsignacion({ indicadores, personas, grupos, acciones, onCerrar, onHecho }: {
  indicadores: Indicador[]
  personas: PersonaDirectorio[]
  grupos: GrupoVista[]
  acciones: AccionesPdm
  onCerrar: () => void
  onHecho: (resumen: ResumenCambio, etiqueta: string) => void
}) {
  const secretarias = useMemo(() => [...new Set(indicadores.map(i => i.dependencia))], [indicadores])
  const unaSecretaria = secretarias.length === 1 ? secretarias[0] : null

  const [modo, setModo] = useState<Modo>('persona')
  const [q, setQ] = useState('')
  const [todas, setTodas] = useState(false)
  const [personaId, setPersonaId] = useState<string | null>(null)
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [como, setComo] = useState<'principal' | 'apoyo'>('principal')
  const [anterior, setAnterior] = useState<Anterior>('apoyo')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const t = sinTildes(q.trim())
  const visibles = useMemo(() => {
    // Con algo escrito se busca en todas las secretarías: a quien se busca por nombre no se le pone aduana.
    const filtrar = !t && !todas && unaSecretaria !== null
    return personas.filter(p => (!filtrar || p.secretaria === unaSecretaria) && (!t || sinTildes(p.nombre).includes(t)))
  }, [personas, t, todas, unaSecretaria])

  const persona = personas.find(p => p.id === personaId) ?? null
  const grupo = grupos.find(g => g.id === grupoId) ?? null
  const gruposPosibles = useMemo(
    () => (unaSecretaria ? grupos.filter(g => g.secretaria === unaSecretaria) : []),
    [grupos, unaSecretaria],
  )

  // Quién sería el principal después, para saber a cuántos indicadores se les cambia el principal.
  const principalNuevo = modo === 'persona' ? (como === 'principal' ? personaId : null) : grupo?.liderId ?? null
  const desplazados = useMemo(() => {
    if (!principalNuevo) return 0
    const ajenos = modo === 'grupo' && grupo ? new Set(grupo.miembros) : new Set<string>([principalNuevo])
    // Los que ya son del grupo pasan a apoyo sin preguntar; solo se pregunta por quien es ajeno.
    return indicadores.filter(i => { const p = principalDe(i); return p !== null && !ajenos.has(p) }).length
  }, [indicadores, principalNuevo, modo, grupo])

  const sinPrincipal = indicadores.filter(i => principalDe(i) === null).length
  const apoyoImposible = modo === 'persona' && como === 'apoyo' && sinPrincipal > 0

  const etiqueta = modo === 'persona' ? persona?.nombre ?? '' : grupo ? `${grupo.nombre} (grupo)` : ''
  const elegido = modo === 'persona' ? personaId !== null : grupo !== null && grupo.liderId !== null
  const puede = elegido && !apoyoImposible && !enviando

  async function asignar() {
    if (!puede) return
    setEnviando(true)
    setError(null)
    const uuids = indicadores.map(i => i.uuid)
    const r = modo === 'persona'
      ? await acciones.asignarPersona({ indicadores: uuids, usuario: personaId!, principal: como === 'principal', anterior, motivo })
      : await acciones.asignarGrupo({ indicadores: uuids, grupo: grupoId!, anterior, motivo })
    setEnviando(false)
    if (!r.ok) { setError(r.error); return }
    onHecho(r.datos, etiqueta)
  }

  const titulo = `Asignar ${plural(indicadores.length, 'indicador', 'indicadores')}`
  const subtitulo = indicadores.length === 1
    ? indicadores[0].indicador
    : unaSecretaria ?? `De ${plural(secretarias.length, 'secretaría', 'secretarías')}`

  return (
    <Dialogo
      titulo={titulo}
      subtitulo={subtitulo}
      onCerrar={onCerrar}
      pie={
        <div className="space-y-3">
          {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={onCerrar}
              className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              id="pdm-asignar"
              onClick={asignar}
              disabled={!puede}
              className="rounded-xl bg-[#192031] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#242F45] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviando ? 'Asignando…' : etiqueta ? `Asignar a ${etiqueta}` : 'Asignar'}
            </button>
          </div>
        </div>
      }
    >
      {/* Una persona o un grupo */}
      <div role="tablist" aria-label="A quién asignar" className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
        {(['persona', 'grupo'] as const).map(m => (
          <button
            key={m}
            role="tab"
            aria-selected={modo === m}
            onClick={() => { setModo(m); setError(null) }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              modo === m ? 'bg-white text-[#192031] shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {m === 'persona' ? 'Una persona' : 'Un grupo'}
          </button>
        ))}
      </div>

      {modo === 'persona' ? (
        <section className="space-y-3">
          <label className="relative block">
            <span className="sr-only">Buscar persona</span>
            <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="pdm-buscar-persona"
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar persona"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            />
          </label>

          {unaSecretaria && !t && (
            <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-gray-500">
              <span>{todas ? 'Personas de todas las secretarías' : `Personas de ${unaSecretaria}`}</span>
              <button
                onClick={() => setTodas(v => !v)}
                className="font-semibold text-teal-700 underline-offset-2 hover:underline"
              >
                {todas ? `Solo ${unaSecretaria}` : 'Ver todas las secretarías'}
              </button>
            </p>
          )}

          {visibles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              Nadie coincide con lo que buscas.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
              {visibles.map(p => {
                const activo = p.id === personaId
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => { setPersonaId(p.id); setError(null) }}
                      aria-pressed={activo}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400 ${
                        activo ? 'bg-teal-50' : 'hover:bg-gray-50'
                      }`}
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
                      {activo && <Icono glifo={Iconos.estado.ok} tamano="sm" className="shrink-0 text-teal-700" etiqueta="Elegida" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {persona && (persona.contrato.estado === 'vencido' || (persona.contrato.dias !== null && persona.contrato.dias <= 30 && persona.contrato.estado === 'en_fecha')) && (
            <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
              <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-0.5 shrink-0" />
              {persona.contrato.estado === 'vencido'
                ? 'Su contrato ya terminó. Puedes asignarle de todos modos; conviene confirmar que sigue vinculado.'
                : `Su contrato vence en ${plural(persona.contrato.dias ?? 0, 'día', 'días')}. Puedes asignarle de todos modos.`}
            </p>
          )}

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-gray-600">Cómo participa</legend>
            {([
              ['principal', 'Responsable principal', 'Responde por el indicador y por su reporte.'],
              ['apoyo', 'Apoyo', 'Colabora; el principal sigue siendo quien es.'],
            ] as const).map(([valor, rotulo, ayuda]) => (
              <label key={valor} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 px-3 py-2.5 has-[:checked]:border-teal-300 has-[:checked]:bg-teal-50/60">
                <input
                  type="radio"
                  name="pdm-como"
                  checked={como === valor}
                  onChange={() => { setComo(valor); setError(null) }}
                  className="mt-0.5 h-4 w-4 accent-teal-700"
                />
                <span className="text-sm text-gray-900"><b className="font-semibold">{rotulo}</b><span className="block text-xs text-gray-500">{ayuda}</span></span>
              </label>
            ))}
            {apoyoImposible && (
              <p role="status" className="text-xs font-medium text-amber-800">
                {plural(sinPrincipal, 'indicador no tiene', 'indicadores no tienen')} responsable principal. Asígnalos primero a su responsable.
              </p>
            )}
          </fieldset>
        </section>
      ) : (
        <section className="space-y-3">
          {!unaSecretaria ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              Un grupo solo trabaja en los indicadores de su secretaría. Selecciona indicadores de una sola secretaría para asignarlos a un grupo.
            </p>
          ) : gruposPosibles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              {unaSecretaria} aún no tiene grupos. Se crean en la sección Responsables.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {gruposPosibles.map(g => {
                const activo = g.id === grupoId
                const lider = personas.find(p => p.id === g.liderId)
                const sinLider = g.liderId === null
                return (
                  <li key={g.id}>
                    <button
                      onClick={() => { if (!sinLider) { setGrupoId(g.id); setError(null) } }}
                      disabled={sinLider}
                      aria-pressed={activo}
                      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60 ${
                        activo ? 'bg-teal-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                        <Icono glifo={Iconos.navegacion.usuarios} tamano="sm" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-gray-900">{g.nombre}</span>
                        <span className="block truncate text-xs text-gray-500">
                          {sinLider ? 'Sin líder: asígnale uno en Responsables' : `Líder: ${lider?.nombre ?? 'persona que ya no está activa'}`}
                          {' · '}{plural(g.miembros.length, 'persona', 'personas')}
                        </span>
                      </span>
                      {activo && <Icono glifo={Iconos.estado.ok} tamano="sm" className="shrink-0 text-teal-700" etiqueta="Elegido" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {grupo && (
            <p className="text-xs leading-relaxed text-gray-500">
              El líder queda como responsable principal
              {grupo.miembros.length <= 1 ? '.' : grupo.miembros.length === 2 ? ' y la otra persona, como apoyo.' : ` y las otras ${grupo.miembros.length - 1} personas, como apoyo.`}
              {' '}Si luego cambias a los miembros o al líder, estos indicadores se ponen al día solos.
            </p>
          )}
        </section>
      )}

      {/* Qué hacer con el responsable anterior: solo si hay alguien a quien desplazar */}
      {desplazados > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-gray-600">
            {plural(desplazados, 'indicador ya tiene', 'indicadores ya tienen')} otro responsable principal
          </legend>
          {([
            ['apoyo', 'Dejarlo como apoyo', 'Sigue participando; no se pierde.'],
            ['quitar', 'Quitarlo', 'Deja de estar en el indicador. Queda en el historial.'],
          ] as const).map(([valor, rotulo, ayuda]) => (
            <label key={valor} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 px-3 py-2.5 has-[:checked]:border-teal-300 has-[:checked]:bg-teal-50/60">
              <input
                type="radio"
                name="pdm-anterior"
                checked={anterior === valor}
                onChange={() => setAnterior(valor)}
                className="mt-0.5 h-4 w-4 accent-teal-700"
              />
              <span className="text-sm text-gray-900"><b className="font-semibold">{rotulo}</b><span className="block text-xs text-gray-500">{ayuda}</span></span>
            </label>
          ))}
        </fieldset>
      )}

      <label className="block">
        <span className="text-xs font-semibold text-gray-600">Motivo <span className="font-normal text-gray-500">(opcional; queda en el historial)</span></span>
        <input
          id="pdm-motivo"
          type="text"
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          maxLength={MAX_MOTIVO}
          placeholder="Por ejemplo: acordado con la secretaria"
          className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
        />
      </label>
    </Dialogo>
  )
}
