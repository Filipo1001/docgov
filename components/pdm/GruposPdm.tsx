'use client'

/**
 * Los grupos, en la sección Responsables: quiénes son, quién los lidera y cuántos
 * indicadores llevan. Desde aquí se crean, se editan y se disuelven.
 *
 * El botón de crear siempre está: es la puerta de entrada, y sin ningún grupo la
 * sección dice para qué sirve uno en lugar de quedarse vacía.
 */

import { useState } from 'react'
import Link from 'next/link'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import type { AccionesPdm } from '@/lib/pdm/acciones'
import type { GrupoVista, PersonaDirectorio, SecretariaPlan } from '@/lib/pdm/personas'
import EditorGrupo from './EditorGrupo'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export default function GruposPdm({ grupos, personas, secretarias, acciones }: {
  grupos: GrupoVista[]
  personas: PersonaDirectorio[]
  secretarias: SecretariaPlan[]
  acciones: AccionesPdm
}) {
  // `undefined`: cerrado · `null`: grupo nuevo · un grupo: editándolo
  const [editando, setEditando] = useState<GrupoVista | null | undefined>(undefined)
  const [aviso, setAviso] = useState<string | null>(null)
  const nombreDe = new Map(personas.map(p => [p.id, p.nombre]))

  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-bold text-gray-900">Grupos</h2>
          <span className="text-xs text-gray-500">{plural(grupos.length, 'grupo', 'grupos')}</span>
        </div>
        <button
          id="pdm-crear-grupo"
          onClick={() => { setAviso(null); setEditando(null) }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#192031] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#242F45]"
        >
          <Icono glifo={Iconos.accion.agregar} tamano="sm" />
          Crear grupo
        </button>
      </div>

      {aviso && (
        <p role="status" className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 text-emerald-700 hover:text-emerald-900">
            <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta="Cerrar aviso" />
          </button>
        </p>
      )}

      {grupos.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Un grupo reúne personas que responden juntas por varios indicadores. Su líder queda como responsable
          principal y las demás como apoyo; si cambia el grupo, sus indicadores se actualizan solos.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {grupos.map(g => (
            <li key={g.id} className="flex items-center gap-3.5 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                <Icono glifo={Iconos.navegacion.usuarios} tamano="sm" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{g.nombre}</p>
                <p className="truncate text-xs text-gray-500">
                  {g.secretaria} · {g.liderId ? `Líder: ${nombreDe.get(g.liderId) ?? 'persona que ya no está activa'}` : <span className="font-medium text-red-700">Sin líder</span>}
                  {' · '}{plural(g.miembros.length, 'persona', 'personas')}
                </p>
              </div>
              {g.indicadores > 0 ? (
                <Link
                  href={`${HREF_INDICADORES}?grupo=${encodeURIComponent(g.id)}`}
                  className="w-20 shrink-0 text-right transition-colors hover:text-teal-700"
                >
                  <b className="block text-sm tabular-nums text-gray-900">{g.indicadores}</b>
                  <span className="text-[11px] text-gray-500">{g.indicadores === 1 ? 'indicador' : 'indicadores'}</span>
                </Link>
              ) : (
                <span className="w-20 shrink-0 text-right text-xs text-gray-400">Ninguno</span>
              )}
              <button
                onClick={() => { setAviso(null); setEditando(g) }}
                className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}

      {editando !== undefined && (
        <EditorGrupo
          // Cada grupo abre su propio formulario: sin esto, pasar de uno a otro arrastraría lo escrito.
          key={editando?.id ?? 'nuevo'}
          grupo={editando ?? undefined}
          personas={personas}
          secretarias={secretarias}
          acciones={acciones}
          onCerrar={() => setEditando(undefined)}
          onHecho={mensaje => { setEditando(undefined); setAviso(mensaje) }}
        />
      )}
    </section>
  )
}
