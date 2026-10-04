'use client'

/**
 * Asignar indicadores: a una persona (como principal o como apoyo) o a un grupo.
 *
 * Sirve igual para uno que para cuarenta y nueve: quien lo abre le pasa la lista.
 * Todo lo que podría salir mal se dice ANTES de pulsar, no después:
 *
 *   · «Como apoyo» solo se puede si cada indicador ya tiene un principal; si no,
 *     el botón se apaga y se explica por qué (la base lo rechazaría de todos modos).
 *   · Un grupo solo trabaja en indicadores de SU secretaría. Sin líder entra como
 *     apoyo, así que también necesita que cada indicador ya tenga principal.
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
import BotonAccion, { Despliegue, useConfirmar } from './Movimiento'
import { T } from './tema'
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
  const { fase, correr, ocupado } = useConfirmar()
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
  const apoyoImposible = (modo === 'persona' && como === 'apoyo' && sinPrincipal > 0)
    || (modo === 'grupo' && grupo !== null && grupo.liderId === null && sinPrincipal > 0)

  const etiqueta = modo === 'persona' ? persona?.nombre ?? '' : grupo ? `${grupo.nombre} (grupo)` : ''
  const elegido = modo === 'persona' ? personaId !== null : grupo !== null
  const puede = elegido && !apoyoImposible && !ocupado

  async function asignar() {
    if (!puede) return
    setError(null)
    const uuids = indicadores.map(i => i.uuid)
    // El botón cuenta lo que pasa (asignando → asignado) y la ventana se despide después, no antes.
    await correr(
      () => modo === 'persona'
        ? acciones.asignarPersona({ indicadores: uuids, usuario: personaId!, principal: como === 'principal', anterior, motivo })
        : acciones.asignarGrupo({ indicadores: uuids, grupo: grupoId!, anterior, motivo }),
      { alTerminar: datos => onHecho(datos, etiqueta), alFallar: setError, quedarseHecho: true },
    )
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
        <div>
          <Despliegue abierto={!!error}>
            {error ? <p role="alert" className="text-sm font-medium text-[#B42318]">{error}</p> : null}
          </Despliegue>
          {/* El botón dice siempre lo mismo; a quién se asigna va en una línea propia. Con el nombre dentro del botón, elegir a
              alguien lo ensanchaba y «Cancelar» se corría hasta 170 px. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p aria-live="polite" className="min-w-0 flex-1 truncate text-xs text-[#667085]" title={etiqueta || undefined}>
              {etiqueta ? <>Se asignará a <b className="font-semibold text-[#192031]">{etiqueta}</b></> : 'Elige a quién asignar.'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button onClick={onCerrar} disabled={ocupado} className={T.accionSecundaria}>
                Cancelar
              </button>
              <BotonAccion
                id="pdm-asignar"
                fase={fase}
                inhabilitado={!puede}
                onClick={asignar}
                etiquetas={{ reposo: 'Asignar', trabajando: 'Asignando', hecho: 'Asignado' }}
              />
            </div>
          </div>
        </div>
      }
    >
      {/* Una persona o un grupo */}
      <div role="tablist" aria-label="A quién asignar" className="grid grid-cols-2 gap-1 rounded-lg bg-[#E6E9EF] p-1">
        {(['persona', 'grupo'] as const).map(m => (
          <button
            key={m}
            role="tab"
            aria-selected={modo === m}
            onClick={() => { setModo(m); setError(null) }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              modo === m ? 'bg-white text-[#192031] ring-1 ring-inset ring-[#DCE0E8]' : 'text-[#556072] hover:text-[#192031]'
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
            <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
            <input
              id="pdm-buscar-persona"
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar persona"
              className="w-full rounded-lg border border-[#DCE0E8] bg-white py-2.5 pl-10 pr-3 text-sm text-[#192031] placeholder-[#98A2B3] outline-none focus:border-[#192031] focus:ring-1 focus:ring-[#192031]"
            />
          </label>

          {unaSecretaria && !t && (
            <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[#667085]">
              <span>{todas ? 'Personas de todas las secretarías' : `Personas de ${unaSecretaria}`}</span>
              <button
                onClick={() => setTodas(v => !v)}
                className="font-semibold text-[#192031] underline-offset-2 hover:underline"
              >
                {todas ? `Solo ${unaSecretaria}` : 'Ver todas las secretarías'}
              </button>
            </p>
          )}

          {visibles.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#C5CBD6] px-4 py-8 text-center text-sm text-[#667085]">
              Nadie coincide con lo que buscas.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-[#E6E9EF] overflow-y-auto rounded-lg border border-[#DCE0E8]">
              {visibles.map(p => {
                const activo = p.id === personaId
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => { setPersonaId(p.id); setError(null) }}
                      aria-pressed={activo}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#192031] ${
                        activo ? 'bg-[#EDF0F5]' : 'hover:bg-[#F4F5F8]'
                      }`}
                    >
                      <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} tamano="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#192031]">{p.nombre}</span>
                        <span className="block truncate text-xs text-[#667085]">
                          {p.secretaria ?? 'Sin secretaría'}
                          {p.indicadores > 0 && ` · ${plural(p.indicadores, 'indicador', 'indicadores')}`}
                        </span>
                        <LineaContrato contrato={p.contrato} />
                      </span>
                      {/* El sitio del visto está siempre: si apareciera al elegir, el nombre se reajustaría. */}
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {activo && <Icono glifo={Iconos.estado.ok} tamano="sm" className="text-[#192031]" etiqueta="Elegida" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Los avisos que dependen de a quién se elige se DESPLIEGAN: aparecer de golpe movía 70 px lo que está debajo. */}
          <Despliegue abierto={!!persona && (persona.contrato.estado === 'vencido' || (persona.contrato.dias !== null && persona.contrato.dias <= 30 && persona.contrato.estado === 'en_fecha'))}>
            {persona && (persona.contrato.estado === 'vencido' || (persona.contrato.dias !== null && persona.contrato.dias <= 30 && persona.contrato.estado === 'en_fecha')) ? (
              <p role="status" className="flex items-start gap-2 rounded-lg border border-[#EBD9A8] bg-[#FBF6E7] px-3 py-2.5 text-xs leading-relaxed text-[#7A5410]">
                <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-0.5 shrink-0" />
                {persona.contrato.estado === 'vencido'
                  ? 'Su contrato ya terminó. Puedes asignarle de todos modos; conviene confirmar que sigue vinculado.'
                  : `Su contrato vence en ${plural(persona.contrato.dias ?? 0, 'día', 'días')}. Puedes asignarle de todos modos.`}
              </p>
            ) : null}
          </Despliegue>

          <Despliegue abierto={!!persona && persona.acceso === null && persona.rol !== 'admin'}>
            {persona && persona.acceso === null && persona.rol !== 'admin' ? (
              <p role="status" className="flex items-start gap-2 rounded-lg bg-[#E6E9EF] px-3 py-2.5 text-xs leading-relaxed text-[#2D3648]">
                <Icono glifo={Iconos.estado.informacion} tamano="sm" className="mt-0.5 shrink-0" />
                Esta persona aún no tiene acceso al módulo. Asignarle indicadores no se lo da: se habilita en Responsables.
              </p>
            ) : null}
          </Despliegue>

          <fieldset className="space-y-2">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Cómo participa</legend>
            {([
              ['principal', 'Responsable principal', 'Responde por el indicador y por su reporte.'],
              ['apoyo', 'Apoyo', 'Colabora; el principal sigue siendo quien es.'],
            ] as const).map(([valor, rotulo, ayuda]) => (
              <label key={valor} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#DCE0E8] px-3 py-2.5 has-[:checked]:border-[#192031] has-[:checked]:bg-[#F4F5F8]">
                <input
                  type="radio"
                  name="pdm-como"
                  checked={como === valor}
                  onChange={() => { setComo(valor); setError(null) }}
                  className="mt-0.5 h-4 w-4 accent-[#192031]"
                />
                <span className="text-sm text-[#192031]"><b className="font-semibold">{rotulo}</b><span className="block text-xs text-[#667085]">{ayuda}</span></span>
              </label>
            ))}
            <Despliegue abierto={apoyoImposible} separacion="">
              <p role="status" className="text-xs font-medium text-[#8A5A12]">
                {plural(sinPrincipal, 'indicador no tiene', 'indicadores no tienen')} responsable principal. Asígnalos primero a su responsable.
              </p>
            </Despliegue>
          </fieldset>
        </section>
      ) : (
        <section className="space-y-3">
          {!unaSecretaria ? (
            <p className="rounded-lg border border-dashed border-[#C5CBD6] px-4 py-8 text-center text-sm text-[#667085]">
              Un grupo solo trabaja en los indicadores de su secretaría. Selecciona indicadores de una sola secretaría para asignarlos a un grupo.
            </p>
          ) : gruposPosibles.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#C5CBD6] px-4 py-8 text-center text-sm text-[#667085]">
              {unaSecretaria} aún no tiene grupos. Se crean en la sección Responsables.
            </p>
          ) : (
            <ul className="divide-y divide-[#E6E9EF] rounded-lg border border-[#DCE0E8]">
              {gruposPosibles.map(g => {
                const activo = g.id === grupoId
                const lider = personas.find(p => p.id === g.liderId)
                return (
                  <li key={g.id}>
                    <button
                      onClick={() => { setGrupoId(g.id); setError(null) }}
                      aria-pressed={activo}
                      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#192031] ${
                        activo ? 'bg-[#EDF0F5]' : 'hover:bg-[#F4F5F8]'
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E6E9EF] text-[#556072]">
                        <Icono glifo={Iconos.navegacion.usuarios} tamano="sm" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#192031]">{g.nombre}</span>
                        <span className="block truncate text-xs text-[#667085]">
                          {g.liderId === null ? 'Sin líder: entra como apoyo' : `Líder: ${lider?.nombre ?? 'persona que ya no está activa'}`}
                          {' · '}{plural(g.miembros.length, 'persona', 'personas')}
                        </span>
                      </span>
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {activo && <Icono glifo={Iconos.estado.ok} tamano="sm" className="text-[#192031]" etiqueta="Elegido" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <Despliegue abierto={!!grupo}>
            {grupo ? (
              <p className="text-xs leading-relaxed text-[#667085]">
                {grupo.liderId === null
                  ? `Sin líder, ${plural(grupo.miembros.length, 'persona entra', 'personas entran')} como apoyo; el responsable principal de cada indicador no cambia.`
                  : `El líder queda como responsable principal${grupo.miembros.length <= 1 ? '.' : grupo.miembros.length === 2 ? ' y la otra persona, como apoyo.' : ` y las otras ${grupo.miembros.length - 1} personas, como apoyo.`}`}
                {' '}Si luego cambias a los miembros o al líder, estos indicadores se ponen al día solos.
              </p>
            ) : null}
          </Despliegue>
          <Despliegue abierto={apoyoImposible && modo === 'grupo'}>
            <p role="status" className="text-xs font-medium text-[#8A5A12]">
              {plural(sinPrincipal, 'indicador no tiene', 'indicadores no tienen')} responsable principal. Asígnalos primero a su responsable, o dale un líder al grupo.
            </p>
          </Despliegue>
        </section>
      )}

      {/* Qué hacer con el responsable anterior: solo si hay alguien a quien desplazar */}
      <Despliegue abierto={desplazados > 0} separacion="pb-5">
      {desplazados > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">
            {plural(desplazados, 'indicador ya tiene', 'indicadores ya tienen')} otro responsable principal
          </legend>
          {([
            ['apoyo', 'Dejarlo como apoyo', 'Sigue participando; no se pierde.'],
            ['quitar', 'Quitarlo', 'Deja de estar en el indicador. Queda en el historial.'],
          ] as const).map(([valor, rotulo, ayuda]) => (
            <label key={valor} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#DCE0E8] px-3 py-2.5 has-[:checked]:border-[#192031] has-[:checked]:bg-[#F4F5F8]">
              <input
                type="radio"
                name="pdm-anterior"
                checked={anterior === valor}
                onChange={() => setAnterior(valor)}
                className="mt-0.5 h-4 w-4 accent-[#192031]"
              />
              <span className="text-sm text-[#192031]"><b className="font-semibold">{rotulo}</b><span className="block text-xs text-[#667085]">{ayuda}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      </Despliegue>

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Motivo <span className="font-normal text-[#667085]">(opcional; queda en el historial)</span></span>
        <input
          id="pdm-motivo"
          type="text"
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          maxLength={MAX_MOTIVO}
          placeholder="Por ejemplo: acordado con la secretaria"
          className="mt-1 w-full rounded-lg border border-[#DCE0E8] bg-white px-3 py-2.5 text-sm text-[#192031] placeholder-[#98A2B3] outline-none focus:border-[#192031] focus:ring-1 focus:ring-[#192031]"
        />
      </label>
    </Dialogo>
  )
}
