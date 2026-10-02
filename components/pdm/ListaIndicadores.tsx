'use client'

/**
 * La lista de indicadores, como un registro: una fila por indicador, con columnas rotuladas en
 * escritorio y apilada en el teléfono.
 *
 * El archivo original es una hoja de 258 columnas: imposible de leer en un teléfono, y los
 * responsables de indicadores son sobre todo contratistas que trabajan desde uno. Cada fila dice
 * lo que importa para decidir si hay que abrirla: qué se mide, a nombre de quién está, cómo va
 * contra su meta y en qué punto del año está. El estado se dice con un marcador y una palabra,
 * una vez; no con un racimo de etiquetas de colores.
 */

import { useMemo, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  agrupar, estadoDe, fmt, fmtRazon, razon, rotuloMeta, sinAsignar, tipoResponsable, type Indicador,
} from '@/lib/pdm/plan'
import { BarraAvance } from './Barras'
import IconoSector from './IconoSector'
import { EstadoTexto, SituacionTexto } from './ui'
import { T } from './tema'
import { FILTROS_DEL_ANIO, cumpleFiltro, type Filtro } from '@/lib/pdm/filtros'
import type { PersonaFicha } from '@/lib/pdm/personas'

const PAGINA = 25

/** Las columnas, en escritorio. La primera (selección) solo existe cuando se está seleccionando. «Mi trabajo» usa las mismas. */
export const COLUMNAS = 'md:grid-cols-[4.25rem_minmax(0,1fr)_12rem_9.5rem_12rem]'
const COLUMNAS_SEL = 'md:grid-cols-[1.5rem_4.25rem_minmax(0,1fr)_12rem_9.5rem_12rem]'

function Responsable({ i, asignado }: { i: Indicador; asignado?: string }) {
  if (sinAsignar(i)) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-[#B42318]">
        <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="shrink-0" />
        <span className="truncate">{tipoResponsable(i.responsable) === 'persona' ? `${i.responsable} · sin usuario` : 'Sin responsable'}</span>
      </span>
    )
  }
  return <span className="block truncate text-xs text-[#4A5568]">{asignado ?? i.responsable}</span>
}

export function FilaIndicador({ i, onAbrir, asignado, seleccionable, elegido, yoId }: {
  i: Indicador
  onAbrir: () => void
  /** Quién mira: si el reporte es suyo, la fila dice «Tú» y no su nombre. */
  yoId?: string
  /** En modo de selección la fila se marca en vez de abrirse. */
  seleccionable?: boolean
  elegido?: boolean
  /** Nombre de la persona asignada en la plataforma; sin él se muestra lo que decía el Excel. */
  asignado?: string
}) {
  const estado = estadoDe(i)
  const r = razon(i)
  const enAnio = i.enAnio
  const reporte = enAnio?.reporte ?? null
  // «Sin avance validado» sobra cuando la situación del año ya dice en qué punto va el reporte.
  const mostrarEstado = estado !== 'sin_reporte' || !enAnio

  return (
    <button
      onClick={onAbrir}
      aria-pressed={seleccionable ? elegido === true : undefined}
      className={`grid w-full grid-cols-1 gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors focus-visible:bg-[#F1F3F7] focus-visible:outline-none sm:px-5 ${seleccionable ? COLUMNAS_SEL : COLUMNAS} md:items-center ${
        elegido ? 'bg-[#EDF0F5]' : 'hover:bg-[#F7F8FA]'
      }`}
    >
      {seleccionable && (
        <span
          aria-hidden
          className={`hidden h-[18px] w-[18px] items-center justify-center rounded-[4px] border md:flex ${elegido ? 'border-[#192031] bg-[#192031] text-white' : 'border-[#AEB6C4] bg-white'}`}
        >
          {elegido && <Icono glifo={Iconos.estado.ok} tamano="sm" className="h-3 w-3" />}
        </span>
      )}

      {/* Teléfono: el código y el estado en la primera línea */}
      <div className="flex items-center justify-between gap-3 md:hidden">
        <span className="flex items-center gap-2.5">
          {seleccionable && (
            <span
              aria-hidden
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${elegido ? 'border-[#192031] bg-[#192031] text-white' : 'border-[#AEB6C4] bg-white'}`}
            >
              {elegido && <Icono glifo={Iconos.estado.ok} tamano="sm" className="h-3 w-3" />}
            </span>
          )}
          <IconoSector sector={i.sector} />
          <span className="text-xs font-semibold tabular-nums text-[#667085]">{i.codigo}</span>
        </span>
        <span className="flex flex-col items-end gap-0.5">
          {mostrarEstado && <EstadoTexto estado={estado} />}
          {enAnio && <SituacionTexto situacion={enAnio.situacion} />}
        </span>
      </div>

      <span className="hidden flex-col items-start gap-1.5 md:flex">
        <IconoSector sector={i.sector} />
        <span className="text-xs font-semibold tabular-nums text-[#667085]">{i.codigo}</span>
      </span>

      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-[#192031]">{i.indicador}</p>
        <p className="mt-0.5 truncate text-xs text-[#667085]">{i.programa}</p>
        {reporte && enAnio?.situacion === 'pendiente' && (
          <p className="mt-1 truncate text-xs text-[#8A5A12]">
            {yoId && reporte.autorId === yoId ? 'Tú' : reporte.autorNombre} reportó <b className="tabular-nums">{fmt(reporte.valor)}</b>; falta que la secretaría lo valide
          </p>
        )}
        {reporte && enAnio?.situacion === 'devuelto' && (
          <p className="mt-1 truncate text-xs text-[#B42318]">
            Devuelto{reporte.validacionComentario ? `: ${reporte.validacionComentario}` : ''}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <Responsable i={i} asignado={asignado} />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-[#667085]">
            <b className="font-semibold tabular-nums text-[#192031]">{fmt(i.avance)}</b>
            <span> / </span>
            <span className="tabular-nums">{fmt(i.meta)}</span>
            <span className="md:hidden"> · {rotuloMeta(i)}</span>
          </span>
          {r !== null && <span className="font-semibold tabular-nums text-[#192031]">{fmtRazon(r)}</span>}
        </div>
        <div className="mt-1.5"><BarraAvance razon={r} estado={estado} /></div>
      </div>

      <div className="hidden flex-col items-start gap-1 md:flex">
        {mostrarEstado && <EstadoTexto estado={estado} />}
        {enAnio && <SituacionTexto situacion={enAnio.situacion} />}
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

  // Los filtros del año solo se ofrecen si en él se espera algo (si no, no hay nada que filtrar).
  const hayReportes = useMemo(() => lista.some(i => i.enAnio !== null), [lista])
  const filtros = useMemo(
    () => (Object.keys(ROTULO_FILTRO) as Filtro[]).filter(f => hayReportes || !FILTROS_DEL_ANIO.includes(f)),
    [hayReportes],
  )
  // Un enlace puede pedir un filtro del año cuando en ese año no se espera nada: se ignora y sale la lista completa.
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

  const seleccionando = seleccion?.activa === true

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block flex-1">
          <span className="sr-only">Buscar indicador</span>
          <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input
            id="pdm-busqueda"
            type="search"
            value={q}
            onChange={e => { setQ(e.target.value); setLimite(PAGINA) }}
            placeholder="Buscar indicador o responsable"
            className={`${T.campo} pl-10`}
          />
        </label>
        {onDependencia && (
          <select
            id="pdm-dependencia"
            aria-label="Secretaría"
            value={dependencia ?? ''}
            onChange={e => { onDependencia(e.target.value); setLimite(PAGINA) }}
            className={`${T.campo} sm:w-72`}
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
            className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-1 ${
              filtroActivo === f
                ? 'border-[#192031] bg-[#192031] text-white'
                : 'border-[#C5CBD6] bg-white text-[#4A5568] hover:border-[#192031] hover:text-[#192031]'
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
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-1 ${
              seleccion.activa
                ? 'border-[#192031] bg-[#EDF0F5] text-[#192031]'
                : 'border-[#C5CBD6] bg-white text-[#4A5568] hover:border-[#192031] hover:text-[#192031]'
            }`}
          >
            {seleccion.activa ? 'Terminar selección' : 'Seleccionar varios'}
          </button>
          {seleccion.activa && visibles.length > 0 && (
            <button id="pdm-seleccionar-visibles" onClick={() => seleccion.onReemplazar(visibles.map(i => i.id))} className={T.botonSecChico}>
              Seleccionar los {visibles.length} visibles
            </button>
          )}
          {seleccion.activa && seleccion.elegidos.size > 0 && (
            <button
              onClick={() => seleccion.onReemplazar([])}
              className="px-2 py-1.5 text-xs font-semibold text-[#667085] underline-offset-2 hover:text-[#192031] hover:underline"
            >
              Quitar la selección
            </button>
          )}
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#C5CBD6] bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-[#192031]">Ningún indicador coincide con lo que buscas.</p>
          <p className="mt-1 text-xs text-[#667085]">Prueba con otra palabra o quita el filtro.</p>
        </div>
      ) : (
        <>
          <div className={`overflow-hidden ${T.panel}`}>
            <div className={`hidden gap-x-4 border-b ${T.regla} bg-[#F7F8FA] px-5 py-2 md:grid ${seleccionando ? COLUMNAS_SEL : COLUMNAS}`}>
              {seleccionando && <span />}
              <span className={T.rotulo}>Código</span>
              <span className={T.rotulo}>Indicador</span>
              <span className={T.rotulo}>Responsable</span>
              <span className={T.rotulo}>Avance / meta</span>
              <span className={T.rotulo}>Estado</span>
            </div>
            <div className={`divide-y ${T.divide}`}>
              {visibles.slice(0, limite).map(i => (
                <FilaIndicador
                  key={i.id}
                  i={i}
                  onAbrir={seleccion?.activa ? () => seleccion.onAlternar(i.id) : () => onAbrir(i.id)}
                  seleccionable={seleccion?.activa}
                  elegido={seleccion?.activa ? seleccion.elegidos.has(i.id) : undefined}
                  asignado={(() => { const f = fichas?.[i.id]; return f && 'nombre' in f ? f.nombre : undefined })()}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#667085]">
            <span>
              Mostrando <b className="tabular-nums text-[#192031]">{Math.min(limite, visibles.length)}</b> de <b className="tabular-nums text-[#192031]">{visibles.length}</b>
            </span>
            {visibles.length > limite && (
              <button onClick={() => setLimite(l => l + PAGINA)} className={T.botonSecChico}>
                Mostrar {Math.min(PAGINA, visibles.length - limite)} más
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
