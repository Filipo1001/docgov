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
 *   3. ¿Quiénes son las personas de la plataforma y cómo están de carga? Todos
 *      los usuarios de Contratista Digital, con su foto, su secretaría y su
 *      contrato: el contrato vencido junto a indicadores a su nombre es lo que
 *      más conviene ver.
 *
 * Es solo lectura, y a propósito no tiene botón de «Asignar» todavía: la pantalla
 * de asignación es el paso que sigue. Un botón que no hace nada es ruido.
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
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import type { Directorio, MotivoSinVincular, PersonaDirectorio } from '@/lib/pdm/personas'
import EncabezadoSeccion from './EncabezadoSeccion'
import { BarraEstados } from './Barras'
import { Avatar, LineaContrato } from './PersonaVista'

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

function FilaPersona({ p, conSeguimiento }: { p: PersonaDirectorio; conSeguimiento: boolean }) {
  const atencion = p.resumen ? p.resumen.atrasados + p.resumen.criticos : 0
  const enlace = p.indicadores > 0
  const contenido = (
    <>
      <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{p.nombre}</p>
        <p className="truncate text-xs text-gray-500">{p.secretaria ?? 'Sin secretaría'}</p>
        <LineaContrato contrato={p.contrato} />
        {p.excel && !coincideNombre(p.nombre, p.excel) && (
          <p className="text-[11px] text-gray-400">En el Excel figura como «{p.excel}»</p>
        )}
        {atencion > 0 && (
          <p className="mt-0.5 text-xs font-medium text-red-700">
            {atencion} {atencion === 1 ? 'atrasado o crítico' : 'atrasados o críticos'}
          </p>
        )}
      </div>
      {p.resumen && conSeguimiento && (
        <div className="hidden w-32 shrink-0 sm:block">
          <BarraEstados r={p.resumen} alto="h-2" />
        </div>
      )}
      <p className="w-16 shrink-0 text-right">
        {p.indicadores > 0 ? (
          <>
            <b className="block text-sm tabular-nums text-gray-900">{p.indicadores}</b>
            <span className="text-[11px] text-gray-500">{p.indicadores === 1 ? 'indicador' : 'indicadores'}</span>
          </>
        ) : (
          <span className="text-xs text-gray-400">Ninguno</span>
        )}
      </p>
      {enlace
        ? <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="shrink-0 text-gray-300" />
        : <span className="w-4 shrink-0" aria-hidden />}
    </>
  )
  const clase = 'flex items-center gap-3.5 py-3'
  return enlace ? (
    <Link
      href={hrefUsuario(p.id)}
      className={`${clase} transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none`}
    >
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  )
}

export default function ResponsablesPdm({ directorio, indicadores }: { directorio: Directorio; indicadores: Indicador[] }) {
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
    <div className="mx-auto max-w-7xl space-y-5">
      <EncabezadoSeccion titulo="Responsables" detalle="Quién responde por cada indicador, y dónde nadie responde." />

      {/* 1 · Los huecos (si no hay ninguno, no se pinta nada) */}
      {huerfanos.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-bold text-gray-900">Sin una persona que responda</h2>
            <p className="text-xs text-gray-500">
              <b className="tabular-nums text-red-600">{huerfanos.length}</b> de {indicadores.length} indicadores
            </p>
          </div>
          <p className="mt-1 text-xs text-gray-500">Nadie los tiene asignado todavía en la plataforma.</p>

          <ul className="mt-2 divide-y divide-gray-100">
            {porSecretaria.map(s => (
              <li key={s.dependencia}>
                <Link
                  href={`${HREF_INDICADORES}?dependencia=${encodeURIComponent(s.dependencia)}&filtro=sin_responsable`}
                  className="flex items-center gap-4 py-3 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-gray-900">{s.dependencia}</p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden>
                      <div className="h-full rounded-full bg-red-400" style={{ width: `${(100 * s.sin) / s.total}%` }} />
                    </div>
                  </div>
                  <p className="shrink-0 text-right text-xs text-gray-500">
                    <b className="text-sm tabular-nums text-gray-900">{s.sin}</b> de {s.total}
                  </p>
                  <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="shrink-0 text-gray-300" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!directorio.ok && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-0.5 shrink-0 text-amber-700" />
          <p className="text-sm text-amber-900">
            No se pudo leer la lista de usuarios de Contratista Digital. Recarga la página; si sigue igual, el resto del módulo funciona con los datos del archivo.
          </p>
        </div>
      )}

      {/* 2 · Figuran en el Excel y no tienen usuario */}
      {sinUsuario.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-bold text-gray-900">Figuran en el Excel y no tienen usuario</h2>
            <p className="text-xs text-gray-500">{sinUsuario.length} personas</p>
          </div>
          <ul className="mt-2 divide-y divide-gray-100">
            {sinUsuario.map(s => (
              <li key={s.nombre}>
                <Link
                  href={hrefOrigen(s.nombre)}
                  className="flex items-center gap-3.5 py-3 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
                >
                  <Avatar nombre={s.nombre} apagado />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{s.nombre}</p>
                    <p className="text-xs text-gray-500">{MOTIVO[s.motivo]}</p>
                  </div>
                  <p className="w-16 shrink-0 text-right">
                    <b className="block text-sm tabular-nums text-gray-900">{s.indicadores}</b>
                    <span className="text-[11px] text-gray-500">{s.indicadores === 1 ? 'indicador' : 'indicadores'}</span>
                  </p>
                  <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="shrink-0 text-gray-300" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 3 · Las personas de la plataforma */}
      {directorio.ok && (
        <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-bold text-gray-900">Personas</h2>
            <span className="text-xs text-gray-500">{personas.length} usuarios de Contratista Digital</span>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <label className="relative block flex-1">
              <span className="sr-only">Buscar persona</span>
              <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="pdm-persona"
                type="search"
                value={q}
                onChange={e => { setQ(e.target.value); setLimite(PAGINA) }}
                placeholder="Buscar persona"
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
              />
            </label>
            <select
              id="pdm-secretaria"
              aria-label="Secretaría"
              value={secretaria}
              onChange={e => { setSecretaria(e.target.value); setLimite(PAGINA) }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 sm:w-72"
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
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  filtro === f.k
                    ? 'border-[#192031] bg-[#192031] text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {f.rotulo} <span className="ml-1 tabular-nums opacity-70">{cuenta[f.k]}</span>
              </button>
            ))}
          </div>

          {visibles.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Nadie coincide con lo que buscas.</p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-gray-100">
                {visibles.slice(0, limite).map(p => (
                  <li key={p.id}><FilaPersona p={p} conSeguimiento={conSeguimiento} /></li>
                ))}
              </ul>
              {visibles.length > limite && (
                <button
                  onClick={() => setLimite(l => l + PAGINA)}
                  className="mx-auto mt-3 block rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Mostrar {Math.min(PAGINA, visibles.length - limite)} más · {visibles.length - limite} restantes
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
