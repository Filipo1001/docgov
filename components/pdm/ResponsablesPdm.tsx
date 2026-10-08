'use client'

/**
 * Responsables: quién responde por cada indicador, y dónde nadie responde.
 *
 * Tres preguntas del administrador, en el orden en que las hace, con lo que
 * hay que resolver primero arriba:
 *
 *   1. ¿Dónde están los huecos? Los indicadores que nadie tiene asignado en la
 *      plataforma no tienen a quién exigirle el reporte. Se ven por secretaría,
 *      y cada una lleva a su lista. (Un indicador que el Excel ponía a nombre de
 *      un equipo y que ya se asignó, al secretario por ejemplo, no es un hueco.)
 *   2. ¿Quién figura en el Excel y todavía no tiene usuario? Son los que no se
 *      pueden habilitar hasta que se les cree uno.
 *   3. ¿Qué grupos hay? Personas que responden juntas por varios indicadores,
 *      con un líder que responde por todos. Aquí se crean, se editan y se disuelven.
 *   4. ¿Quiénes son las personas de la plataforma y cómo están de carga? Todos
 *      los usuarios de Contratista Digital, con su foto, su secretaría y su
 *      contrato: el contrato vencido junto a indicadores a su nombre es lo que
 *      más conviene ver.
 *
 * Los grupos se pueden crear y editar aquí. Asignar indicadores a una persona o a un
 * grupo se hace desde Indicadores, que es donde se ven los indicadores.
 *
 * «Quién lleva qué» sale de las asignaciones de la base; lo que el Excel decía en
 * «Funcionario Responsable» se conserva aparte, para saber a qué equipo u oficina
 * hay que ponerle nombre.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  agrupar, coincideNombre, haySeguimiento, sinAsignar, type Indicador,
} from '@/lib/pdm/plan'
import {
  PARTES, cuentasPorPersona, distribucionDeCarga, textoDeParte, type CuentaDeAnio, type ParteDeReportes,
} from '@/lib/pdm/graficos'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import type { Directorio, MotivoSinVincular, PersonaDirectorio } from '@/lib/pdm/personas'
import Pagina from './Pagina'
import EncabezadoSeccion from './EncabezadoSeccion'
import { BarraEstados, BarraReportes, MarcadorDeParte } from './Barras'
import CargaPorPersona from './CargaPorPersona'
import ContinuidadResponsables from './ContinuidadResponsables'
import { Avatar, LineaContrato } from './PersonaVista'
import GruposPdm from './GruposPdm'
import AccesoPdm from './AccesoPdm'
import { ETIQUETA_NIVEL, gestiona, type NivelPdm } from '@/lib/pdm/niveles'
import { responsablesEnRiesgo } from '@/lib/pdm/continuidad'
import { ANIOS_PLAN } from '@/lib/pdm/seguimiento'
import { ACCIONES_REALES } from './acciones-reales'
import type { AccionesPdm } from '@/lib/pdm/acciones'

const MOTIVO: Record<MotivoSinVincular, string> = {
  planta: 'Personal de planta · aún sin usuario',
  pendiente: 'Pendiente de confirmar quién es',
  no_encontrado: 'Su usuario ya no existe',
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const PAGINA = 25

type Filtro = 'todos' | 'con' | 'sin' | 'vencido'

/** Los indicadores asignados a una persona de la plataforma. */
const hrefUsuario = (id: string) => `${HREF_INDICADORES}?usuario=${encodeURIComponent(id)}`
/** Los indicadores cuyo Excel nombraba a alguien que todavía no tiene usuario. */
const hrefOrigen = (nombre: string) => `${HREF_INDICADORES}?origen=${encodeURIComponent(nombre)}`

/** Lo que a una persona le toca hacer con sus reportes: lo devuelto, lo que espera validación y lo que falta. Lo aprobado no pide nada. */
const PARTES_DE_GESTION: readonly ParteDeReportes[] = PARTES.filter(p => p === 'devueltos' || p === 'porValidar' || p === 'faltan')

function FilaPersona({ p, conSeguimiento, gestion }: {
  p: PersonaDirectorio
  conSeguimiento: boolean
  /**
   * Sus reportes del año en curso (ver `cuentasPorPersona`). Con esto la fila habla de GESTIÓN, con hechos, en lugar de
   * los estados provisionales «atrasado / crítico»; sin esto, la fila es la de siempre. `null`: no tiene nada.
   */
  gestion?: CuentaDeAnio | null
}) {
  const conGestion = gestion !== undefined
  const atencion = !conGestion && p.resumen ? p.resumen.atrasados + p.resumen.criticos : 0
  const pendientes = gestion ? PARTES_DE_GESTION.filter(k => gestion[k] > 0) : []
  const enlace = p.indicadores > 0
  const palabra = p.indicadores === 1 ? 'indicador' : 'indicadores'
  const contenido = (
    <>
      <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} />
      <div className="min-w-0 flex-1">
        {/* 20 + 16 px de línea = los 36 px de la foto: la foto identifica exactamente estas dos líneas. */}
        <p className="truncate text-sm font-semibold leading-5 text-[#192031]" title={p.nombre}>{p.nombre}</p>
        <p className="truncate text-xs leading-4 text-[#667085]">{p.secretaria ?? 'Sin secretaría'}</p>
        {/* Teléfono: la cifra no tiene columna propia (le quitaba al nombre la mitad del ancho); es una línea más. */}
        <p className="text-xs leading-4 text-[#192031] sm:hidden">
          {p.indicadores > 0 ? <><b className="tabular-nums">{p.indicadores}</b> {palabra}</> : <span className="text-[#667085]">Sin indicadores</span>}
        </p>
        <LineaContrato contrato={p.contrato} />
        {p.acceso && (
          <p className="text-[11px] font-semibold text-[#192031]">Con acceso al módulo · {ETIQUETA_NIVEL[p.acceso.nivel]}</p>
        )}
        {p.excel && !coincideNombre(p.nombre, p.excel) && (
          <p className="text-[11px] text-[#667085]">En el Excel figura como «{p.excel}»</p>
        )}
        {atencion > 0 && (
          <p className="mt-0.5 text-xs font-medium text-[#B42318]">
            {atencion} {atencion === 1 ? 'atrasado o crítico' : 'atrasados o críticos'}
          </p>
        )}
        {pendientes.length > 0 && gestion && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-4 text-[#556072]">
            {pendientes.map(k => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <MarcadorDeParte parte={k} />
                <span className="tabular-nums">{textoDeParte(k, gestion[k])}</span>
              </span>
            ))}
          </p>
        )}
      </div>
      {/* Las columnas de datos se alinean con la línea del NOMBRE (20 px), no con el centro del bloque. */}
      {conGestion ? (
        <div className="mt-1.5 hidden w-32 shrink-0 sm:block">
          {gestion && gestion.conMeta > 0 && <BarraReportes c={gestion} alto="h-2" />}
        </div>
      ) : p.resumen && conSeguimiento && (
        <div className="mt-1.5 hidden w-32 shrink-0 sm:block">
          <BarraEstados r={p.resumen} alto="h-2" />
        </div>
      )}
      <p className="hidden w-16 shrink-0 text-right sm:block">
        {p.indicadores > 0 ? (
          <>
            <b className="block text-sm leading-5 tabular-nums text-[#192031]">{p.indicadores}</b>
            <span className="text-[11px] text-[#667085]">{palabra}</span>
          </>
        ) : (
          <span className="block text-xs leading-5 text-[#667085]">Ninguno</span>
        )}
      </p>
      <span className="flex h-5 w-4 shrink-0 items-center justify-center" aria-hidden={!enlace || undefined}>
        {enlace && <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="text-[#98A2B3]" />}
      </span>
    </>
  )
  const clase = 'flex items-start gap-3 py-3'
  return enlace ? (
    <Link
      href={hrefUsuario(p.id)}
      className={`${clase} transition-colors hover:bg-[#F4F5F8] focus-visible:bg-[#F7F8FA] focus-visible:outline-none`}
    >
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  )
}

export default function ResponsablesPdm({ directorio, indicadores, nivel, yoId, anioActual, acciones = ACCIONES_REALES }: {
  directorio: Directorio
  indicadores: Indicador[]
  /**
   * El año calendario. Con él el administrador ve la carga por persona y, en cada fila, cómo van sus reportes del año en
   * curso. Sin él (o para los demás niveles, por ahora) la pantalla es la de siempre.
   */
  anioActual?: number
  /** Qué puede hacer quien mira. */
  nivel: NivelPdm
  /** Quién mira. */
  yoId: string
  /** Lo que quien gestiona puede hacer. Por defecto, las acciones del servidor; las pruebas ponen un doble. */
  acciones?: AccionesPdm
}) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [secretaria, setSecretaria] = useState('')
  const [limite, setLimite] = useState(PAGINA)

  const conSeguimiento = useMemo(() => haySeguimiento(indicadores), [indicadores])
  const huerfanos = useMemo(() => indicadores.filter(sinAsignar), [indicadores])
  const porSecretaria = useMemo(() => {
    const total = new Map(agrupar(indicadores, i => i.dependencia).map(([d, l]) => [d, l.length]))
    return agrupar(huerfanos, i => i.dependencia).map(([d, l]) => ({ dependencia: d, sin: l.length, total: total.get(d) ?? l.length }))
  }, [huerfanos, indicadores])

  const { personas, sinUsuario } = directorio
  const conGraficos = nivel === 'admin' && anioActual !== undefined
  const gestionDe = useMemo(
    () => (conGraficos ? cuentasPorPersona(indicadores, anioActual, anioActual) : null),
    [conGraficos, indicadores, anioActual],
  )
  // Quién responde como principal sin contrato, o con uno que termina antes de que acabe el plan: solo para quien reparte.
  const enRiesgo = useMemo(
    () => (gestiona(nivel) && directorio.ok ? responsablesEnRiesgo(personas, indicadores, `${ANIOS_PLAN[ANIOS_PLAN.length - 1]}-12-31`) : []),
    [nivel, directorio.ok, personas, indicadores],
  )
  const carga = useMemo(() => (conGraficos ? distribucionDeCarga(personas.map(p => p.indicadores)) : null), [conGraficos, personas])
  const secretarias = useMemo(
    () => [...new Set(personas.map(p => p.secretaria).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'es')),
    [personas],
  )

  // Los conteos de los filtros se calculan sobre la secretaría elegida, como en la lista de indicadores.
  const delAlcance = useMemo(
    () => (secretaria ? personas.filter(p => p.secretaria === secretaria) : personas),
    [personas, secretaria],
  )
  const cuenta = useMemo(() => ({
    todos: delAlcance.length,
    con: delAlcance.filter(p => p.indicadores > 0).length,
    sin: delAlcance.filter(p => p.indicadores === 0).length,
    vencido: delAlcance.filter(p => p.contrato.estado === 'vencido').length,
  }), [delAlcance])

  const t = sinTildes(q.trim())
  const visibles = useMemo(() => delAlcance.filter(p => {
    if (filtro === 'con' && p.indicadores === 0) return false
    if (filtro === 'sin' && p.indicadores > 0) return false
    if (filtro === 'vencido' && p.contrato.estado !== 'vencido') return false
    return !t || sinTildes(p.nombre).includes(t)
  }), [delAlcance, filtro, t])

  const filtros: { k: Filtro; rotulo: string }[] = [
    { k: 'todos', rotulo: 'Todos' },
    { k: 'con', rotulo: 'Con indicadores' },
    { k: 'sin', rotulo: 'Sin indicadores' },
    { k: 'vencido', rotulo: 'Contrato vencido' },
  ]

  return (
    <Pagina>
      <EncabezadoSeccion
        titulo="Responsables"
        detalle="Quién responde por cada indicador, y dónde nadie responde."
        datos={[
          { rotulo: 'Personas', valor: String(directorio.personas.length) },
          { rotulo: 'Con indicadores', valor: String(directorio.personas.filter(p => p.indicadores > 0).length) },
          { rotulo: 'Grupos', valor: String(directorio.grupos.length) },
        ]}
      />

      {/* 1 · Los huecos (si no hay ninguno, no se pinta nada) */}
      {huerfanos.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-[#DCE0E8] bg-white px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 -mx-4 -mt-4 mb-3 border-b border-[#E6E9EF] px-4 py-3 sm:-mx-5 sm:px-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Sin una persona que responda</h2>
            <p className="text-xs text-[#667085]">
              <b className="tabular-nums text-[#B42318]">{huerfanos.length}</b> de {indicadores.length} indicadores
            </p>
          </div>
          <p className="mt-1 text-xs text-[#667085]">Nadie los tiene asignado todavía en la plataforma.</p>

          <ul className="mt-2 divide-y divide-[#E6E9EF]">
            {porSecretaria.map(s => (
              <li key={s.dependencia}>
                <Link
                  href={`${HREF_INDICADORES}?dependencia=${encodeURIComponent(s.dependencia)}&filtro=sin_responsable`}
                  className="flex items-center gap-4 py-3 transition-colors hover:bg-[#F4F5F8] focus-visible:bg-[#F7F8FA] focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-[#192031]">{s.dependencia}</p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-[3px] bg-[#E6E9EF]" aria-hidden>
                      <div className="h-full bg-[#B42318]" style={{ width: `${(100 * s.sin) / s.total}%` }} />
                    </div>
                  </div>
                  <p className="shrink-0 text-right text-xs text-[#667085]">
                    <b className="text-sm tabular-nums text-[#192031]">{s.sin}</b> de {s.total}
                  </p>
                  <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="shrink-0 text-[#98A2B3]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 1b · Quién deja de responder cuando termine su contrato */}
      <ContinuidadResponsables lista={enRiesgo} />

      {!directorio.ok && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#EBD9A8] bg-[#FBF6E7] px-4 py-3">
          <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-0.5 shrink-0 text-[#8A5A12]" />
          <p className="text-sm text-[#7A5410]">
            No se pudo leer la lista de usuarios de Contratista Digital. Recarga la página; si sigue igual, el resto del módulo funciona con los datos del archivo.
          </p>
        </div>
      )}

      {/* 2 · Figuran en el Excel y no tienen usuario */}
      {sinUsuario.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-[#DCE0E8] bg-white px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 -mx-4 -mt-4 mb-3 border-b border-[#E6E9EF] px-4 py-3 sm:-mx-5 sm:px-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Figuran en el Excel y no tienen usuario</h2>
            <p className="text-xs text-[#667085]">{sinUsuario.length} personas</p>
          </div>
          <ul className="mt-2 divide-y divide-[#E6E9EF]">
            {sinUsuario.map(s => (
              <li key={s.nombre}>
                <Link
                  href={hrefOrigen(s.nombre)}
                  className="flex items-start gap-3 py-3 transition-colors hover:bg-[#F4F5F8] focus-visible:bg-[#F7F8FA] focus-visible:outline-none"
                >
                  <Avatar nombre={s.nombre} apagado />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-5 text-[#192031]">{s.nombre}</p>
                    <p className="text-xs leading-4 text-[#667085]">{MOTIVO[s.motivo]}</p>
                    <p className="text-xs leading-4 text-[#192031] sm:hidden"><b className="tabular-nums">{s.indicadores}</b> {s.indicadores === 1 ? 'indicador' : 'indicadores'}</p>
                  </div>
                  <p className="hidden w-16 shrink-0 text-right sm:block">
                    <b className="block text-sm leading-5 tabular-nums text-[#192031]">{s.indicadores}</b>
                    <span className="text-[11px] text-[#667085]">{s.indicadores === 1 ? 'indicador' : 'indicadores'}</span>
                  </p>
                  <span className="flex h-5 w-4 shrink-0 items-center justify-center">
                    <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="text-[#98A2B3]" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 3 · Los grupos */}
      {directorio.ok && (
        <GruposPdm
          grupos={directorio.grupos}
          personas={directorio.personas}
          secretarias={directorio.secretarias}
          acciones={acciones}
          puedeGestionar={gestiona(nivel)}
        />
      )}

      {/* 3b · Quién entra al módulo */}
      {directorio.ok && <AccesoPdm personas={directorio.personas} nivel={nivel} yoId={yoId} acciones={acciones} />}

      {/* 3c · Cómo está repartido el trabajo */}
      {directorio.ok && carga && <CargaPorPersona d={carga} />}

      {/* 4 · Las personas de la plataforma */}
      {directorio.ok && (
        <section className="overflow-hidden rounded-lg border border-[#DCE0E8] bg-white px-4 py-4 sm:px-5">
          <div className="flex items-baseline gap-3 -mx-4 -mt-4 mb-3 border-b border-[#E6E9EF] px-4 py-3 sm:-mx-5 sm:px-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Personas</h2>
            <span className="text-xs text-[#667085]">
              {conGraficos ? `${personas.length} usuarios · reportes de ${anioActual}` : `${personas.length} usuarios de Contratista Digital`}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <label className="relative block flex-1">
              <span className="sr-only">Buscar persona</span>
              <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
              <input
                id="pdm-persona"
                type="search"
                value={q}
                onChange={e => { setQ(e.target.value); setLimite(PAGINA) }}
                placeholder="Buscar persona"
                className="w-full rounded-lg border border-[#DCE0E8] bg-white py-2 pl-10 pr-3 text-sm text-[#192031] placeholder-[#667085] outline-none focus:border-[#192031] focus:ring-1 focus:ring-[#192031]"
              />
            </label>
            <select
              id="pdm-secretaria"
              aria-label="Secretaría"
              value={secretaria}
              onChange={e => { setSecretaria(e.target.value); setLimite(PAGINA) }}
              className="rounded-lg border border-[#DCE0E8] bg-white px-3 py-2 text-sm text-[#192031] outline-none focus:border-[#192031] focus:ring-1 focus:ring-[#192031] sm:w-72"
            >
              <option value="">Todas las secretarías</option>
              {secretarias.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {filtros.map(f => (
              <button
                key={f.k}
                onClick={() => { setFiltro(f.k); setLimite(PAGINA) }}
                aria-pressed={filtro === f.k}
                className={`shrink-0 rounded-md border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  filtro === f.k
                    ? 'border-[#192031] bg-[#192031] text-white'
                    : 'border-[#DCE0E8] bg-white text-[#556072] hover:border-[#C5CBD6]'
                }`}
              >
                {f.rotulo} <span className="ml-1 tabular-nums opacity-70">{cuenta[f.k]}</span>
              </button>
            ))}
          </div>

          {visibles.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#667085]">Nadie coincide con lo que buscas.</p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-[#E6E9EF]">
                {visibles.slice(0, limite).map(p => (
                  <li key={p.id}><FilaPersona p={p} conSeguimiento={conSeguimiento} gestion={gestionDe ? gestionDe.get(p.id) ?? null : undefined} /></li>
                ))}
              </ul>
              {visibles.length > limite && (
                <button
                  onClick={() => setLimite(l => l + PAGINA)}
                  className="mx-auto mt-3 block rounded-lg border border-[#DCE0E8] bg-white px-5 py-2.5 text-sm font-semibold text-[#2D3648] transition-colors hover:bg-[#F4F5F8]"
                >
                  Mostrar {Math.min(PAGINA, visibles.length - limite)} más · {visibles.length - limite} restantes
                </button>
              )}
            </>
          )}
        </section>
      )}
    </Pagina>
  )
}
