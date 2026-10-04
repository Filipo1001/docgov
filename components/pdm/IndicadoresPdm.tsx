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
import { proyectarLista, type Indicador } from '@/lib/pdm/plan'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import Pagina from './Pagina'
import EncabezadoSeccion from './EncabezadoSeccion'
import SelectorAnio from './SelectorAnio'
import { T } from './tema'
import ListaIndicadores from './ListaIndicadores'
import type { Filtro } from '@/lib/pdm/filtros'
import type { GrupoVista, PersonaDirectorio, PersonaFicha } from '@/lib/pdm/personas'
import { asignadosVista } from '@/lib/pdm/asignados'
import { gestiona, type NivelPdm } from '@/lib/pdm/niveles'
import { describirResumen, type AccionesPdm, type ResumenCambio } from '@/lib/pdm/acciones'
import { anioIniciado } from '@/lib/pdm/seguimiento'
import type { AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import IndicadorModal from './IndicadorModal'
import SelectorAsignacion from './SelectorAsignacion'
import { Presencia } from './Ventana'
import { useAvisar } from './Avisos'
import { ACCIONES_REALES } from './acciones-reales'
import { ACCIONES_SEGUIMIENTO_REALES } from './acciones-seguimiento-reales'

export default function IndicadoresPdm({
  indicadores, fichas, personas, grupos, nivel, yoId, anioActual, anioInicial, dependenciaInicial, filtroInicial, abiertoInicial, restringirA,
  acciones = ACCIONES_REALES, accionesSeguimiento = ACCIONES_SEGUIMIENTO_REALES,
}: {
  /** Con sus cuatro años: se proyectan al que se mira. */
  indicadores: Indicador[]
  fichas: Record<number, PersonaFicha>
  personas: PersonaDirectorio[]
  grupos: GrupoVista[]
  /** Qué puede hacer quien mira: quien gestiona asigna y quita; el administrador además ve el historial. */
  nivel: NivelPdm
  /** Quién mira: sirve para saber qué indicadores son suyos para reportar. */
  yoId: string
  /** El año calendario (hora de Colombia): de él depende qué años ya se pueden reportar. */
  anioActual: number
  /** El año con que se abre la lista. */
  anioInicial: number
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
  const [anio, setAnio] = useState(anioInicial)
  const [dependencia, setDependencia] = useState(dependenciaInicial ?? '')
  const [abierto, setAbierto] = useState<number | null>(abiertoInicial ?? null)
  const [seleccionActiva, setSeleccionActiva] = useState(false)
  const [elegidos, setElegidos] = useState<ReadonlySet<number>>(new Set())
  // Los indicadores que se están asignando (los marcados, o el de la ficha abierta); `null`: el selector está cerrado.
  const [selectorPara, setSelectorPara] = useState<Indicador[] | null>(null)
  const avisar = useAvisar()

  // Todos los indicadores vistos en el año elegido; la lista es lo que de ellos se enseña.
  const delAnio = useMemo(() => proyectarLista(indicadores, anio), [indicadores, anio])
  const lista = useMemo(() => {
    if (!restringirA) return delAnio
    const ids = new Set(restringirA.ids)
    return delAnio.filter(i => ids.has(i.id))
  }, [delAnio, restringirA])
  const indicador = abierto === null ? null : delAnio.find(i => i.id === abierto) ?? null

  const puedeAsignar = gestiona(nivel)
  const personasPorId = useMemo(() => new Map(personas.map(p => [p.id, p])), [personas])
  const gruposPorId = useMemo(() => new Map(grupos.map(g => [g.id, g])), [grupos])
  const marcados = useMemo(() => delAnio.filter(i => elegidos.has(i.id)), [delAnio, elegidos])

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
    avisar(describirResumen(resumen, etiqueta))
  }

  return (
    <Pagina>
      {/* El cuadro de datos dice de qué año se habla: quien reporta necesita saber por qué hay (o no) con qué hacerlo. */}
      <EncabezadoSeccion
        titulo="Indicadores"
        detalle={!anioIniciado(anio, anioActual) && (nivel === 'responsable' || nivel === 'coordinador') ? `El ${anio} empieza el 1 de enero: todavía no se puede reportar.` : undefined}
        datos={[
          { rotulo: 'Año', valor: String(anio) },
          { rotulo: 'Indicadores', valor: restringirA ? `${lista.length} de ${indicadores.length}` : String(indicadores.length) },
        ]}
      />

      <SelectorAnio anio={anio} anioActual={anioActual} onCambiar={setAnio} />

      {restringirA && (
        <div>
          <span className="inline-flex items-center gap-2 rounded-md border border-[#C5CBD6] bg-white py-1 pl-3 pr-1 text-xs font-semibold text-[#192031]">
            A nombre de {restringirA.etiqueta}
            <Link
              href={HREF_INDICADORES}
              className="flex h-6 w-6 items-center justify-center rounded text-[#667085] transition-colors hover:bg-[#F4F5F8] hover:text-[#192031]"
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
          onActiva: activa => { if (activa) setSeleccionActiva(true); else terminarSeleccion() },
          onAlternar: alternar,
          onReemplazar: ids => setElegidos(new Set(ids)),
        } : undefined}
      />

      {puedeAsignar && seleccionActiva && marcados.length > 0 && (
        <>
          <div className="h-16" aria-hidden />
          <div className="pdm-entra fixed inset-x-0 bottom-0 z-40 border-t border-[#DCE0E8] bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#192031]">
                <span className="tabular-nums">{marcados.length}</span> {marcados.length === 1 ? 'seleccionado' : 'seleccionados'}
              </p>
              <div className="flex gap-2">
                <button onClick={terminarSeleccion} className={T.botonSec}>Cancelar</button>
                <button id="pdm-asignar-seleccion" onClick={() => setSelectorPara(marcados)} className={T.boton}>Asignar…</button>
              </div>
            </div>
          </div>
        </>
      )}

      <Presencia mostrar={indicador !== null}>
      <IndicadorModal
        key={abierto ?? 'cerrado'}
        indicador={indicador}
        onCerrar={() => setAbierto(null)}
        onAnio={setAnio}
        seguimiento={{ nivel, yoId, anioActual, acciones: accionesSeguimiento }}
        persona={indicador ? fichas[indicador.id] : undefined}
        asignados={indicador ? asignadosVista(indicador, personasPorId, gruposPorId) : undefined}
        onAsignar={puedeAsignar && indicador ? () => setSelectorPara([indicador]) : undefined}
        onQuitar={puedeAsignar && indicador
          ? async usuarioId => {
              const r = await acciones.quitarAsignacion({ indicadores: [indicador.uuid], usuario: usuarioId })
              return r.ok ? null : r.error
            }
          : undefined}
        onCargarHistorial={nivel === 'admin' && indicador ? () => acciones.historialIndicador(indicador.uuid) : undefined}
      />
      </Presencia>

      <Presencia mostrar={puedeAsignar && selectorPara !== null}>
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
      </Presencia>
    </Pagina>
  )
}
