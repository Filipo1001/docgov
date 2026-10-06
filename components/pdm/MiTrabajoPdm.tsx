'use client'

/**
 * Mi trabajo: la pantalla de inicio de quien responde por indicadores.
 *
 * El tablero del plan (cumplimiento por secretaría, por línea) es para quien gestiona o vigila; a un
 * responsable le sirve otra cosa: saber qué le toca hacer. Cuatro tarjetas, una por año del plan, dicen
 * de un vistazo cómo va cada año; elegir una muestra debajo sus indicadores de ese año, con lo que le toca
 * reportar primero (lo devuelto antes que lo que falta: alguien ya lo miró y espera su respuesta).
 *
 * Nadie tiene que abrir nada para que reporte: el año ya empezó y reporta cuando haya algo que reportar,
 * las veces que haga falta. 2024 y 2025 están para cargar el histórico; el año que no ha empezado se ve
 * (con sus metas) pero todavía no se reporta. Cada fila abre la ficha del indicador, donde se reporta.
 */

import { useMemo, useState } from 'react'
import type { Indicador } from '@/lib/pdm/plan'
import { proyectarLista } from '@/lib/pdm/plan'
import { datosDeCumplimiento } from '@/lib/pdm/graficos'
import { ROTULO_ESTADO_ANIO, anioIniciado } from '@/lib/pdm/seguimiento'
import {
  esMio, miPapel, ordenarMiTrabajo, tarjetasDeAnios,
  type GrupoMio, type SeccionTrabajo, type TarjetaAnio,
} from '@/lib/pdm/mi-trabajo'
import type { NivelPdm } from '@/lib/pdm/niveles'
import type { PersonaFicha } from '@/lib/pdm/personas'
import type { AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import { Presencia } from './Ventana'
import Pagina from './Pagina'
import CumplimientoPdm from './CumplimientoPdm'
import EncabezadoSeccion from './EncabezadoSeccion'
import IndicadorModal from './IndicadorModal'
import { COLUMNAS, FilaIndicador } from './ListaIndicadores'
import MisGrupos from './MisGrupos'
import { Panel } from './ui'
import { ACCIONES_SEGUIMIENTO_REALES } from './acciones-seguimiento-reales'
import { T } from './tema'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Una tarjeta de año: cómo van mis indicadores en él. Es también el selector del año. */
function Tarjeta({ t, elegida, onElegir }: { t: TarjetaAnio; elegida: boolean; onElegir: () => void }) {
  const r = t.resumen
  const proximo = t.estado === 'proximo'
  const pct = t.conMeta > 0 ? Math.round((100 * t.conAvance) / t.conMeta) : 0
  const pendientes = r.faltan + r.devueltos + r.porValidar
  return (
    <button
      id={`pdm-tarjeta-${t.anio}`}
      onClick={onElegir}
      aria-pressed={elegida}
      className={`flex min-w-0 flex-col rounded-lg border bg-white px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-2 ${
        elegida ? 'border-[#192031] ring-1 ring-inset ring-[#192031]' : `${proximo ? 'border-dashed' : ''} border-[#DCE0E8] hover:border-[#192031]`
      }`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={`text-[22px] font-semibold leading-none tracking-tight tabular-nums ${proximo ? 'text-[#667085]' : 'text-[#192031]'}`}>{t.anio}</span>
        <span className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${t.estado === 'en_curso' ? 'text-[#192031]' : 'text-[#667085]'}`}>
          {ROTULO_ESTADO_ANIO[t.estado]}
        </span>
      </span>

      {proximo ? (
        <>
          <span className={`mt-3 ${T.rotulo}`}>Se abre el 1 de enero</span>
          <span className="mt-1.5 text-sm text-[#667085]"><b className="font-semibold tabular-nums">{t.conMeta}</b> con meta</span>
          <span className="mt-auto pt-3 text-xs text-[#667085]">Aún no se puede reportar</span>
        </>
      ) : t.conMeta === 0 ? (
        <span className="mt-3 text-sm text-[#667085]">Sin metas en {t.anio}</span>
      ) : (
        <>
          <span className={`mt-3 ${T.rotulo}`}>Con avance aprobado</span>
          <span className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-[#192031]">{t.conAvance}</span>
            <span className="text-sm text-[#667085]">de <span className="tabular-nums">{t.conMeta}</span></span>
          </span>
          <span className="mt-2.5 block h-1.5 overflow-hidden rounded-[3px] bg-[#E6E9EF]" aria-hidden>
            <span className="block h-full w-full origin-left bg-[#192031] transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${pct / 100})` }} />
          </span>
          <span className="mt-2.5 flex min-h-[3rem] flex-col gap-0.5 text-xs text-[#556072]">
            {r.devueltos > 0 && <span className="font-medium text-[#B42318]">{plural(r.devueltos, 'devuelto', 'devueltos')}</span>}
            {r.faltan > 0 && <span>{plural(r.faltan, 'sin reportar', 'sin reportar')}</span>}
            {r.porValidar > 0 && <span>{plural(r.porValidar, 'sin validar', 'sin validar')}</span>}
            {pendientes === 0 && <span>Todo reportado</span>}
          </span>
        </>
      )}
    </button>
  )
}

function ListaSeccion({ seccion, papel, yoId, onAbrir }: {
  seccion: SeccionTrabajo
  papel: (i: Indicador) => string
  yoId: string
  onAbrir: (id: number) => void
}) {
  return (
    <section className={`overflow-hidden ${T.panel}`}>
      <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b ${T.regla} px-4 py-3 sm:px-5`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className={T.rotulo}>{seccion.titulo}</h2>
          {seccion.nota && <span className={`text-xs ${T.tenue}`}>{seccion.nota}</span>}
        </div>
        <span className={`text-xs ${T.tenue}`}>
          <b className={`tabular-nums ${T.tinta}`}>{seccion.indicadores.length}</b> {seccion.indicadores.length === 1 ? 'indicador' : 'indicadores'}
        </span>
      </div>
      <div className={`hidden gap-x-4 border-b ${T.regla} bg-[#F7F8FA] px-5 py-2 md:grid ${COLUMNAS}`}>
        <span className={T.rotulo}>Código</span>
        <span className={T.rotulo}>Indicador</span>
        <span className={T.rotulo}>Tu papel</span>
        <span className={T.rotulo}>Avance / meta</span>
        <span className={T.rotulo}>Estado</span>
      </div>
      <div className={`divide-y ${T.divide}`}>
        {seccion.indicadores.map(i => (
          <FilaIndicador key={i.id} i={i} asignado={papel(i)} yoId={yoId} onAbrir={() => onAbrir(i.id)} />
        ))}
      </div>
    </section>
  )
}

export default function MiTrabajoPdm({
  indicadores, fichas, grupos, gruposLeidos, nivel, yoId, anioActual, anioInicial, accionesSeguimiento = ACCIONES_SEGUIMIENTO_REALES,
}: {
  /** Con sus cuatro años: se proyectan al que se mira. */
  indicadores: Indicador[]
  fichas: Record<number, PersonaFicha>
  /** Los grupos de los que formo parte. */
  grupos: GrupoMio[]
  /** `false`: no se pudo leer el directorio, y entonces no se sabe si tengo grupos. */
  gruposLeidos: boolean
  nivel: NivelPdm
  yoId: string
  /** El año calendario (hora de Colombia). */
  anioActual: number
  /** El año con que se abre la pantalla. */
  anioInicial: number
  accionesSeguimiento?: AccionesSeguimiento
}) {
  const [anio, setAnio] = useState(anioInicial)
  const [abierto, setAbierto] = useState<number | null>(null)

  const delAnio = useMemo(() => proyectarLista(indicadores, anio), [indicadores, anio])
  const indicador = abierto === null ? null : delAnio.find(i => i.id === abierto) ?? null

  const secciones = useMemo(() => ordenarMiTrabajo(delAnio, yoId), [delAnio, yoId])
  const mios = useMemo(() => indicadores.filter(i => esMio(i, yoId)), [indicadores, yoId])
  const tarjetas = useMemo(() => tarjetasDeAnios(indicadores, yoId, anioActual), [indicadores, yoId, anioActual])
  // El diagrama de cumplimiento de MIS indicadores, en los años que se elijan (el mismo selector de años del panel).
  const cumplimiento = useMemo(() => datosDeCumplimiento(mios, 'mios', anioActual), [mios, anioActual])
  const nombreDeGrupo = useMemo(() => new Map(grupos.map(g => [g.id, g.nombre])), [grupos])

  const iniciado = anioIniciado(anio, anioActual)
  const nada = iniciado && mios.length > 0 && secciones.some(s => s.clave !== 'todos') && !secciones.some(s => s.clave === 'reportar')

  // Mi papel en un indicador, tal como lo dice mi fila: principal o apoyo, y de qué grupo vino.
  function papel(i: Indicador): string {
    const p = miPapel(i, yoId)
    if (!p) return ''
    const grupo = p.grupoId ? nombreDeGrupo.get(p.grupoId) : undefined
    return `${p.principal ? 'Principal' : 'Apoyo'}${grupo ? ` · ${grupo}` : ''}`
  }

  return (
    <Pagina>
      <EncabezadoSeccion
        titulo="Mi trabajo"
        datos={[
          { rotulo: 'A tu cargo', valor: plural(mios.length, 'indicador', 'indicadores') },
          ...(grupos.length > 0 ? [{ rotulo: 'Grupos', valor: String(grupos.length) }] : []),
        ]}
      />

      {mios.length === 0 ? (
        <Panel>
          <p className={`text-sm font-medium ${T.tinta}`}>Todavía no tienes indicadores a tu cargo.</p>
          <p className={`mt-1 text-sm ${T.suave}`}>Cuando tu secretaría te asigne alguno, aparecerá aquí y podrás reportarlo en cada año.</p>
        </Panel>
      ) : (
        <>
          {cumplimiento && <CumplimientoPdm datos={cumplimiento} anioInicial={anioInicial} />}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tarjetas.map(t => <Tarjeta key={t.anio} t={t} elegida={t.anio === anio} onElegir={() => setAnio(t.anio)} />)}
          </div>

          {!iniciado && (
            <p className={T.avisoNota}>El {anio} empieza el 1 de enero: todavía no se puede reportar. Mientras tanto puedes ver sus metas.</p>
          )}
          {nada && <p className={T.avisoBien}>No tienes nada pendiente por reportar en {anio}.</p>}
          {secciones.map(s => <ListaSeccion key={s.clave} seccion={s} papel={papel} yoId={yoId} onAbrir={setAbierto} />)}
        </>
      )}

      {grupos.length > 0 && <MisGrupos grupos={grupos} />}
      {!gruposLeidos && (
        <p className={`text-xs ${T.tenue}`}>No se pudieron leer tus grupos en este momento. Vuelve a cargar la página para intentarlo de nuevo.</p>
      )}

      <Presencia mostrar={indicador !== null}>
      <IndicadorModal
        key={abierto ?? 'cerrado'}
        indicador={indicador}
        onCerrar={() => setAbierto(null)}
        onAnio={setAnio}
        seguimiento={{ nivel, yoId, anioActual, acciones: accionesSeguimiento }}
        persona={indicador ? fichas[indicador.id] : undefined}
      />
      </Presencia>
    </Pagina>
  )
}
