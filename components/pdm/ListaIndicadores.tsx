'use client'

/**
 * La lista de indicadores, en tarjetas y no en tabla.
 *
 * El archivo original es una hoja de 258 columnas: imposible de leer en un
 * teléfono, y los responsables de indicadores son sobre todo contratistas que
 * trabajan desde uno. Cada tarjeta dice lo que importa para decidir si hay que
 * abrirla: qué se mide, contra qué meta, cómo va, en qué punto del corte está y a
 * nombre de quién.
 */

import { useMemo, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  ESTADOS, agrupar, estadoDe, fmt, fmtRazon, razon, rotuloMeta, sinAsignar, tipoResponsable, type Indicador,
} from '@/lib/pdm/plan'
import { SITUACIONES } from '@/lib/pdm/seguimiento'
import { BarraAvance } from './Barras'
import { FILTROS_DE_CORTE, cumpleFiltro, type Filtro } from '@/lib/pdm/filtros'
import type { PersonaFicha } from '@/lib/pdm/personas'

const PAGINA = 25

export function TarjetaIndicador({ i, onAbrir, asignado, seleccionable, elegido }: {
  i: Indicador
  onAbrir: () => void
  /** En modo de selección la tarjeta se marca en vez de abrirse. */
  seleccionable?: boolean
  elegido?: boolean
  /** Nombre de la persona asignada en la plataforma; sin él se muestra lo que decía el Excel. */
  asignado?: string
}) {
  const estado = estadoDe(i)
  const r = razon(i)
  const huerfano = sinAsignar(i)
  const corte = i.enCorte
  const reporte = corte?.reporte ?? null
  return (
    <button
      onClick={onAbrir}
      aria-pressed={seleccionable ? elegido === true : undefined}
      className={`block w-full rounded-2xl border bg-white p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ${
        elegido ? 'border-teal-600 ring-1 ring-teal-600' : 'border-gray-200'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {seleccionable && (
          <span
            aria-hidden
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${elegido ? 'border-teal-700 bg-teal-700 text-white' : 'border-gray-300 bg-white'}`}
          >
            {elegido && <Icono glifo={Iconos.estado.ok} tamano="sm" className="h-3.5 w-3.5" />}
          </span>
        )}
        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600">{i.codigo}</span>
        {/* «Sin avance validado» sobra cuando el chip del corte ya dice en qué punto va el reporte. */}
        {(estado !== 'sin_reporte' || !corte) && (
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ESTADOS[estado].chip}`}>
            {ESTADOS[estado].rotulo}
          </span>
        )}
        {corte && (
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${SITUACIONES[corte.situacion].chip}`}>
            {SITUACIONES[corte.situacion].rotulo}
          </span>
        )}
      </div>

      <p className="mt-2.5 text-sm font-semibold leading-snug text-gray-900">{i.indicador}</p>
      <p className="mt-1 text-xs leading-snug text-gray-500">{i.programa}</p>

      <div className="mt-3.5">
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
          <span className="text-gray-500">
            Avance <b className="tabular-nums text-gray-900">{fmt(i.avance)}</b>
            <span className="text-gray-400"> de </span>
            <b className="tabular-nums text-gray-900">{fmt(i.metaMedida)}</b>
            <span className="text-gray-400"> · {rotuloMeta(i)}</span>
          </span>
          {r !== null && <span className="font-semibold tabular-nums text-gray-700">{fmtRazon(r, i.criterio !== null)}</span>}
        </div>
        <BarraAvance razon={r} estado={estado} />
        {reporte && corte?.situacion === 'pendiente' && (
          <p className="mt-1.5 truncate text-xs text-amber-800">
            {reporte.autorNombre} reportó <b className="tabular-nums">{fmt(reporte.valor)}</b>; falta que la secretaría lo valide
          </p>
        )}
        {reporte && corte?.situacion === 'devuelto' && (
          <p className="mt-1.5 truncate text-xs text-red-700">
            Devuelto{reporte.validacionComentario ? `: ${reporte.validacionComentario}` : ''}
          </p>
        )}
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3 text-xs">
        <span className={`inline-flex min-w-0 items-center gap-1.5 ${huerfano ? 'font-medium text-red-700' : 'text-gray-600'}`}>
          <Icono glifo={huerfano ? Iconos.estado.advertencia : Iconos.navegacion.usuarios} tamano="sm" className="shrink-0" />
          <span className="truncate">
            {huerfano
              ? (tipoResponsable(i.responsable) === 'persona' ? `${i.responsable} · sin usuario` : 'Sin responsable')
              : (asignado ?? i.responsable)}
          </span>
        </span>
        <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="shrink-0 text-gray-300" />
      </div>
    </button>
  )
}

/** El modo de selección por lotes: lo gobierna quien monta la lista; la lista sabe qué está visible. */
export interface SeleccionLista {
  activa: boolean
  elegidos: ReadonlySet<number>
  onActiva: (activa: boolean) => void
  onAlternar: (id: number) => void
  /** Reemplaza la selección por estos (los visibles, o ninguno). */
  onReemplazar: (ids: number[]) => void
}

const ROTULO_FILTRO: Record<Filtro, string> = {
  todos: 'Todos',
  sin_responsable: 'Sin responsable',
  atencion: 'Atrasados y críticos',
  sin_reporte: 'Sin avance validado',
  por_reportar: 'Por reportar',
  por_validar: 'Sin validar',
}

export default function ListaIndicadores({
  lista, onAbrir, dependencia, onDependencia, filtroInicial, fichas, seleccion,
}: {
  lista: Indicador[]
  onAbrir: (id: number) => void
  /** Si viene, se muestra el selector de secretaría (alcalde y Control Interno). */
  dependencia?: string
  onDependencia?: (d: string) => void
  /** Desde dónde se llegó: un enlace de otra sección puede pedir la lista ya filtrada. */
  filtroInicial?: Filtro
  /** Quién es el responsable de cada indicador en la plataforma, por `id`. */
  fichas?: Record<number, PersonaFicha>
  seleccion?: SeleccionLista
}) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial ?? 'todos')
  const [limite, setLimite] = useState(PAGINA)

  // Las secretarías del selector son las de la lista que se recibe: ya no hay un catálogo fijo en el código.
  const dependencias = useMemo(() => agrupar(lista, i => i.dependencia).map(([n]) => n), [lista])

  const delAlcance = useMemo(
    () => (dependencia ? lista.filter(i => i.dependencia === dependencia) : lista),
    [lista, dependencia],
  )

  // Los filtros del corte solo se ofrecen si hay un corte abierto (si no, no hay nada que filtrar).
  const hayCorte = useMemo(() => lista.some(i => i.enCorte !== null), [lista])
  const filtros = useMemo(
    () => (Object.keys(ROTULO_FILTRO) as Filtro[]).filter(f => hayCorte || !FILTROS_DE_CORTE.includes(f)),
    [hayCorte],
  )
  // Un enlace puede pedir un filtro del corte cuando ya no hay corte: se ignora y sale la lista completa.
  const filtroActivo: Filtro = filtros.includes(filtro) ? filtro : 'todos'

  const cuenta = useMemo(() => {
    const c = Object.fromEntries(filtros.map(f => [f, 0])) as Record<Filtro, number>
    for (const i of delAlcance) for (const f of filtros) if (cumpleFiltro(i, f)) c[f]++
    return c
  }, [delAlcance, filtros])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return delAlcance.filter(i => {
      if (!cumpleFiltro(i, filtroActivo)) return false
      if (!t) return true
      return [i.indicador, i.producto, i.programa, i.responsable, i.codigo].some(x => x.toLowerCase().includes(t))
    })
  }, [delAlcance, q, filtroActivo])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block flex-1">
          <span className="sr-only">Buscar indicador</span>
          <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="pdm-busqueda"
            type="search"
            value={q}
            onChange={e => { setQ(e.target.value); setLimite(PAGINA) }}
            placeholder="Buscar indicador o responsable"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
          />
        </label>
        {onDependencia && (
          <select
            id="pdm-dependencia"
            aria-label="Secretaría"
            value={dependencia ?? ''}
            onChange={e => { onDependencia(e.target.value); setLimite(PAGINA) }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 sm:w-72"
          >
            <option value="">Todas las secretarías</option>
            {dependencias.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {filtros.map(f => (
          <button
            key={f}
            onClick={() => { setFiltro(f); setLimite(PAGINA) }}
            aria-pressed={filtroActivo === f}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              filtroActivo === f
                ? 'border-[#192031] bg-[#192031] text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            {ROTULO_FILTRO[f]} <span className="ml-1 tabular-nums opacity-70">{cuenta[f]}</span>
          </button>
        ))}
      </div>

      {seleccion && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="pdm-seleccionar"
            onClick={() => seleccion.onActiva(!seleccion.activa)}
            aria-pressed={seleccion.activa}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              seleccion.activa
                ? 'border-teal-700 bg-teal-50 text-teal-800'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            {seleccion.activa ? 'Terminar selección' : 'Seleccionar varios'}
          </button>
          {seleccion.activa && visibles.length > 0 && (
            <button
              id="pdm-seleccionar-visibles"
              onClick={() => seleccion.onReemplazar(visibles.map(i => i.id))}
              className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-gray-300"
            >
              Seleccionar los {visibles.length} visibles
            </button>
          )}
          {seleccion.activa && seleccion.elegidos.size > 0 && (
            <button
              onClick={() => seleccion.onReemplazar([])}
              className="px-2 py-1.5 text-xs font-semibold text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
            >
              Quitar la selección
            </button>
          )}
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-700">Ningún indicador coincide con lo que buscas.</p>
          <p className="mt-1 text-xs text-gray-500">Prueba con otra palabra o quita el filtro.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {visibles.slice(0, limite).map(i => (
              <TarjetaIndicador
                key={i.id}
                i={i}
                onAbrir={seleccion?.activa ? () => seleccion.onAlternar(i.id) : () => onAbrir(i.id)}
                seleccionable={seleccion?.activa}
                elegido={seleccion?.activa ? seleccion.elegidos.has(i.id) : undefined}
                asignado={(() => { const f = fichas?.[i.id]; return f && 'nombre' in f ? f.nombre : undefined })()}
              />
            ))}
          </div>
          {visibles.length > limite && (
            <button
              onClick={() => setLimite(l => l + PAGINA)}
              className="mx-auto block rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Mostrar {Math.min(PAGINA, visibles.length - limite)} más · {visibles.length - limite} restantes
            </button>
          )}
        </>
      )}
    </div>
  )
}
