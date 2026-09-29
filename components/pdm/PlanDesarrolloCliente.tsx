'use client'

/**
 * Plan de Desarrollo — vista previa.
 *
 * Cuatro maneras de mirar el mismo plan, según quién lo mire:
 *
 *   · Alcalde         — el tablero, sin navegar la complejidad operativa.
 *   · Secretaría      — el tablero y la lista de SU dependencia.
 *   · Reportante      — solo sus indicadores, y el botón de reportar.
 *   · Control Interno — el tablero global más los controles de integridad.
 *
 * Control Interno no es un rol de la plataforma todavía; aquí se muestra como
 * vista para poder enseñarlo. El selector «Ver como» existe solo en la vista
 * previa: en el sistema real cada persona ve únicamente lo que su rol le da.
 *
 * Nada de lo que se haga aquí se guarda. Los reportes viven en memoria mientras
 * la pestaña esté abierta, y por eso el módulo no puede afectar a Contratista
 * Digital: no hay una sola escritura a ninguna parte.
 */

import { useMemo, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  DEPENDENCIAS, INDICADORES, REPORTANTES, resumir,
  type Reporte,
} from '@/lib/pdm/plan'
import Tablero from './Tablero'
import ListaIndicadores from './ListaIndicadores'
import IndicadorModal from './IndicadorModal'

export type Vista = 'alcalde' | 'secretario' | 'reportante' | 'control'

const VISTAS: { k: Vista; rotulo: string }[] = [
  { k: 'alcalde', rotulo: 'Alcalde' },
  { k: 'secretario', rotulo: 'Secretaría' },
  { k: 'reportante', rotulo: 'Reportante' },
  { k: 'control', rotulo: 'Control Interno' },
]

const SELECT =
  'rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200'

export default function PlanDesarrolloCliente({
  vistaInicial = 'alcalde',
  personaInicial,
}: {
  vistaInicial?: Vista
  personaInicial?: string
}) {
  const [vista, setVista] = useState<Vista>(vistaInicial)
  const [dependencia, setDependencia] = useState(
    DEPENDENCIAS.find(d => d.includes('Gobierno')) ?? DEPENDENCIAS[0],
  )
  const [persona, setPersona] = useState(
    personaInicial ?? REPORTANTES.find(p => p.nombre === 'Felipe Restrepo')?.nombre ?? REPORTANTES[0].nombre,
  )
  const [pestana, setPestana] = useState<'tablero' | 'lista'>('tablero')
  const [filtroDep, setFiltroDep] = useState('')
  const [reportes, setReportes] = useState<Record<number, Reporte[]>>({})
  const [abierto, setAbierto] = useState<number | null>(null)

  // Lo último reportado por indicador: pisa al valor del archivo solo en pantalla.
  const reportado = useMemo(() => {
    const m: Record<number, number> = {}
    for (const [id, l] of Object.entries(reportes)) if (l[0]) m[Number(id)] = l[0].nuevo
    return m
  }, [reportes])

  const conEvidencia = Object.values(reportes).filter(l => l.length > 0).length

  const alcance = useMemo(() => {
    if (vista === 'secretario') return INDICADORES.filter(i => i.dependencia === dependencia)
    if (vista === 'reportante') return INDICADORES.filter(i => i.responsable === persona)
    return INDICADORES
  }, [vista, dependencia, persona])

  const autor = vista === 'reportante' ? persona : vista === 'secretario' ? `Secretaría (${dependencia.replace('Secretaría ', '')})` : 'Vista previa'
  const puedeReportar = vista === 'reportante' || vista === 'secretario'
  const indicador = abierto === null ? null : INDICADORES.find(i => i.id === abierto) ?? null

  function reportar(id: number, r: Omit<Reporte, 'fecha' | 'autor' | 'anterior'>) {
    const i = INDICADORES.find(x => x.id === id)
    if (!i) return
    setReportes(prev => {
      const previos = prev[id] ?? []
      return {
        ...prev,
        [id]: [{ ...r, fecha: Date.now(), autor, anterior: previos[0]?.nuevo ?? i.avance }, ...previos],
      }
    })
  }

  const propios = vista === 'reportante' ? resumir(alcance, reportado) : null

  return (
    <div className="mx-auto max-w-6xl space-y-5">

      {/* Aviso: esto es una vista previa, y dice qué significa serlo. */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Icono glifo={Iconos.estado.informacion} tamano="sm" className="mt-0.5 shrink-0 text-amber-700" />
        <p className="text-xs leading-relaxed text-amber-900 sm:text-sm">
          <b>Vista previa.</b> Muestra el archivo de seguimiento de septiembre de 2026 ya cargado en la plataforma.
          Lo que reportes aquí no se guarda.
        </p>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Plan de Desarrollo</h1>
        <p className="mt-1 text-sm text-gray-500">
          {INDICADORES.length} indicadores de producto · 4 líneas estratégicas · 4 secretarías
        </p>
      </div>

      {/* Ver como */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ver como</p>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {VISTAS.map(v => (
            <button
              key={v.k}
              onClick={() => { setVista(v.k); setPestana('tablero') }}
              aria-pressed={vista === v.k}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                vista === v.k
                  ? 'border-[#192031] bg-[#192031] text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
        {vista === 'secretario' && (
          <select id="pdm-vista-dep" aria-label="Secretaría" value={dependencia} onChange={e => setDependencia(e.target.value)} className={`${SELECT} w-full sm:w-80`}>
            {DEPENDENCIAS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {vista === 'reportante' && (
          <select id="pdm-vista-persona" aria-label="Persona" value={persona} onChange={e => setPersona(e.target.value)} className={`${SELECT} w-full sm:w-80`}>
            {REPORTANTES.map(p => <option key={p.nombre} value={p.nombre}>{p.nombre} · {p.indicadores} indicadores</option>)}
          </select>
        )}
      </div>

      {/* Reportante: solo lo suyo */}
      {vista === 'reportante' && propios && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
            <p className="text-sm text-gray-500">
              Tienes <b className="text-gray-900">{propios.total} indicadores</b> a tu nombre
              {propios.cumplidos > 0 && <> · <b className="text-gray-900">{propios.cumplidos}</b> ya cumplidos</>}
              {propios.sinReporte > 0 && <> · <b className="text-gray-900">{propios.sinReporte}</b> sin reporte</>}.
            </p>
          </div>
          <ListaIndicadores lista={alcance} reportado={reportado} onAbrir={setAbierto} conBoton />
        </div>
      )}

      {/* Los demás: tablero + lista */}
      {vista !== 'reportante' && (
        <div className="space-y-5">
          <div className="inline-flex gap-1 rounded-xl bg-gray-100 p-1">
            {(['tablero', 'lista'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPestana(p)}
                aria-pressed={pestana === p}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  pestana === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p === 'tablero' ? 'Tablero' : 'Indicadores'}
              </button>
            ))}
          </div>

          {pestana === 'tablero' ? (
            <Tablero
              lista={alcance}
              reportado={reportado}
              conEvidencia={conEvidencia}
              controles={vista === 'control'}
              onAbrir={setAbierto}
              onVerDependencia={vista === 'secretario' ? undefined : d => { setFiltroDep(d); setPestana('lista') }}
            />
          ) : (
            <ListaIndicadores
              lista={alcance}
              reportado={reportado}
              onAbrir={setAbierto}
              dependencia={vista === 'secretario' ? undefined : filtroDep}
              onDependencia={vista === 'secretario' ? undefined : setFiltroDep}
            />
          )}
        </div>
      )}

      <IndicadorModal
        key={abierto ?? 'cerrado'}
        indicador={indicador}
        reportes={abierto === null ? [] : reportes[abierto] ?? []}
        puedeReportar={puedeReportar}
        onCerrar={() => setAbierto(null)}
        onReportar={reportar}
      />
    </div>
  )
}
