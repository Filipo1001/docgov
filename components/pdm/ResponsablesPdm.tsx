'use client'

/**
 * Responsables: quién responde por cada indicador, y dónde nadie responde.
 *
 * Dos preguntas del administrador, en el orden en que las hace:
 *
 *   1. ¿Dónde están los huecos? Los indicadores a nombre de un equipo, una
 *      oficina, varias personas o de nadie no tienen a quién exigirle el
 *      reporte. Aquí se ven por secretaría, y cada una lleva a su lista.
 *   2. ¿Cómo está repartida la carga? Cada persona con lo que tiene a su
 *      nombre y cómo va, para ver quién está sobrecargado.
 *
 * Es solo lectura, y a propósito no tiene botón de «Asignar»: asignar escribe
 * datos, y eso llega con la base de datos. Un botón que no hace nada es ruido.
 *
 * Los nombres son los del archivo de Excel, escritos a mano. Todavía no se
 * cruzan con los usuarios de la plataforma, así que aquí no se puede decir
 * quién tiene o no acceso para reportar.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  INDICADORES, REPORTANTES, agrupar, resumir, sinResponsableUnico, tipoResponsable,
  type Indicador, type TipoResponsable,
} from '@/lib/pdm/plan'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import EncabezadoSeccion from './EncabezadoSeccion'
import { BarraEstados } from './Barras'

/** Cómo se dice, en una tarjeta pequeña, a qué está a nombre un indicador sin persona. */
const A_NOMBRE_DE: Record<Exclude<TipoResponsable, 'persona'>, string> = {
  equipo: 'de un equipo',
  varios: 'de varias personas',
  oficina: 'de una oficina',
  ninguno: 'de nadie',
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function ResponsablesPdm() {
  const [q, setQ] = useState('')

  const huerfanos = useMemo(() => INDICADORES.filter(sinResponsableUnico), [])
  const porTipo = useMemo(() => agrupar(huerfanos, i => tipoResponsable(i.responsable)), [huerfanos])
  const porSecretaria = useMemo(() => {
    const total = new Map(agrupar(INDICADORES, i => i.dependencia).map(([d, l]) => [d, l.length]))
    return agrupar(huerfanos, i => i.dependencia).map(([d, l]) => ({ dependencia: d, sin: l.length, total: total.get(d) ?? l.length }))
  }, [huerfanos])

  const personas = useMemo(() => {
    const por = new Map<string, Indicador[]>()
    for (const i of INDICADORES) por.set(i.responsable, [...(por.get(i.responsable) ?? []), i])
    return REPORTANTES.map(p => {
      const lista = por.get(p.nombre) ?? []
      const r = resumir(lista)
      const deps = [...new Set(lista.map(i => i.dependencia))]
      return { nombre: p.nombre, n: lista.length, r, atencion: r.atrasados + r.criticos, deps }
    })
  }, [])

  const t = sinTildes(q.trim())
  const visibles = t ? personas.filter(p => sinTildes(p.nombre).includes(t)) : personas

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <EncabezadoSeccion titulo="Responsables" detalle="Quién responde por cada indicador, y dónde nadie responde." />

      {/* 1 · Los huecos */}
      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-bold text-gray-900">Sin una persona que responda</h2>
          <p className="text-xs text-gray-500">
            <b className="tabular-nums text-red-600">{huerfanos.length}</b> de {INDICADORES.length} indicadores
          </p>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {porTipo.map(([tipo, l], k) => (
            <span key={tipo}>
              {k > 0 && ' · '}
              <b className="tabular-nums text-gray-700">{l.length}</b> a nombre {A_NOMBRE_DE[tipo as Exclude<TipoResponsable, 'persona'>]}
            </span>
          ))}
        </p>

        <ul className="mt-2 divide-y divide-gray-100">
          {porSecretaria.map(s => (
            <li key={s.dependencia}>
              <Link
                href={`${HREF_INDICADORES}?dependencia=${encodeURIComponent(s.dependencia)}&filtro=sin_responsable`}
                className="flex items-center gap-4 py-3 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-gray-900">{s.dependencia}</p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden>
                    <div className="h-full rounded-full bg-red-400" style={{ width: `${(100 * s.sin) / s.total}%` }} />
                  </div>
                </div>
                <p className="shrink-0 text-right text-xs text-gray-500">
                  <b className="text-sm tabular-nums text-gray-900">{s.sin}</b> de {s.total}
                </p>
                <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="shrink-0 text-gray-300" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 2 · La carga por persona */}
      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-bold text-gray-900">Por persona</h2>
            <span className="text-xs text-gray-500">{personas.length} personas</span>
          </div>
          <label className="relative block sm:w-72">
            <span className="sr-only">Buscar persona</span>
            <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="pdm-persona"
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar persona"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            />
          </label>
        </div>

        {visibles.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">Nadie coincide con «{q}».</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {visibles.map(p => (
              <li key={p.nombre}>
                <Link
                  href={`${HREF_INDICADORES}?responsable=${encodeURIComponent(p.nombre)}`}
                  className="flex items-center gap-4 py-3 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{p.nombre}</p>
                    <p className="truncate text-xs text-gray-500">
                      {p.deps.length === 1 ? p.deps[0] : `${p.deps.length} secretarías`}
                    </p>
                    {p.atencion > 0 && (
                      <p className="mt-0.5 text-xs font-medium text-red-700">
                        {p.atencion} {p.atencion === 1 ? 'atrasado o crítico' : 'atrasados o críticos'}
                      </p>
                    )}
                  </div>
                  <div className="hidden w-40 shrink-0 sm:block">
                    <BarraEstados r={p.r} alto="h-2" />
                  </div>
                  <p className="w-16 shrink-0 text-right">
                    <b className="block text-sm tabular-nums text-gray-900">{p.n}</b>
                    <span className="text-[11px] text-gray-500">{p.n === 1 ? 'indicador' : 'indicadores'}</span>
                  </p>
                  <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="shrink-0 text-gray-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
