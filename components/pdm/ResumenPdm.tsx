'use client'

/**
 * Resumen: el tablero del plan, sin filtros ni selectores. Lo que mira quien
 * quiere saber si hay que preocuparse.
 *
 * Es solo lectura. El administrador no reporta avances ni reescribe los de
 * nadie: lo que un responsable reportó es suyo, y si hay que corregirlo la
 * corrección queda versionada con su motivo (cuando exista la base de datos).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { agrupar, type Indicador } from '@/lib/pdm/plan'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import EncabezadoSeccion from './EncabezadoSeccion'
import Tablero from './Tablero'
import IndicadorModal from './IndicadorModal'
import type { PersonaFicha } from '@/lib/pdm/personas'

const SIN_REPORTES: never[] = []
const SIN_REPORTADO: Record<number, number> = {}
const NO_REPORTA = () => {}

export default function ResumenPdm({ indicadores, fichas }: { indicadores: Indicador[]; fichas: Record<number, PersonaFicha> }) {
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
        reportado={SIN_REPORTADO}
        conEvidencia={0}
        onAbrir={setAbierto}
        onVerDependencia={d => router.push(`${HREF_INDICADORES}?dependencia=${encodeURIComponent(d)}`)}
      />

      <IndicadorModal
        key={abierto ?? 'cerrado'}
        indicador={indicador}
        reportes={SIN_REPORTES}
        puedeReportar={false}
        onCerrar={() => setAbierto(null)}
        onReportar={NO_REPORTA}
        persona={indicador ? fichas[indicador.id] : undefined}
      />
    </div>
  )
}
