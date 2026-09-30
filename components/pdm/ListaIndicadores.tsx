'use client'

/**
 * La lista de indicadores, en tarjetas y no en tabla.
 *
 * El archivo original es una hoja de 258 columnas: imposible de leer en un
 * teléfono, y los responsables de indicadores son sobre todo contratistas que
 * trabajan desde uno. Cada tarjeta dice lo que importa para decidir si hay que
 * abrirla: qué se mide, contra qué meta, cómo va y a nombre de quién está.
 */

import { useMemo, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  ESTADOS, ROTULO_RESPONSABLE, DEPENDENCIAS, estadoDe, fmt, fmtRazon, razon,
  sinResponsableUnico, tipoResponsable, type Indicador,
} from '@/lib/pdm/plan'
import { BarraAvance } from './Barras'
import type { Filtro } from '@/lib/pdm/filtros'

const PAGINA = 25

export function TarjetaIndicador({ i, reportado, onAbrir, conBoton }: {
  i: Indicador
  reportado?: number
  onAbrir: () => void
  conBoton?: boolean
}) {
  const estado = estadoDe(i, reportado)
  const r = razon(i, reportado)
  const huerfano = sinResponsableUnico(i)
  return (
    <button
      onClick={onAbrir}
      className="block w-full rounded-2xl border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600">{i.codigo}</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ESTADOS[estado].chip}`}>
          {ESTADOS[estado].rotulo}
        </span>
      </div>

      <p className="mt-2.5 text-sm font-semibold leading-snug text-gray-900">{i.indicador}</p>
      <p className="mt-1 text-xs leading-snug text-gray-500">{i.programa}</p>

      <div className="mt-3.5">
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
          <span className="text-gray-500">
            Avance <b className="tabular-nums text-gray-900">{fmt(reportado ?? i.avance)}</b>
            <span className="text-gray-400"> de </span>
            <b className="tabular-nums text-gray-900">{fmt(i.meta2026)}</b>
            <span className="text-gray-400"> · meta 2026</span>
          </span>
          {r !== null && <span className="font-semibold tabular-nums text-gray-700">{fmtRazon(r)}</span>}
        </div>
        <BarraAvance razon={r} estado={estado} />
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3 text-xs">
        <span className={`inline-flex min-w-0 items-center gap-1.5 ${huerfano ? 'font-medium text-red-700' : 'text-gray-600'}`}>
          <Icono glifo={huerfano ? Iconos.estado.advertencia : Iconos.navegacion.usuarios} tamano="sm" className="shrink-0" />
          <span className="truncate">{huerfano ? ROTULO_RESPONSABLE[tipoResponsable(i.responsable)] : i.responsable}</span>
        </span>
        {conBoton
          ? <span className="shrink-0 rounded-lg bg-[#192031] px-3 py-1.5 font-semibold text-white">Reportar</span>
          : <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="shrink-0 text-gray-300" />}
      </div>
    </button>
  )
}

export default function ListaIndicadores({
  lista, reportado, onAbrir, conBoton, dependencia, onDependencia, filtroInicial,
}: {
  lista: Indicador[]
  reportado: Record<number, number>
  onAbrir: (id: number) => void
  conBoton?: boolean
  /** Si viene, se muestra el selector de secretaría (alcalde y Control Interno). */
  dependencia?: string
  onDependencia?: (d: string) => void
  /** Desde dónde se llegó: un enlace de otra sección puede pedir la lista ya filtrada. */
  filtroInicial?: Filtro
}) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial ?? 'todos')
  const [limite, setLimite] = useState(PAGINA)

  const delAlcance = useMemo(
    () => (dependencia ? lista.filter(i => i.dependencia === dependencia) : lista),
    [lista, dependencia],
  )

  const cuenta = useMemo(() => {
    const c: Record<Filtro, number> = { todos: delAlcance.length, sin_responsable: 0, atencion: 0, sin_reporte: 0 }
    for (const i of delAlcance) {
      const e = estadoDe(i, reportado[i.id])
      if (sinResponsableUnico(i)) c.sin_responsable++
      if (e === 'critico' || e === 'atrasado') c.atencion++
      if (e === 'sin_reporte') c.sin_reporte++
    }
    return c
  }, [delAlcance, reportado])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return delAlcance.filter(i => {
      const e = estadoDe(i, reportado[i.id])
      if (filtro === 'sin_responsable' && !sinResponsableUnico(i)) return false
      if (filtro === 'atencion' && e !== 'critico' && e !== 'atrasado') return false
      if (filtro === 'sin_reporte' && e !== 'sin_reporte') return false
      if (!t) return true
      return [i.indicador, i.producto, i.programa, i.responsable, i.codigo].some(x => x.toLowerCase().includes(t))
    })
  }, [delAlcance, reportado, q, filtro])

  const filtros: { k: Filtro; rotulo: string }[] = [
    { k: 'todos', rotulo: 'Todos' },
    { k: 'sin_responsable', rotulo: 'Sin responsable' },
    { k: 'atencion', rotulo: 'Atrasados y críticos' },
    { k: 'sin_reporte', rotulo: 'Sin reporte' },
  ]

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
            {DEPENDENCIAS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
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
                reportado={reportado[i.id]}
                onAbrir={() => onAbrir(i.id)}
                conBoton={conBoton}
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
