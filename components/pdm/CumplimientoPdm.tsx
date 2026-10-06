'use client'

/**
 * El cumplimiento del plan, en la pantalla de inicio del módulo de cada rol:
 *
 *   · Administrador: la torta del plan entero y una barra por secretaría.
 *   · Secretaría (secretario de despacho): la torta de SU secretaría.
 *   · Contratista (responsable): la torta de los indicadores que tiene a su cargo.
 *
 * Los tres con el mismo selector de años (uno, varios o todos) y la misma regla: cumplido, en avance o sin avance, sobre las metas
 * de los años elegidos (ver `cumplimientoDe`). Es un reparto de hechos y solo cuenta lo que la secretaría aprobó.
 *
 * Vive en el módulo, no en el inicio de Contratista Digital: son dos cosas distintas y no se mezclan. Por eso no pide nada al
 * servidor ni decide quién lo ve: la pantalla que lo monta ya pasó por la puerta del módulo y ya tiene los indicadores que le
 * corresponden a quien mira (la base los recortó). Los años que se eligen aquí son SOLO de este panel; los de la pantalla (las
 * tarjetas, el selector de año) siguen siendo de lo que hay debajo.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  PARTES, ROTULO_DE_PARTE, aniosIniciados, cumplimientoDe, pctLegible, rotuloDeAnios, type DatosCumplimiento,
} from '@/lib/pdm/graficos'
import { HREF_REPORTES, HREF_RESPONSABLES } from '@/lib/pdm/menu'
import { MarcadorDeParte } from './Barras'
import BarrasCumplimiento from './BarrasCumplimiento'
import Torta from './Torta'
import { Panel } from './ui'
import { T } from './tema'
import { pctDe, TRAMOS } from './cumplimiento-tema'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Los años que se pueden elegir, como botones: uno, varios o «Todos». Siempre queda al menos uno elegido. */
function SelectorDeAnios({ iniciados, elegidos, onCambiar }: {
  iniciados: number[]
  elegidos: number[]
  onCambiar: (anios: number[]) => void
}) {
  if (iniciados.length < 2) return null
  const todos = elegidos.length === iniciados.length
  const alternar = (a: number) => {
    if (!elegidos.includes(a)) return onCambiar([...elegidos, a].sort((x, y) => x - y))
    // Nunca se queda sin ningún año: un diagrama de nada no le sirve a nadie.
    if (elegidos.length > 1) onCambiar(elegidos.filter(x => x !== a))
  }
  // Los mismos botones que el selector de año del módulo (ver `SelectorAnio`), aquí con selección múltiple.
  const base = 'rounded-md border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-1'
  const puesto = 'border-[#192031] bg-[#192031] text-white'
  const libre = 'border-[#C5CBD6] bg-white text-[#556072] hover:border-[#192031] hover:text-[#192031]'
  return (
    <div role="group" aria-labelledby="pdm-cumplimiento-anios" className="flex flex-wrap items-center gap-2">
      <span id="pdm-cumplimiento-anios" className={`${T.rotulo} mr-1`}>Años</span>
      {iniciados.map(a => (
        <button key={a} type="button" aria-pressed={elegidos.includes(a)} onClick={() => alternar(a)} className={`${base} ${elegidos.includes(a) ? puesto : libre}`}>
          {a}
        </button>
      ))}
      <button type="button" aria-pressed={todos} onClick={() => onCambiar(iniciados)} className={`${base} ${todos ? puesto : libre}`}>
        Todos
      </button>
    </div>
  )
}

/** Lo que le toca hacer a quien mira, con un enlace a donde se hace. Si no hay nada pendiente, no se pinta. */
function Pendiente({ datos, c, unidad }: { datos: DatosCumplimiento; c: ReturnType<typeof cumplimientoDe>; unidad: (n: number) => string }) {
  let texto: React.ReactNode = null
  let href = ''
  let accion = ''
  if (datos.alcance === 'plan' && c.sinResponsable > 0) {
    texto = <><b className="tabular-nums">{c.sinResponsable}</b> {unidad(c.sinResponsable)} no {c.sinResponsable === 1 ? 'tiene' : 'tienen'} responsable.</>
    href = HREF_RESPONSABLES
    accion = 'Asignar'
  } else if (datos.alcance === 'secretaria' && c.porValidar > 0) {
    texto = <><b className="tabular-nums">{plural(c.porValidar, 'reporte espera', 'reportes esperan')}</b> tu validación.</>
    href = HREF_REPORTES
    accion = 'Validar'
  }
  // Al contratista no se le dice qué le falta aquí: la misma pantalla lo lista debajo («Te toca reportar»).
  if (texto === null) return null
  return (
    <div className={`mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ${T.avisoNota}`}>
      <p>{texto}</p>
      <Link href={href} className={T.enlace}>{accion} →</Link>
    </div>
  )
}

/**
 * En qué punto del reporte están las metas de los años elegidos: lo aprobado y lo que falta por hacer. Es lo accionable de la
 * secretaría (qué espera su validación) y del contratista (qué le falta reportar o corregir). Los mismos cinco puntos y colores que
 * usa el resto del módulo; «sin responsable» solo se nombra cuando hay alguno, porque a quien mira casi nunca le toca.
 */
function EstadoDeReportes({ c }: { c: ReturnType<typeof cumplimientoDe> }) {
  const filas = PARTES.filter(p => p !== 'sinResponsable' || c[p] > 0)
  return (
    <div className="min-w-0">
      <h4 className={`mb-3 ${T.rotulo}`}>Estado de los reportes</h4>
      <span aria-hidden className="flex h-2 w-full gap-px overflow-hidden rounded-[3px] bg-[#E6E9EF]">
        {PARTES.map(p => (
          <span
            key={p}
            className={`block h-full transition-[flex-grow] duration-500 ease-out motion-reduce:transition-none ${
              p === 'aprobados' ? 'bg-[#2E7D5B]' : p === 'porValidar' ? 'bg-[#B7791F]' : p === 'devueltos' ? 'bg-[#B42318]'
              : p === 'sinResponsable' ? 'bg-[repeating-linear-gradient(135deg,#AEB6C4_0_2px,#EEF0F4_2px_4px)]' : ''
            }`}
            style={{ flexGrow: c[p], flexBasis: 0, minWidth: c[p] > 0 ? 2 : 0 }}
          />
        ))}
      </span>
      <ul className={`mt-3 divide-y ${T.divide}`}>
        {filas.map(p => (
          <li key={p} className="flex items-center gap-2.5 py-2 text-sm">
            <MarcadorDeParte parte={p} />
            <span className={`min-w-0 flex-1 ${T.suave}`}>{ROTULO_DE_PARTE[p]}</span>
            <b className={`font-semibold tabular-nums ${c[p] === 0 ? 'text-[#667085]' : 'text-[#192031]'}`}>{c[p]}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function CumplimientoPdm({ datos, anioInicial }: {
  datos: DatosCumplimiento
  /** El año con que se abre (el de la pantalla). Si no ha empezado o no es del plan, el último que empezó. */
  anioInicial?: number
}) {
  const iniciados = aniosIniciados(datos.anioActual)
  const [elegidos, setElegidos] = useState<number[]>(() => {
    if (iniciados.length === 0) return []
    return [anioInicial !== undefined && iniciados.includes(anioInicial) ? anioInicial : iniciados[iniciados.length - 1]]
  })
  const [resaltado, setResaltado] = useState<string | null>(null)

  if (iniciados.length === 0) return null

  const c = cumplimientoDe(datos.total, elegidos)
  const rotulo = rotuloDeAnios(c.anios, datos.anioActual)
  const variosAnios = c.anios.length > 1
  const unidad = (n: number) => (variosAnios ? (n === 1 ? 'meta anual' : 'metas anuales') : (n === 1 ? 'indicador con meta' : 'indicadores con meta'))
  const de = datos.alcance === 'plan' ? 'Todas las secretarías'
    : datos.alcance === 'secretaria' ? (datos.secretaria ?? '')
    : 'Los indicadores a tu cargo'

  const centro = c.pctCumplido === null ? '—' : pctLegible(c.pctCumplido)
  const descripcion = c.total === 0
    ? `Sin metas en ${rotulo}`
    : `Cumplimiento en ${rotulo}: ${c.cumplidos} cumplidas, ${c.parciales} en avance y ${c.sinAvance} sin avance, de ${c.total}`

  const filas = datos.porSecretaria.map(g => ({ nombre: g.nombre, c: cumplimientoDe(g.porAnio, elegidos) }))

  const torta = (
    <div className={`flex flex-col items-center gap-5 ${datos.alcance === 'plan' ? 'sm:flex-row lg:flex-col' : 'sm:flex-row'}`}>
      <Torta
        tramos={TRAMOS.map(t => ({ clave: t.clave, etiqueta: t.etiqueta, valor: c[t.clave], color: t.color }))}
        centro={centro}
        nota={c.total === 0 ? 'sin metas' : c.pctCumplido === null ? 'sin avances validados' : 'cumplido'}
        descripcion={descripcion}
        resaltado={resaltado}
        onResaltar={setResaltado}
      />
      <div className="w-full min-w-0 max-w-xs">
        <ul className={`divide-y ${T.divide}`}>
          {TRAMOS.map(t => (
            <li
              key={t.clave}
              onMouseEnter={() => setResaltado(t.clave)}
              onMouseLeave={() => setResaltado(null)}
              className="flex items-center gap-2.5 py-2 text-sm"
            >
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: t.color }} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-tight text-[#192031]">{t.etiqueta}</span>
                <span className="block text-xs leading-snug text-[#667085]">{t.detalle}</span>
              </span>
              <span className="text-right">
                <b className="block font-semibold tabular-nums text-[#192031]">{c[t.clave]}</b>
                <span className="block text-xs tabular-nums text-[#667085]">{c.total > 0 ? `${pctDe(c[t.clave], c.total)} %` : '—'}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-snug text-[#667085]">
          {c.total === 0 ? `Sin metas en ${rotulo}.` : `${plural(c.total, unidad(1), unidad(2))} en ${rotulo}.`}
        </p>
      </div>
    </div>
  )

  return (
    <Panel titulo="Cumplimiento" nota={de}>
      <SelectorDeAnios iniciados={iniciados} elegidos={c.anios} onCambiar={setElegidos} />

      {datos.alcance === 'plan' ? (
        <div className="mt-5 grid gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
          {torta}
          <div className="min-w-0">
            <h4 className={`mb-3 ${T.rotulo}`}>Por secretaría</h4>
            <BarrasCumplimiento filas={filas} resaltado={resaltado} />
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-x-10 gap-y-7 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
          {torta}
          {c.total > 0 && <EstadoDeReportes c={c} />}
        </div>
      )}

      {variosAnios && (
        <p className="mt-4 text-xs leading-snug text-[#667085]">
          Con varios años, cada indicador cuenta una vez por cada año en que tiene meta, contra la meta de ese año.
        </p>
      )}

      <Pendiente datos={datos} c={c} unidad={unidad} />
    </Panel>
  )
}
