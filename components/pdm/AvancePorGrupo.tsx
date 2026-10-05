'use client'

/**
 * El mismo avance, partido por grupos (secretarías, líneas estratégicas) y en UN año: una fila por grupo, con las
 * mismas dos medidas y la misma barra de reportes que las tarjetas de año, para que lo de arriba y lo de abajo se
 * lean con las mismas reglas (ver `lib/pdm/graficos.ts`).
 *
 * Las filas se comparan con porcentajes y no con cantidades, y cada una dice sobre cuántos indicadores se calcula: una
 * secretaría con dos indicadores no puede parecer tan firme como una con cien. Con menos de `POCOS_INDICADORES` con
 * meta, la fila lo advierte.
 *
 * Misma anatomía en las tres columnas: una primera línea (el nombre, la cifra, el «x de y»), debajo la barra y debajo
 * una línea de apoyo. Así las barras de las dos columnas caen a la misma altura y se pueden recorrer con la vista.
 */

import { POCOS_INDICADORES, pctLegible, textoDeParte, PARTES, type CuentaDeAnio, type CuentaDeGrupo } from '@/lib/pdm/graficos'
import { BarraProgreso, BarraReportes, MarcadorDeParte } from './Barras'
import IconoSector from './IconoSector'
import { Panel } from './ui'
import { T } from './tema'

/** Tres columnas desde `md`; debajo, el nombre arriba y las dos medidas lado a lado. */
const COLUMNAS = 'md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.5fr)] md:gap-x-6'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function Avance({ c }: { c: CuentaDeAnio }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold leading-5 tabular-nums text-[#192031]">{pctLegible(c.avancePromedio)}</p>
      <div className="mt-1.5"><BarraProgreso valor={c.avancePromedio} /></div>
      <p className="mt-1.5 text-xs leading-4 text-[#556072]">
        {c.avancePromedio === null
          ? 'Sin avance validado'
          : <><b className="font-semibold tabular-nums text-[#192031]">{c.alcanzaron}</b> de <span className="tabular-nums">{c.conMeta}</span> {c.alcanzaron === 1 ? 'alcanzó' : 'alcanzaron'} la meta</>}
      </p>
    </div>
  )
}

function Reportes({ c }: { c: CuentaDeAnio }) {
  const reportados = c.aprobados + c.porValidar + c.devueltos
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold leading-5 tabular-nums text-[#192031]">
        {reportados} <span className="font-normal text-[#556072]">de {c.conMeta} con reporte</span>
      </p>
      <div className="mt-1.5"><BarraReportes c={c} /></div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-4 text-[#556072]">
        {PARTES.filter(p => c[p] > 0).map(p => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <MarcadorDeParte parte={p} />
            <span className="tabular-nums">{textoDeParte(p, c[p])}</span>
          </span>
        ))}
      </p>
    </div>
  )
}

function Fila({ g, anio, onVer, conIconoDeLinea }: {
  g: CuentaDeGrupo; anio: number; onVer?: () => void; conIconoDeLinea: boolean
}) {
  const c = g.cuenta
  const proximo = c.estado === 'proximo'
  const pocos = c.conMeta > 0 && c.conMeta < POCOS_INDICADORES
  const contenido = (
    <div className={`grid grid-cols-2 items-start gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5 ${COLUMNAS}`}>
      <div className="col-span-2 flex min-w-0 items-start gap-3 md:col-span-1">
        {conIconoDeLinea && <IconoSector linea={g.nombre} tamano="md" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-[#192031] [overflow-wrap:anywhere]">{g.nombre}</p>
          <p className="text-xs leading-4 text-[#667085]">
            {plural(c.total, 'indicador', 'indicadores')} · {c.conMeta} con meta
          </p>
          {pocos && <p className="mt-0.5 text-xs leading-4 text-[#667085]">Pocos indicadores: lee el porcentaje con cuidado.</p>}
        </div>
      </div>
      {proximo ? (
        <p className="col-span-2 text-xs leading-5 text-[#667085]">Se abre el 1 de enero de {anio}: todavía no se reporta.</p>
      ) : c.conMeta === 0 ? (
        <p className="col-span-2 text-xs leading-5 text-[#667085]">Sin metas en {anio}.</p>
      ) : (
        <>
          <Avance c={c} />
          <Reportes c={c} />
        </>
      )}
    </div>
  )
  return onVer ? (
    <button onClick={onVer} className="block w-full text-left transition-colors hover:bg-[#F7F8FA] focus-visible:bg-[#F1F3F7] focus-visible:outline-none">
      {contenido}
    </button>
  ) : contenido
}

export default function AvancePorGrupo({ titulo, rotuloGrupo, anio, grupos, onVer, conIconoDeLinea = false }: {
  titulo: string
  /** Cómo se llama lo que se agrupa, para el encabezado de la primera columna. */
  rotuloGrupo: string
  anio: number
  grupos: CuentaDeGrupo[]
  onVer?: (nombre: string) => void
  /** Las filas de «Por línea estratégica» llevan el icono de su línea. */
  conIconoDeLinea?: boolean
}) {
  return (
    <Panel titulo={titulo} nota={anio} sinRelleno className="min-w-0 overflow-hidden">
      <div className={`hidden gap-x-4 border-b ${T.regla} bg-[#F7F8FA] px-5 py-2 md:grid ${COLUMNAS}`}>
        <span className={T.rotulo}>{rotuloGrupo}</span>
        <span className={T.rotulo}>Avance promedio</span>
        <span className={T.rotulo}>Reportes</span>
      </div>
      <div className={`divide-y ${T.divide}`}>
        {grupos.map(g => (
          <Fila key={g.nombre} g={g} anio={anio} onVer={onVer ? () => onVer(g.nombre) : undefined} conIconoDeLinea={conIconoDeLinea} />
        ))}
      </div>
    </Panel>
  )
}
