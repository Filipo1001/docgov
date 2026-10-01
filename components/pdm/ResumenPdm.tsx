'use client'

/**
 * Resumen: el tablero del plan, sin filtros ni selectores. Lo que mira quien
 * quiere saber si hay que preocuparse.
 *
 * Las cifras salen solo de lo VALIDADO por la secretaría. Desde la ficha de un indicador
 * se puede reportar, validar o comentar, pero el administrador no reporta ni reescribe los
 * avances de nadie: lo que un responsable reportó es suyo, y corregirlo deja una versión nueva.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { agrupar, type Indicador } from '@/lib/pdm/plan'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import type { NivelPdm } from '@/lib/pdm/niveles'
import type { Seguimiento } from '@/lib/pdm/seguimiento'
import type { AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import EncabezadoSeccion from './EncabezadoSeccion'
import Tablero from './Tablero'
import IndicadorModal from './IndicadorModal'
import { ACCIONES_SEGUIMIENTO_REALES } from './acciones-seguimiento-reales'
import type { PersonaFicha } from '@/lib/pdm/personas'

export default function ResumenPdm({ indicadores, fichas, nivel, yoId, seguimiento, accionesSeguimiento = ACCIONES_SEGUIMIENTO_REALES }: {
  indicadores: Indicador[]
  fichas: Record<number, PersonaFicha>
  nivel: NivelPdm
  yoId: string
  seguimiento: Seguimiento
  accionesSeguimiento?: AccionesSeguimiento
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<number | null>(null)
  const indicador = abierto === null ? null : indicadores.find(i => i.id === abierto) ?? null

  const lineas = agrupar(indicadores, i => i.linea).length
  const secretarias = agrupar(indicadores, i => i.dependencia).length

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <EncabezadoSeccion
        titulo="Resumen"
        detalle={`${indicadores.length} indicadores de producto · ${lineas} líneas estratégicas · ${secretarias} secretarías`}
      />

      <Tablero
        lista={indicadores}
        criterio={seguimiento.ajustes.avanceModo}
        corteAbierto={seguimiento.abierto}
        onAbrir={setAbierto}
        onVerDependencia={d => router.push(`${HREF_INDICADORES}?dependencia=${encodeURIComponent(d)}`)}
      />

      <IndicadorModal
        key={abierto ?? 'cerrado'}
        indicador={indicador}
        onCerrar={() => setAbierto(null)}
        seguimiento={{ nivel, yoId, corteAbierto: seguimiento.abierto, acciones: accionesSeguimiento }}
        persona={indicador ? fichas[indicador.id] : undefined}
      />
    </div>
  )
}
