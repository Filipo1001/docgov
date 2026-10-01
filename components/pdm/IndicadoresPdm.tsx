'use client'

/**
 * Indicadores: la lista de trabajo. Búsqueda, filtros y la ficha de cada uno.
 *
 * Llega ya filtrada cuando otra sección lo pide: desde el Resumen por
 * secretaría, y desde Responsables por secretaría con huecos o por persona.
 * Esas cosas viajan en la dirección y la pantalla las lee UNA vez al abrirse; por eso la página que la monta le pone una `key`, para que un
 * enlace nuevo a esta misma pantalla arranque de cero y no arrastre el filtro
 * anterior.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import type { Indicador } from '@/lib/pdm/plan'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import EncabezadoSeccion from './EncabezadoSeccion'
import ListaIndicadores from './ListaIndicadores'
import type { Filtro } from '@/lib/pdm/filtros'
import type { GrupoVista, PersonaDirectorio, PersonaFicha } from '@/lib/pdm/personas'
import { asignadosVista } from '@/lib/pdm/asignados'
import { gestiona, type NivelPdm } from '@/lib/pdm/niveles'
import { describirResumen, type AccionesPdm, type ResumenCambio } from '@/lib/pdm/acciones'
import { fechaCorta, type Seguimiento } from '@/lib/pdm/seguimiento'
import type { AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import IndicadorModal from './IndicadorModal'
import SelectorAsignacion from './SelectorAsignacion'
import { ACCIONES_REALES } from './acciones-reales'
import { ACCIONES_SEGUIMIENTO_REALES } from './acciones-seguimiento-reales'

export default function IndicadoresPdm({
  indicadores, fichas, personas, grupos, nivel, yoId, seguimiento, dependenciaInicial, filtroInicial, abiertoInicial, restringirA,
  acciones = ACCIONES_REALES, accionesSeguimiento = ACCIONES_SEGUIMIENTO_REALES,
}: {
  indicadores: Indicador[]
  fichas: Record<number, PersonaFicha>
  personas: PersonaDirectorio[]
  grupos: GrupoVista[]
  /** Qué puede hacer quien mira: quien gestiona asigna y quita; el administrador además ve el historial. */
  nivel: NivelPdm
  /** Quién mira: sirve para saber qué indicadores son suyos para reportar. */
  yoId: string
  /** Los cortes y los ajustes del plan. */
  seguimiento: Seguimiento
  /** Lo que quien gestiona puede hacer. Por defecto, las acciones del servidor; las pruebas ponen un doble. */
  acciones?: AccionesPdm
  accionesSeguimiento?: AccionesSeguimiento
  dependenciaInicial?: string
  filtroInicial?: Filtro
  /** Abre la ficha de este indicador al entrar (un enlace de Reportes lo pide). */
  abiertoInicial?: number
  /** Solo estos indicadores (los de una persona), con el nombre para el rótulo. */
  restringirA?: { etiqueta: string; ids: number[] }
}) {
  const [dependencia, setDependencia] = useState(dependenciaInicial ?? '')
  const [abierto, setAbierto] = useState<number | null>(abiertoInicial ?? null)
  const [seleccionActiva, setSeleccionActiva] = useState(false)
  const [elegidos, setElegidos] = useState<ReadonlySet<number>>(new Set())
  // Los indicadores que se están asignando (los marcados, o el de la ficha abierta); `null`: el selector está cerrado.
  const [selectorPara, setSelectorPara] = useState<Indicador[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const lista = useMemo(() => {
    if (!restringirA) return indicadores
    const ids = new Set(restringirA.ids)
    return indicadores.filter(i => ids.has(i.id))
  }, [indicadores, restringirA])
  const indicador = abierto === null ? null : indicadores.find(i => i.id === abierto) ?? null

  const puedeAsignar = gestiona(nivel)
  const personasPorId = useMemo(() => new Map(personas.map(p => [p.id, p])), [personas])
  const gruposPorId = useMemo(() => new Map(grupos.map(g => [g.id, g])), [grupos])
  const marcados = useMemo(() => indicadores.filter(i => elegidos.has(i.id)), [indicadores, elegidos])

  function alternar(id: number) {
    setElegidos(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }
  function terminarSeleccion() {
    setSeleccionActiva(false)
    setElegidos(new Set())
  }
  function terminoAsignar(resumen: ResumenCambio, etiqueta: string) {
    const eraLote = selectorPara !== null && selectorPara.length === marcados.length && marcados.length > 0
    setSelectorPara(null)
    if (eraLote) terminarSeleccion()
    setAviso(describirResumen(resumen, etiqueta))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <EncabezadoSeccion
        titulo="Indicadores"
        detalle={restringirA ? `${lista.length} de ${indicadores.length}` : `${indicadores.length} indicadores de producto`}
      />

      {/* En qué punto está el seguimiento. Quien reporta necesita saber por qué hay (o no) un botón para hacerlo. */}
      {seguimiento.abierto ? (
        <p className="inline-flex flex-wrap items-center gap-x-2 rounded-full bg-teal-50 px-3.5 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">
          <span>Corte abierto · {seguimiento.abierto.nombre}</span>
          <span className="font-medium text-teal-700">al {fechaCorta(seguimiento.abierto.fecha)}</span>
        </p>
      ) : (nivel === 'responsable' || nivel === 'coordinador') && (
        <p className="text-xs text-gray-500">No hay un corte abierto: por ahora no hay nada que reportar.</p>
      )}

      {aviso && (
        <p role="status" className="flex items-start justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 text-emerald-700 hover:text-emerald-900">
            <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta="Cerrar aviso" />
          </button>
        </p>
      )}

      {restringirA && (
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 py-1 pl-3.5 pr-1.5 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">
            A nombre de {restringirA.etiqueta}
            <Link
              href={HREF_INDICADORES}
              className="flex h-6 w-6 items-center justify-center rounded-full text-teal-700 transition-colors hover:bg-teal-100"
            >
              <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta="Quitar este filtro" />
            </Link>
          </span>
        </div>
      )}

      <ListaIndicadores
        lista={lista}
        onAbrir={setAbierto}
        dependencia={dependencia}
        onDependencia={setDependencia}
        filtroInicial={filtroInicial}
        fichas={fichas}
        seleccion={puedeAsignar ? {
          activa: seleccionActiva,
          elegidos,
          onActiva: activa => { if (activa) { setAviso(null); setSeleccionActiva(true) } else terminarSeleccion() },
          onAlternar: alternar,
          onReemplazar: ids => setElegidos(new Set(ids)),
        } : undefined}
      />

      {puedeAsignar && seleccionActiva && marcados.length > 0 && (
        <>
          <div className="h-16" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900">
                <span className="tabular-nums">{marcados.length}</span> {marcados.length === 1 ? 'seleccionado' : 'seleccionados'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={terminarSeleccion}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  id="pdm-asignar-seleccion"
                  onClick={() => setSelectorPara(marcados)}
                  className="rounded-xl bg-[#192031] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#242F45]"
                >
                  Asignar…
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <IndicadorModal
        key={abierto ?? 'cerrado'}
        indicador={indicador}
        onCerrar={() => setAbierto(null)}
        seguimiento={{ nivel, yoId, corteAbierto: seguimiento.abierto, acciones: accionesSeguimiento }}
        persona={indicador ? fichas[indicador.id] : undefined}
        asignados={indicador ? asignadosVista(indicador, personasPorId, gruposPorId) : undefined}
        onAsignar={puedeAsignar && indicador ? () => { setAviso(null); setSelectorPara([indicador]) } : undefined}
        onQuitar={puedeAsignar && indicador
          ? async usuarioId => {
              const r = await acciones.quitarAsignacion({ indicadores: [indicador.uuid], usuario: usuarioId })
              return r.ok ? null : r.error
            }
          : undefined}
        onCargarHistorial={nivel === 'admin' && indicador ? () => acciones.historialIndicador(indicador.uuid) : undefined}
      />

      {puedeAsignar && selectorPara && (
        <SelectorAsignacion
          // Cada selección abre un formulario nuevo. El prefijo importa: con un solo indicador la clave sería su número,
          // igual que la de la ficha (hermana de esta), y React confundiría las dos al cerrar el selector.
          key={`selector:${selectorPara.map(i => i.id).join(',')}`}
          indicadores={selectorPara}
          personas={personas}
          grupos={grupos}
          acciones={acciones}
          onCerrar={() => setSelectorPara(null)}
          onHecho={terminoAsignar}
        />
      )}
    </div>
  )
}
