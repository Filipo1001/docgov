'use client'

/**
 * Lo que hay debajo de las tres respuestas del tablero: lo que necesita atención, el avance por sector, el ritmo del año y el
 * equipo, más la explicación de cómo se calcula todo.
 *
 * El equipo se mide por GESTIÓN (qué falta reportar, qué espera validación, qué devolvieron), no por resultados, y va por nombre:
 * no hay puestos ni podio. El ritmo solo existe desde que abrió el módulo: lo histórico de 2024 y 2025 se cargó de una vez y no
 * tiene fechas de trabajo reales.
 */

import { useState } from 'react'
import Link from 'next/link'
import { HREF_INDICADORES, HREF_RESPONSABLES } from '@/lib/pdm/menu'
import { iniciales } from '@/lib/pdm/personas'
import {
  etiquetaDeSemana, filtrarEquipo, techoDelEje,
  type ClaveDeAtencion, type FiltroDeEquipo, type ItemDeAtencion, type MedidaDelTablero, type PersonaDeEquipo, type SectorDeCifras, type SemanaDeRitmo,
} from '@/lib/pdm/tablero'
import { MarcadorDeParte } from '../Barras'
import { Marcador, Panel } from '../ui'
import { T } from '../tema'
import { FilaComparada, NoDisponible } from './PanelesPrincipales'
import { Contador, LeyendaDeMedida, PistaApilada, RELLENO_ESTADO, fmt, useListo } from './Piezas'

// ─── Necesita tu atención ─────────────────────────────────────────────────────

const ENLACE_DE: Record<ClaveDeAtencion, (anio: number) => string> = {
  porValidar: a => `${HREF_INDICADORES}?filtro=por_validar&anio=${a}`,
  sinResponsable: a => `${HREF_INDICADORES}?filtro=sin_responsable&anio=${a}`,
  sinAcceso: () => HREF_RESPONSABLES,
  devueltos: a => `${HREF_INDICADORES}?filtro=por_reportar&anio=${a}`,
  faltan: a => `${HREF_INDICADORES}?filtro=por_reportar&anio=${a}`,
}

function MarcaDeAtencion({ clave }: { clave: ClaveDeAtencion }) {
  if (clave === 'sinAcceso') return <Marcador clase="" hueco />
  return <MarcadorDeParte parte={clave} />
}

export function PanelAtencion({ items, anio }: { items: ItemDeAtencion[]; anio: number }) {
  return (
    <Panel titulo="Necesita tu atención" className="h-full">
      <ul>
        {items.map(it => {
          const alDia = it.cantidad === 0
          return (
            <li key={it.clave} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-[#E6E9EF] py-3 first:border-t-0 first:pt-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <Contador valor={it.cantidad} className={`min-w-[2.4ch] text-right text-[28px] font-semibold leading-none tracking-tight ${alDia ? 'font-medium text-[#667085]' : 'text-[#192031]'}`} />
              <div className="min-w-0">
                <p className={`flex items-center gap-2 text-[13px] leading-snug ${alDia ? 'font-medium text-[#556072]' : 'font-semibold text-[#192031]'}`}>
                  <MarcaDeAtencion clave={it.clave} />
                  {it.titulo}
                  {alDia && <span className="shrink-0 text-[11px] font-semibold text-[#2E7D5B]">Al día</span>}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-[#556072]">{it.ayuda}</p>
              </div>
              {!alDia && (
                <Link href={ENLACE_DE[it.clave](anio)} className={`${T.botonSecChico} col-start-2 justify-self-start sm:col-start-3`}>{it.accion}</Link>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

// ─── Por sector ───────────────────────────────────────────────────────────────

export function PanelSectores({ sectores, anio, medida }: { sectores: SectorDeCifras[]; anio: number; medida: MedidaDelTablero }) {
  return (
    <Panel titulo={`Por sector · ${anio}`} className="h-full">
      {sectores.length === 0
        ? <NoDisponible>Esta secretaría no tiene indicadores con meta en este año.</NoDisponible>
        : (
          <>
            <ul className="-mx-1 grid gap-0.5">
              {sectores.map((s, i) => <FilaComparada key={s.nombre} nombre={s.nombre} cifras={s.cifras} medida={medida} escalon={i} />)}
            </ul>
            <LeyendaDeMedida medida={medida} />
            <p className={`mt-3 text-xs leading-relaxed ${T.suave}`}>
              Cada sector cuenta solo sus indicadores con meta en el año. Se ordenan por cuántos indicadores tienen, no por su avance.
            </p>
          </>
        )}
    </Panel>
  )
}

// ─── Ritmo del año ────────────────────────────────────────────────────────────

export function PanelRitmo({ ritmo, esAnioActual, anio }: { ritmo: SemanaDeRitmo[] | null; esAnioActual: boolean; anio: number }) {
  const listo = useListo()
  const titulo = (
    <div className="flex items-center justify-between gap-3">
      <h2 className={T.rotulo}>Ritmo del año</h2>
      <ul className="flex flex-wrap gap-x-4 text-xs text-[#556072]">
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-[2px] bg-[#9AA3B5]" />Reportes enviados</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-[2px] bg-[#2E7D5B]" />Aprobados</li>
      </ul>
    </div>
  )
  let cuerpo
  if (!esAnioActual) {
    cuerpo = (
      <p className={`grid h-[196px] place-content-center rounded-lg border border-dashed border-[#C5CBD6] px-6 text-center text-sm ${T.suave}`}>
        <b className="mb-1 block font-semibold text-[#192031]">{anio} se cargó de una vez</b>
        Los reportes históricos no tienen fechas de trabajo reales, así que no se dibujan en el tiempo.
      </p>
    )
  } else if (!ritmo) {
    cuerpo = <NoDisponible>El ritmo no está disponible en este momento.</NoDisponible>
  } else {
    const maximo = Math.max(1, ...ritmo.flatMap(s => [s.enviados, s.aprobados]))
    const { techo, marcas } = techoDelEje(maximo)
    const vacio = ritmo.every(s => s.enviados === 0 && s.aprobados === 0)
    cuerpo = (
      <div className="relative ml-8 h-[196px]" role="img" aria-label={`Reportes enviados y aprobados por semana: ${ritmo.map(s => `${etiquetaDeSemana(s.semana)}, ${s.enviados} enviados y ${s.aprobados} aprobados`).join('; ')}`}>
        <div aria-hidden className="absolute inset-x-0 top-0 bottom-[26px]">
          {marcas.map((m, k) => (
            <div key={m} className={`absolute inset-x-0 border-t ${k === 0 ? 'border-[#C5CBD6]' : 'border-[#E6E9EF]'}`} style={{ bottom: `${(100 * m) / techo}%` }}>
              <span className="absolute -left-8 w-6 -translate-y-1/2 text-right text-[11px] tabular-nums text-[#556072]">{fmt(m)}</span>
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 top-0 bottom-[26px] flex items-end gap-1.5 px-1">
          {ritmo.map((s, k) => (
            <div key={s.semana} className="relative flex h-full min-w-0 flex-1 items-end justify-center gap-[3px]" title={`Semana del ${etiquetaDeSemana(s.semana)}\nEnviados: ${s.enviados}\nAprobados: ${s.aprobados}`}>
              <i className="block w-[42%] max-w-[18px] rounded-t-[3px] bg-[#9AA3B5] transition-[height] duration-700 ease-out motion-reduce:transition-none" style={{ height: listo ? `${(100 * s.enviados) / techo}%` : 0, transitionDelay: `${k * 60}ms` }} />
              <i className="block w-[42%] max-w-[18px] rounded-t-[3px] bg-[#2E7D5B] transition-[height] duration-700 ease-out motion-reduce:transition-none" style={{ height: listo ? `${(100 * s.aprobados) / techo}%` : 0, transitionDelay: `${k * 60 + 90}ms` }} />
              <span className={`absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-[#556072] ${k % 2 ? 'hidden sm:inline' : ''}`}>{etiquetaDeSemana(s.semana)}</span>
            </div>
          ))}
        </div>
        {vacio && (
          <div className="absolute inset-x-0 top-0 bottom-[26px] grid place-content-center px-6 text-center text-[13px] text-[#556072]">
            <span><b className="block font-semibold text-[#192031]">Aquí aparecerán los reportes de cada semana</b>Todavía no se ha enviado ninguno.</span>
          </div>
        )}
      </div>
    )
  }
  return (
    <Panel className="h-full">
      <div className="mb-4">{titulo}</div>
      {cuerpo}
      <p className={`mt-4 text-xs leading-relaxed ${T.suave}`}>
        Semana a semana desde que se abrió el módulo (15 de octubre). Lo de 2024 y 2025 se cargó de una vez: sirve para medir el cumplimiento, no el ritmo.
      </p>
    </Panel>
  )
}

// ─── Tu equipo ────────────────────────────────────────────────────────────────

const FILTROS_DE_EQUIPO: { clave: FiltroDeEquipo; rotulo: string }[] = [
  { clave: 'todos', rotulo: 'Todos' }, { clave: 'pendientes', rotulo: 'Con pendientes' }, { clave: 'sin_acceso', rotulo: 'Sin acceso' },
]
const VISIBLES = 6

export function PanelEquipo({ equipo, leido = true }: { equipo: PersonaDeEquipo[]; /** Falso si la lista de personas no se pudo leer: entonces no se dice «no hay nadie». */ leido?: boolean }) {
  const [filtro, setFiltro] = useState<FiltroDeEquipo>('todos')
  const [todos, setTodos] = useState(false)
  const lista = filtrarEquipo(equipo, filtro)
  const visibles = todos ? lista : lista.slice(0, VISIBLES)
  const base = 'rounded-full border px-3 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-1'
  return (
    <Panel
      titulo="Tu equipo" className="h-full"
      acciones={(
        <div role="group" aria-label="Filtro del equipo" className="flex flex-wrap gap-1.5">
          {FILTROS_DE_EQUIPO.map(f => (
            <button
              key={f.clave} type="button" aria-pressed={filtro === f.clave} onClick={() => { setFiltro(f.clave); setTodos(false) }}
              className={`${base} ${filtro === f.clave ? 'border-[#192031] bg-[#192031] text-white' : 'border-[#C5CBD6] bg-white text-[#556072] hover:border-[#192031] hover:text-[#192031]'}`}
            >{f.rotulo}</button>
          ))}
        </div>
      )}
    >
      {!leido
        ? <NoDisponible>No se pudo leer la lista de personas en este momento. Vuelve a intentarlo en unos minutos.</NoDisponible>
        : equipo.length === 0
        ? <NoDisponible>Todavía no hay personas con indicadores a su cargo en tu secretaría.</NoDisponible>
        : (
          <>
            <ul>
              {visibles.map((p, k) => (
                <li key={p.id} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-t border-[#E6E9EF] py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[34px_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto]">
                  <span aria-hidden className={`grid h-[34px] w-[34px] place-items-center rounded-full text-xs font-bold ${p.sinAcceso ? 'border border-dashed border-[#C5CBD6] bg-white text-[#667085]' : 'bg-[#EDF0F5] text-[#192031]'}`}>{iniciales(p.nombre)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold leading-snug text-[#192031]" title={p.nombre}>{p.nombre}</p>
                    {p.sinAcceso
                      ? <p className="text-xs font-semibold leading-snug text-[#B42318]">Aún sin acceso</p>
                      : <p className="text-xs leading-snug text-[#556072]">{fmt(p.indicadores)} {p.indicadores === 1 ? 'indicador' : 'indicadores'}</p>}
                  </div>
                  <div className="col-span-2 col-start-2 self-center sm:col-span-1 sm:col-start-auto">
                    <PistaApilada
                      escalon={k} descripcion={`${p.aprobados} aprobados, ${p.porValidar} sin validar, ${p.devueltos} devueltos, ${p.porReportar} por reportar`}
                      segmentos={[
                        { clave: 'a', valor: p.aprobados, clase: RELLENO_ESTADO.aprobados, titulo: `Aprobados: ${p.aprobados}` },
                        { clave: 'v', valor: p.porValidar, clase: RELLENO_ESTADO.porValidar, titulo: `Sin validar: ${p.porValidar}` },
                        { clave: 'd', valor: p.devueltos, clase: RELLENO_ESTADO.devueltos, titulo: `Devueltos: ${p.devueltos}` },
                        { clave: 'f', valor: p.porReportar, clase: RELLENO_ESTADO.faltan, titulo: `Por reportar: ${p.porReportar}` },
                      ]}
                    />
                  </div>
                  {([['Por reportar', p.porReportar], ['Sin validar', p.porValidar], ['Devueltos', p.devueltos]] as const).map(([rotulo, v]) => (
                    <p key={rotulo} className="hidden min-w-[4.4ch] text-right text-sm font-semibold leading-tight tabular-nums text-[#192031] sm:block">
                      {fmt(v)}<span className="block text-[10px] font-semibold uppercase leading-snug tracking-wider text-[#667085]">{rotulo}</span>
                    </p>
                  ))}
                </li>
              ))}
              {visibles.length === 0 && <li className={`py-3 text-sm ${T.suave}`}>Nadie cumple este filtro.</li>}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className={`text-xs ${T.suave}`}>{fmt(visibles.length)} de {fmt(equipo.length)} personas</span>
              {lista.length > VISIBLES && (
                <button type="button" onClick={() => setTodos(v => !v)} className={T.botonSecChico}>{todos ? 'Ver menos' : `Ver ${fmt(lista.length - VISIBLES)} más`}</button>
              )}
            </div>
            {equipo.some(p => p.sinAcceso) && (
              <p className={`mt-3 text-xs leading-relaxed ${T.suave}`}>
                Quien no tiene acceso no puede reportar sus indicadores. <Link href={HREF_RESPONSABLES} className={T.enlace}>Habilitar desde Responsables</Link>.
              </p>
            )}
            <p className={`mt-3 text-xs leading-relaxed ${T.suave}`}>Se ordena por nombre y mide gestión (qué falta reportar, qué espera validación), no resultados: no hay puestos ni podio.</p>
          </>
        )}
    </Panel>
  )
}

// ─── Cómo se calcula ──────────────────────────────────────────────────────────

export function MetodoDeCalculo() {
  return (
    <details className={`${T.panel} group`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className={T.rotulo}>Cómo se calcula</span>
        <span aria-hidden className="text-[#556072] transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="grid gap-2.5 px-5 pb-5">
        {[
          ['Cada año se mide contra su propia meta.', ' No hay «avance del cuatrienio»: solo una parte de los indicadores suma sus cuatro metas y la Alcaldía no ha fijado una regla para el resto.'],
          ['Solo cuenta lo que la secretaría aprobó.', ' Lo reportado y sin validar se ve aparte, pero no suma al cumplimiento.'],
          ['Los porcentajes salen de los indicadores con meta en el año.', ' No se suman valores de indicadores distintos (personas, hectáreas, documentos). Con menos de cinco indicadores se muestra la cifra, no el porcentaje.'],
          ['Cumplido:', ' el avance validado llegó a la meta. En avance: hay avance validado, sin llegar. Sin avance: todo lo demás. Mientras no haya ningún avance validado, el centro del anillo dice «—» y no «0 %».'],
          ['Sin semáforos.', ' No se pinta «en ruta» ni «atrasado» hasta que la Alcaldía defina esos umbrales: los colores solo dicen el estado de un reporte.'],
          ['De las otras secretarías solo se ven números.', ' Nunca nombres de indicadores, de personas ni de archivos.'],
        ].map(([fuerte, resto]) => (
          <p key={fuerte} className={`max-w-[75ch] text-[13px] leading-relaxed ${T.suave}`}><b className="font-semibold text-[#192031]">{fuerte}</b>{resto}</p>
        ))}
      </div>
    </details>
  )
}
