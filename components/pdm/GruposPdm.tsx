'use client'

/**
 * Los grupos, en la sección Responsables: quiénes son, quién los lidera y cuántos
 * indicadores llevan. Desde aquí se crean, se editan y se disuelven.
 *
 * El botón de crear siempre está: es la puerta de entrada, y sin ningún grupo la
 * sección dice para qué sirve uno en lugar de quedarse vacía. El líder es opcional:
 * un grupo sin líder se muestra como tal, no como un error.
 */

import { useState } from 'react'
import Link from 'next/link'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import type { AccionesPdm } from '@/lib/pdm/acciones'
import type { GrupoVista, PersonaDirectorio, SecretariaPlan } from '@/lib/pdm/personas'
import EditorGrupo from './EditorGrupo'
import { Presencia } from './Ventana'
import { useAvisar } from './Avisos'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export default function GruposPdm({ grupos, personas, secretarias, acciones, puedeGestionar }: {
  grupos: GrupoVista[]
  personas: PersonaDirectorio[]
  secretarias: SecretariaPlan[]
  acciones: AccionesPdm
  /** Quien solo consulta ve los grupos y no los toca. */
  puedeGestionar: boolean
}) {
  // `undefined`: cerrado · `null`: grupo nuevo · un grupo: editándolo
  const [editando, setEditando] = useState<GrupoVista | null | undefined>(undefined)
  const avisar = useAvisar()
  const nombreDe = new Map(personas.map(p => [p.id, p.nombre]))

  return (
    <section className="overflow-hidden rounded-lg border border-[#DCE0E8] bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 -mx-4 -mt-4 mb-3 border-b border-[#E6E9EF] px-4 py-3 sm:-mx-5 sm:px-5">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Grupos</h2>
          <span className="text-xs text-[#667085]">{plural(grupos.length, 'grupo', 'grupos')}</span>
        </div>
        {puedeGestionar && (
          <button
            id="pdm-crear-grupo"
            onClick={() => setEditando(null)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#192031] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#242F45]"
          >
            <Icono glifo={Iconos.accion.agregar} tamano="sm" />
            Crear grupo
          </button>
        )}
      </div>

      {grupos.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-[#667085]">
          Un grupo reúne personas que responden juntas por varios indicadores. Si tiene líder, él queda como
          responsable principal y las demás personas como apoyo; sin líder, el grupo entra como apoyo. Si el grupo
          cambia, sus indicadores se actualizan solos.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[#E6E9EF]">
          {grupos.map(g => (
            <li key={g.id} className="flex items-center gap-3.5 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E6E9EF] text-[#556072]">
                <Icono glifo={Iconos.navegacion.usuarios} tamano="sm" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#192031]">{g.nombre}</p>
                <p className="truncate text-xs text-[#667085]">
                  {g.secretaria} · {g.liderId ? `Líder: ${nombreDe.get(g.liderId) ?? 'persona que ya no está activa'}` : 'Sin líder'}
                  {' · '}{plural(g.miembros.length, 'persona', 'personas')}
                </p>
                {g.descripcion && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#667085]">{g.descripcion}</p>}
              </div>
              {g.indicadores > 0 ? (
                <Link
                  href={`${HREF_INDICADORES}?grupo=${encodeURIComponent(g.id)}`}
                  className="w-20 shrink-0 text-right transition-colors hover:text-[#192031]"
                >
                  <b className="block text-sm tabular-nums text-[#192031]">{g.indicadores}</b>
                  <span className="text-[11px] text-[#667085]">{g.indicadores === 1 ? 'indicador' : 'indicadores'}</span>
                </Link>
              ) : (
                <span className="w-20 shrink-0 text-right text-xs text-[#98A2B3]">Ninguno</span>
              )}
              {puedeGestionar && (
                <button
                  onClick={() => setEditando(g)}
                  className="shrink-0 rounded-lg border border-[#DCE0E8] px-3 py-1.5 text-xs font-semibold text-[#2D3648] transition-colors hover:bg-[#F4F5F8]"
                >
                  Editar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Presencia mostrar={puedeGestionar && editando !== undefined}>
      {puedeGestionar && editando !== undefined && (
        <EditorGrupo
          // Cada grupo abre su propio formulario: sin esto, pasar de uno a otro arrastraría lo escrito.
          key={editando?.id ?? 'nuevo'}
          grupo={editando ?? undefined}
          personas={personas}
          secretarias={secretarias}
          acciones={acciones}
          onCerrar={() => setEditando(undefined)}
          onHecho={mensaje => { setEditando(undefined); avisar(mensaje) }}
        />
      )}
      </Presencia>
    </section>
  )
}
