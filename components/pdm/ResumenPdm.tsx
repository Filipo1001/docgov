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
import { INDICADORES, agrupar } from '@/lib/pdm/plan'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import EncabezadoSeccion from './EncabezadoSeccion'
import Tablero from './Tablero'
import IndicadorModal from './IndicadorModal'

const SIN_REPORTES: never[] = []
const SIN_REPORTADO: Record<number, number> = {}
const NO_REPORTA = () => {}

export default function ResumenPdm() {
  const router = useRouter()
  const [abierto, setAbierto] = useState<number | null>(null)
  const indicador = abierto === null ? null : INDICADORES.find(i => i.id === abierto) ?? null

  const lineas = agrupar(INDICADORES, i => i.linea).length
  const secretarias = agrupar(INDICADORES, i => i.dependencia).length

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <EncabezadoSeccion
        titulo="Resumen"
        detalle={`${INDICADORES.length} indicadores de producto · ${lineas} líneas estratégicas · ${secretarias} secretarías`}
      />

      <Tablero
        lista={INDICADORES}
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
      />
    </div>
  )
}
