'use client'

/**
 * Las tres respuestas con que abre el tablero del secretario:
 *
 *   1. Cómo va SU secretaría (el anillo del cumplimiento y el estado de sus reportes).
 *   2. Cómo va el plan de la Alcaldía (el mismo anillo sobre todas las secretarías) y cuánto pesa la suya.
 *   3. Cómo va su secretaría frente a las otras (una barra por secretaría, de las que solo se ven NÚMEROS).
 *
 * Reglas de medición (ver `lib/pdm/tablero.ts`): cada año contra su meta; solo cuenta lo aprobado; sin ningún avance validado el
 * anillo dice «—» y no «0 %»; con menos de cinco metas se muestra la cifra y no el porcentaje; las secretarías van por tamaño y
 * nunca por avance.
 */

import { useState } from 'react'
import {
  TRAMOS_DE_CUMPLIMIENTO, centroDeAnillo, hayQueMedir, nombreCorto, pctEntero, sumarCifras, textoDeFila, valorDeTramo,
  type CifrasDeAnio, type FilaDeComparacion, type MedidaDelTablero, type TramoDeCumplimiento,
} from '@/lib/pdm/tablero'
import { Panel } from '../ui'
import Torta, { type TramoTorta } from '../Torta'
import { TRAMOS } from '../cumplimiento-tema'
import { T } from '../tema'
import {
  Contador, LeyendaDeEstados, LeyendaDeMedida, MarcaTramo, PistaApilada, descripcionDeCumplimiento, descripcionDeReportes, fmt,
  segmentosDeCumplimiento, segmentosDeReportes, useListo,
} from './Piezas'
import { useContador } from './useContador'

const ROTULO_TRAMO: Record<TramoDeCumplimiento, string> = { cumplidos: 'cumplidos', parciales: 'en avance', sinAvance: 'sin avance' }

/** El anillo del cumplimiento con su centro que cuenta, y la leyenda que reacciona al pasar sobre un tramo. */
export function AnilloDeCumplimiento({ c, anioActual, nota, tamano, conDetalle, grande = false }: {
  c: CifrasDeAnio
  anioActual: number
  /** Lo que dice el centro mientras no se señala un tramo. */
  nota: string
  tamano?: string
  conDetalle: boolean
  /** Para las láminas de la presentación: letras y cifras que se leen desde lejos, y la leyenda siempre al lado del anillo. */
  grande?: boolean
}) {
  const listo = useListo()
  const [resaltado, setResaltado] = useState<TramoDeCumplimiento | null>(null)
  const medible = hayQueMedir(c, anioActual)
  const { pct } = centroDeAnillo(c)
  const pctContado = useContador(pct ?? 0)
  const tramos: TramoTorta[] = TRAMOS.map(t => ({ clave: t.clave, etiqueta: t.etiqueta, color: t.color, valor: listo && medible ? valorDeTramo(c, t.clave) : 0 }))
  const enfocado = resaltado ?? null
  const centro = enfocado ? fmt(valorDeTramo(c, enfocado)) : pct === null ? '—' : `${Math.round(pctContado)} %`
  const notaCentro = enfocado
    ? ROTULO_TRAMO[enfocado]
    : !medible ? (c.conMeta === 0 ? 'sin metas' : 'año por empezar') : pct === null ? 'sin avances validados' : nota
  const descripcion = medible
    ? `Cumplimiento de ${c.anio}: ${descripcionDeCumplimiento(c)}, de ${c.conMeta} indicadores con meta${pct === null ? ' (todavía sin avances validados)' : ''}`
    : `Cumplimiento de ${c.anio}: ${c.conMeta === 0 ? 'ningún indicador tiene meta' : 'el año todavía no empieza'}`
  const g = grande
  return (
    <div className={g ? 'flex items-center gap-14' : 'flex flex-wrap items-center gap-x-6 gap-y-4'}>
      <Torta
        tramos={tramos} centro={centro} nota={notaCentro} descripcion={descripcion} tamano={tamano}
        resaltado={enfocado} onResaltar={k => setResaltado(k as TramoDeCumplimiento | null)}
      />
      <ul className={`grid flex-1 ${g ? 'min-w-0 gap-2' : 'min-w-[10.5rem] gap-0.5'}`}>
        {TRAMOS_DE_CUMPLIMIENTO.map(k => {
          const t = TRAMOS.find(x => x.clave === k)!
          const v = valorDeTramo(c, k)
          return (
            <li
              key={k}
              onMouseEnter={() => setResaltado(k)} onMouseLeave={() => setResaltado(null)}
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center rounded-md transition-colors ${g ? 'gap-4 px-3 py-2.5' : 'gap-2 px-1.5 py-1.5'} ${enfocado === k ? 'bg-[#F4F5F8]' : ''}`}
            >
              <MarcaTramo tramo={k} grande={g} />
              <span className={`min-w-0 leading-tight text-[#192031] ${g ? 'text-[24px]' : 'text-[13px]'}`}>
                {t.etiqueta}
                {conDetalle && <span className={`block leading-snug text-[#556072] ${g ? 'mt-0.5 text-[16px]' : 'text-[11px]'}`}>{t.detalle}</span>}
              </span>
              <Contador valor={medible ? v : 0} className={`font-semibold text-[#192031] ${g ? 'text-[40px] leading-none' : 'text-[15px]'}`} />
              {/* Sin ningún avance validado, «0 %» sonaría a un plan que no cumple cuando aún no se mide: solo «sin avance» (el resto) lleva porcentaje. */}
              <span className={`text-right tabular-nums text-[#556072] ${g ? 'min-w-[4.4ch] text-[22px]' : 'min-w-[3.2ch] text-xs'}`}>{medible && (c.conAvance > 0 || k === 'sinAvance') ? `${pctEntero(v, c.conMeta)} %` : '—'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── 1 · Tu secretaría ────────────────────────────────────────────────────────

export function PanelTuSecretaria({ c, anioActual }: { c: CifrasDeAnio; anioActual: number }) {
  const conReportes = hayQueMedir(c, anioActual)
  return (
    <Panel titulo={`Tu secretaría · ${c.anio}`} className="h-full">
      <AnilloDeCumplimiento c={c} anioActual={anioActual} nota="llegaron a su meta" conDetalle />
      <div className="mt-5 border-t border-[#E6E9EF] pt-4">
        <p className={`${T.rotulo} mb-2`}>Estado de los reportes</p>
        <PistaApilada segmentos={conReportes ? segmentosDeReportes(c) : []} alta descripcion={conReportes ? descripcionDeReportes(c) : 'Sin reportes que contar'} />
        <LeyendaDeEstados c={conReportes ? c : { ...c, aprobados: 0, porValidar: 0, devueltos: 0, faltan: 0, sinResponsable: 0 }} />
      </div>
    </Panel>
  )
}

// ─── 2 · La Alcaldía ──────────────────────────────────────────────────────────

const COLOR_DE_COMPOSICION = ['#9AA3B5', '#C5CBD6', '#DDE1E9', '#E9ECF2']

export function PanelAlcaldia({ comparacion, anio, anioActual }: { comparacion: FilaDeComparacion[] | null; anio: number; anioActual: number }) {
  if (!comparacion) {
    return (
      <Panel titulo={`La Alcaldía · ${anio}`} className="h-full">
        <NoDisponible>No se pudo leer el plan de las otras secretarías. Tu secretaría sí se ve completa.</NoDisponible>
      </Panel>
    )
  }
  const plan = sumarCifras(anio, comparacion.map(f => f.cifras))
  const propia = comparacion.find(f => f.propia)!
  let otro = 0
  const segmentos = comparacion.map(f => ({
    clave: f.nombre, valor: f.cifras.conMeta, color: f.propia ? '#192031' : COLOR_DE_COMPOSICION[Math.min(otro++, COLOR_DE_COMPOSICION.length - 1)],
    titulo: `${nombreCorto(f.nombre)}: ${fmt(f.cifras.conMeta)} de ${fmt(plan.conMeta)} indicadores con meta`,
  }))
  return (
    <Panel titulo={`La Alcaldía · ${anio}`} className="h-full">
      <AnilloDeCumplimiento c={plan} anioActual={anioActual} nota="del plan" tamano="h-[132px] w-[132px]" conDetalle={false} />
      <div className="mt-4">
        <PistaApilada segmentos={segmentos} descripcion={`Indicadores con meta por secretaría: ${comparacion.map(f => `${nombreCorto(f.nombre)} ${f.cifras.conMeta}`).join(', ')}`} />
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[#556072]">
          {comparacion.map(f => (
            <li key={f.nombre} className={f.propia ? 'font-semibold text-[#192031]' : ''}>{nombreCorto(f.nombre)} <span className="tabular-nums font-semibold text-[#192031]">{fmt(f.cifras.conMeta)}</span></li>
          ))}
        </ul>
        <p className={`mt-3 text-xs leading-relaxed ${T.suave}`}>
          Tu secretaría aporta <b className="font-semibold text-[#192031]">{fmt(propia.cifras.conMeta)} de {fmt(plan.conMeta)}</b> indicadores con meta del plan
          ({pctEntero(propia.cifras.conMeta, plan.conMeta)} %).
        </p>
      </div>
    </Panel>
  )
}

// ─── 3 · Frente a las otras secretarías ───────────────────────────────────────

export function NoDisponible({ children }: { children: string }) {
  return <p className={`rounded-lg border border-dashed border-[#C5CBD6] px-4 py-6 text-center text-sm ${T.suave}`}>{children}</p>
}

/** Una fila de comparación: el nombre y cuántas metas, la pista y la cifra. Sirve igual para secretarías y para sectores. */
export function FilaComparada({ nombre, titulo, cifras, medida, propia = false, escalon, tag, grande = false }: {
  nombre: string
  titulo?: string
  cifras: CifrasDeAnio
  medida: MedidaDelTablero
  propia?: boolean
  escalon: number
  tag?: string
  /** Para las láminas de la presentación: siempre en tres columnas (no depende del ancho de la ventana) y con letras de proyección. */
  grande?: boolean
}) {
  const { valor, nota } = textoDeFila(cifras, medida)
  const segmentos = medida === 'cumplimiento' ? segmentosDeCumplimiento(cifras) : segmentosDeReportes(cifras)
  const descripcion = `${nombre}: ${medida === 'cumplimiento' ? descripcionDeCumplimiento(cifras) : descripcionDeReportes(cifras)}, de ${cifras.conMeta} indicadores con meta`
  const g = grande
  return (
    <li
      className={g
        ? `relative grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_auto] items-center gap-x-9 rounded-lg py-2.5 pl-6 pr-4 ${propia ? 'bg-[#F4F5F8]' : ''}`
        : `relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-md py-2 pl-3 pr-2 sm:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)_auto] sm:gap-x-4 ${propia ? 'bg-[#F4F5F8]' : ''}`}
    >
      {propia && <span aria-hidden className={`absolute left-0 rounded-sm bg-[#192031] ${g ? 'bottom-3 top-3 w-1' : 'bottom-2 top-2 w-[3px]'}`} />}
      <div className="min-w-0">
        <p className={`flex min-w-0 items-center leading-snug text-[#192031] ${g ? 'gap-2.5 text-[24px]' : 'gap-1.5 text-[13px]'} ${propia ? 'font-bold' : 'font-medium'}`} title={titulo ?? nombre}>
          {/* En la presentación el nombre se parte en dos líneas: un nombre de sector cortado con «…» no se entiende desde el fondo de una sala. */}
          <span className={g ? 'min-w-0 [text-wrap:balance]' : 'truncate'}>{nombre}</span>
          {tag && <span className={`shrink-0 rounded border border-[#192031] px-1 font-bold uppercase tracking-wider ${g ? 'text-[14px] leading-6' : 'text-[10px] leading-4'}`}>{tag}</span>}
        </p>
        <p className={`leading-snug text-[#556072] ${g ? 'text-[17px]' : 'text-[11px]'}`}>{fmt(cifras.conMeta)} {cifras.conMeta === 1 ? 'indicador' : 'indicadores'} con meta</p>
      </div>
      <p className={`row-start-1 text-right font-semibold leading-tight tabular-nums text-[#192031] ${g ? 'col-start-3 min-w-[7ch] text-[32px]' : 'min-w-[5.2ch] text-sm sm:col-start-3'}`}>
        {valor}
        {nota && <span className={`block font-normal text-[#556072] ${g ? 'text-[16px]' : 'text-[11px]'}`}>{nota}</span>}
      </p>
      <div className={g ? 'col-start-2 row-start-1' : 'col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1'}>
        <PistaApilada segmentos={segmentos} descripcion={descripcion} escalon={escalon} altura={g ? 'h-6' : undefined} />
      </div>
    </li>
  )
}

export function PanelComparacion({ comparacion, medida }: { comparacion: FilaDeComparacion[] | null; medida: MedidaDelTablero }) {
  if (!comparacion) {
    return (
      <Panel titulo="Frente a las otras secretarías" className="h-full">
        <NoDisponible>La comparación no está disponible en este momento. Vuelve a intentarlo en unos minutos.</NoDisponible>
      </Panel>
    )
  }
  const chica = comparacion.find(f => f.cifras.conMeta > 0 && f.cifras.conMeta < 5)
  return (
    <Panel titulo="Frente a las otras secretarías" className="h-full">
      <ul className="-mx-1 grid gap-0.5">
        {comparacion.map((f, i) => (
          <FilaComparada key={f.nombre} nombre={nombreCorto(f.nombre)} titulo={f.nombre} cifras={f.cifras} medida={medida} propia={f.propia} escalon={i} tag={f.propia ? 'Tú' : undefined} />
        ))}
      </ul>
      <LeyendaDeMedida medida={medida} />
      <p className={`mt-3 text-xs leading-relaxed ${T.suave}`}>
        Se ordenan por cuántos indicadores tienen, no por su avance. De las otras secretarías solo se ven números.
        {chica && ` ${nombreCorto(chica.nombre)} tiene ${fmt(chica.cifras.conMeta)}: con tan pocas metas un solo indicador mueve todo el porcentaje, así que se muestra la cifra.`}
      </p>
    </Panel>
  )
}

