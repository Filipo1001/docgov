'use client'

/**
 * Indicadores: la lista de trabajo. Búsqueda, filtros y la ficha de cada uno.
 *
 * Llega ya filtrada cuando otra sección lo pide: desde el Resumen por
 * secretaría, y desde Responsables por secretaría con huecos o por persona.
 * Esas tres cosas viajan en la dirección y la pantalla las lee UNA vez al
 * abrirse; por eso la página que la monta le pone una `key`, para que un
 * enlace nuevo a esta misma pantalla arranque de cero y no arrastre el filtro
 * anterior.
 */

import { useState } from 'react'
import Link from 'next/link'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { INDICADORES } from '@/lib/pdm/plan'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import EncabezadoSeccion from './EncabezadoSeccion'
import ListaIndicadores from './ListaIndicadores'
import type { Filtro } from '@/lib/pdm/filtros'
import type { PersonaFicha } from '@/lib/pdm/personas'
import IndicadorModal from './IndicadorModal'

const SIN_REPORTES: never[] = []
const SIN_REPORTADO: Record<number, number> = {}
const NO_REPORTA = () => {}

export default function IndicadoresPdm({
  dependenciaInicial, filtroInicial, responsable, fichas,
}: {
  dependenciaInicial?: string
  filtroInicial?: Filtro
  /** Solo los de esta persona (nombre tal como figura en el archivo). */
  responsable?: string
  fichas: Record<string, PersonaFicha>
}) {
  const [dependencia, setDependencia] = useState(dependenciaInicial ?? '')
  const [abierto, setAbierto] = useState<number | null>(null)

  const lista = responsable ? INDICADORES.filter(i => i.responsable === responsable) : INDICADORES
  const indicador = abierto === null ? null : INDICADORES.find(i => i.id === abierto) ?? null
  // En el chip, el nombre de la persona en la plataforma; si no tiene usuario, el del archivo.
  const ficha = responsable ? fichas[responsable] : undefined
  const etiqueta = ficha && 'nombre' in ficha ? ficha.nombre : responsable

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <EncabezadoSeccion
        titulo="Indicadores"
        detalle={responsable ? `${lista.length} de ${INDICADORES.length}` : `${INDICADORES.length} indicadores de producto`}
      />

      {responsable && (
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 py-1 pl-3.5 pr-1.5 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">
            A nombre de {etiqueta}
            <Link
              href={HREF_INDICADORES}
              className="flex h-6 w-6 items-center justify-center rounded-full text-teal-700 transition-colors hover:bg-teal-100"
            >
              <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta="Quitar este filtro" />
            </Link>
          </span>
        </div>
      )}

      <ListaIndicadores
        lista={lista}
        reportado={SIN_REPORTADO}
        onAbrir={setAbierto}
        dependencia={dependencia}
        onDependencia={setDependencia}
        filtroInicial={filtroInicial}
      />

      <IndicadorModal
        key={abierto ?? 'cerrado'}
        indicador={indicador}
        reportes={SIN_REPORTES}
        puedeReportar={false}
        onCerrar={() => setAbierto(null)}
        onReportar={NO_REPORTA}
        persona={indicador ? fichas[indicador.responsable] : undefined}
      />
    </div>
  )
}
