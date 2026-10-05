'use client'

/**
 * El cumplimiento del Plan de Desarrollo en el panel de inicio de cada rol.
 *
 *   · Administrador (y Control Interno): la torta del plan entero y una barra por secretaría.
 *   · Secretaría (secretario de despacho): la torta de SU secretaría.
 *   · Contratista: la torta de los indicadores que tiene a su cargo.
 *
 * Todos con el mismo selector de años (uno, varios o todos) y la misma regla: cumplido, en avance o sin avance, sobre las metas
 * de los años elegidos (ver `cumplimientoDe`). Es un reparto de hechos y solo cuenta lo que la secretaría aprobó.
 *
 * ── Cuándo aparece ───────────────────────────────────────────────────────
 *
 * Solo donde el módulo existe y para quien tiene acceso a él: como el botón de la barra lateral, en producción NO se pregunta
 * nada (`MARCO_PDM_DISPONIBLE` es falso y la consulta ni se lanza). Reutiliza la consulta del nivel de acceso de la barra
 * (`['pdm-acceso']`), así que no cuesta una petición más: mientras no se sabe si hay acceso, o si no lo hay, no se pinta nada,
 * y con acceso se reserva el alto con un esqueleto para que lo de abajo no salte cuando llegan las cifras.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { nivelPdm } from '@/app/actions/pdm'
import { cumplimientoPdm } from '@/app/actions/pdm-cumplimiento'
import { conLimite } from '@/lib/con-limite'
import { useUsuario } from '@/lib/user-context'
import {
  PARTES, ROTULO_DE_PARTE, aniosIniciados, cumplimientoDe, pctLegible, rotuloDeAnios, type DatosCumplimiento,
} from '@/lib/pdm/graficos'
import { PLAN } from '@/lib/pdm/identidad'
import { HREF_RESPONSABLES, HREF_REPORTES, ITEM_PLAN_DESARROLLO, MARCO_PDM_DISPONIBLE } from '@/lib/pdm/menu'
import { MarcadorDeParte } from './Barras'
import BarrasCumplimiento from './BarrasCumplimiento'
import Torta from './Torta'
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
  const base = 'rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1'
  const puesto = 'border-gray-900 bg-gray-900 text-white'
  const libre = 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900'
  return (
    <div role="group" aria-label="Años que se muestran" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs text-gray-500">Años</span>
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
  let href = ITEM_PLAN_DESARROLLO.href
  let accion = 'Ver el plan'
  if (datos.alcance === 'plan' && c.sinResponsable > 0) {
    texto = <><b className="tabular-nums">{c.sinResponsable}</b> {unidad(c.sinResponsable)} no {c.sinResponsable === 1 ? 'tiene' : 'tienen'} responsable.</>
    href = HREF_RESPONSABLES
    accion = 'Asignar'
  } else if (datos.alcance === 'secretaria' && c.porValidar > 0) {
    texto = <><b className="tabular-nums">{plural(c.porValidar, 'reporte espera', 'reportes esperan')}</b> tu validación.</>
    href = HREF_REPORTES
    accion = 'Validar'
  } else if (datos.alcance === 'mios' && (c.faltan > 0 || c.devueltos > 0)) {
    const partes = [c.faltan > 0 && `${c.faltan} por reportar`, c.devueltos > 0 && `${plural(c.devueltos, 'devuelto', 'devueltos')} para corregir`].filter(Boolean)
    texto = <b className="tabular-nums">{partes.join(' · ')}</b>
    accion = 'Ir a mi trabajo'
  }
  if (texto === null) return null
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-gray-50 px-4 py-2.5 text-sm text-gray-700">
      <p>{texto}</p>
      <Link href={href} className="text-sm font-semibold text-gray-900 underline decoration-gray-300 underline-offset-2 transition-colors hover:decoration-gray-900">{accion} →</Link>
    </div>
  )
}

/**
 * En qué punto del reporte están las metas de los años elegidos: lo aprobado y lo que falta por hacer. Es lo accionable de la
 * secretaría (qué espera su validación) y del contratista (qué le falta reportar o corregir). Los mismos cinco puntos y colores que
 * usa el módulo; «sin responsable» solo se nombra cuando hay alguno, porque a quien mira casi nunca le toca.
 */
function EstadoDeReportes({ c }: { c: ReturnType<typeof cumplimientoDe> }) {
  const filas = PARTES.filter(p => p !== 'sinResponsable' || c[p] > 0)
  return (
    <div className="min-w-0">
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Estado de los reportes</h4>
      <span aria-hidden className="flex h-2.5 w-full gap-px overflow-hidden rounded-[4px] bg-gray-100">
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
      <ul className="mt-3 divide-y divide-gray-100">
        {filas.map(p => (
          <li key={p} className="flex items-center gap-2.5 py-2 text-sm">
            <MarcadorDeParte parte={p} />
            <span className="min-w-0 flex-1 text-gray-700">{ROTULO_DE_PARTE[p]}</span>
            <b className={`font-semibold tabular-nums ${c[p] === 0 ? 'text-gray-500' : 'text-gray-900'}`}>{c[p]}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** El diagrama, a partir de las cuentas ya leídas. De presentación y estado propio (los años elegidos); no pide nada. */
export function CumplimientoVista({ datos }: { datos: DatosCumplimiento }) {
  const iniciados = aniosIniciados(datos.anioActual)
  // Al entrar, el año en curso (o el último que haya empezado).
  const [elegidos, setElegidos] = useState<number[]>(() => (iniciados.length ? [iniciados[iniciados.length - 1]] : []))
  const [resaltado, setResaltado] = useState<string | null>(null)

  if (iniciados.length === 0) return null

  const c = cumplimientoDe(datos.total, elegidos)
  const rotulo = rotuloDeAnios(c.anios, datos.anioActual)
  const variosAnios = c.anios.length > 1
  const unidad = (n: number) => (variosAnios ? (n === 1 ? 'meta anual' : 'metas anuales') : (n === 1 ? 'indicador con meta' : 'indicadores con meta'))
  // Un mismo título para los tres roles; lo que cambia es de QUIÉN habla.
  const subtitulo = datos.alcance === 'plan' ? `«${PLAN.nombre}» · todas las secretarías`
    : datos.alcance === 'secretaria' ? (datos.secretaria ?? '')
    : 'Los indicadores a tu cargo'

  const centro = c.pctCumplido === null ? '—' : pctLegible(c.pctCumplido)
  const descripcion = c.total === 0
    ? `Sin metas en ${rotulo}`
    : `Cumplimiento en ${rotulo}: ${c.cumplidos} cumplidas, ${c.parciales} en avance y ${c.sinAvance} sin avance, de ${c.total}`

  const filas = datos.porSecretaria.map(g => ({ nombre: g.nombre, c: cumplimientoDe(g.porAnio, elegidos) }))

  const torta = (
    <div className={`flex flex-col items-center gap-5 ${datos.alcance === 'plan' ? 'sm:flex-row lg:flex-col lg:items-center' : 'sm:flex-row'}`}>
      <Torta
        tramos={TRAMOS.map(t => ({ clave: t.clave, etiqueta: t.etiqueta, valor: c[t.clave], color: t.color }))}
        centro={centro}
        nota={c.total === 0 ? 'sin metas' : c.pctCumplido === null ? 'sin avances validados' : 'cumplido'}
        descripcion={descripcion}
        resaltado={resaltado}
        onResaltar={setResaltado}
      />
      <div className="w-full min-w-0 max-w-xs">
        <ul className="divide-y divide-gray-100">
          {TRAMOS.map(t => (
            <li
              key={t.clave}
              onMouseEnter={() => setResaltado(t.clave)}
              onMouseLeave={() => setResaltado(null)}
              className="flex items-center gap-2.5 py-2 text-sm"
            >
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: t.color }} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-tight text-gray-900">{t.etiqueta}</span>
                <span className="block text-xs leading-snug text-gray-500">{t.detalle}</span>
              </span>
              <span className="text-right">
                <b className="block font-semibold tabular-nums text-gray-900">{c[t.clave]}</b>
                <span className="block text-xs tabular-nums text-gray-500">{c.total > 0 ? `${pctDe(c[t.clave], c.total)} %` : '—'}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-snug text-gray-500">
          {c.total === 0 ? `Sin metas en ${rotulo}.` : `${plural(c.total, unidad(1), unidad(2))} en ${rotulo}.`}
        </p>
      </div>
    </div>
  )

  return (
    <section aria-labelledby="pdm-cumplimiento-titulo" className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h3 id="pdm-cumplimiento-titulo" className="text-sm font-semibold text-gray-900">Cumplimiento del {PLAN.denominacion}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{subtitulo}</p>
        </div>
        <Link href={ITEM_PLAN_DESARROLLO.href} className="shrink-0 text-xs font-semibold text-gray-700 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-900 hover:decoration-gray-900">
          Ver el plan →
        </Link>
      </div>

      <div className="mt-4"><SelectorDeAnios iniciados={iniciados} elegidos={c.anios} onCambiar={setElegidos} /></div>

      {datos.alcance === 'plan' ? (
        <div className="mt-5 grid gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
          {torta}
          <div className="min-w-0">
            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Por secretaría</h4>
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
        <p className="mt-4 text-xs leading-snug text-gray-500">
          Con varios años, cada indicador cuenta una vez por cada año en que tiene meta, contra la meta de ese año.
        </p>
      )}

      <Pendiente datos={datos} c={c} unidad={unidad} />
    </section>
  )
}

function Esqueleto() {
  return (
    <div role="status" aria-busy="true" className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5">
      <span className="sr-only">Cargando el cumplimiento del plan…</span>
      <div className="h-4 w-56 rounded bg-gray-200" />
      <div className="mt-2 h-3 w-40 rounded bg-gray-100" />
      <div className="mt-5 h-6 w-64 rounded-full bg-gray-100" />
      <div className="mt-5 flex items-center gap-5">
        <div className="h-[168px] w-[168px] shrink-0 rounded-full bg-gray-100" />
        <div className="hidden flex-1 space-y-3 sm:block">{[0, 1, 2].map(i => <div key={i} className="h-9 max-w-xs rounded bg-gray-100" />)}</div>
      </div>
    </div>
  )
}

export default function CumplimientoPdm() {
  const { usuario } = useUsuario()

  // La misma consulta que la barra lateral (mismo `queryKey` y mismas opciones): no cuesta una petición más.
  const { data: nivel } = useQuery({
    queryKey: ['pdm-acceso'],
    queryFn: () => nivelPdm(),
    enabled: MARCO_PDM_DISPONIBLE && !!usuario,
    staleTime: Infinity,
    retry: false,
  })

  const { data, isError, refetch, isFetching } = useQuery({
    queryKey: ['pdm-cumplimiento', usuario?.id],
    // En flecha, no directa: react-query le pasa su contexto interno a queryFn y una acción del servidor no puede recibirlo.
    queryFn: () => conLimite(cumplimientoPdm(), 'cumplimiento del plan'),
    enabled: MARCO_PDM_DISPONIBLE && !!usuario && nivel != null,
    staleTime: 5 * 60_000,
    retry: false,
  })

  if (!MARCO_PDM_DISPONIBLE || nivel == null) return null
  if (isError || data?.estado === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">
        <p className="text-sm text-gray-600">No se pudo cargar el cumplimiento del Plan de Desarrollo.</p>
        <button
          type="button"
          onClick={() => { refetch() }}
          disabled={isFetching}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {isFetching ? 'Reintentando…' : 'Reintentar'}
        </button>
      </div>
    )
  }
  if (data === undefined) return <Esqueleto />
  if (data === null) return null
  return <CumplimientoVista datos={data.datos} />
}
