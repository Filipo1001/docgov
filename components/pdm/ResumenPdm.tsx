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
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { agrupar, type Indicador } from '@/lib/pdm/plan'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import { pendientesDeReportar } from '@/lib/pdm/mi-trabajo'
import type { NivelPdm } from '@/lib/pdm/niveles'
import type { Seguimiento } from '@/lib/pdm/seguimiento'
import type { AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import EncabezadoSeccion from './EncabezadoSeccion'
import Tablero from './Tablero'
import IndicadorModal from './IndicadorModal'
import { ACCIONES_SEGUIMIENTO_REALES } from './acciones-seguimiento-reales'
import { T } from './tema'
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
  // Una secretaría también reporta los indicadores que lleva ella misma, y entre los de toda su
  // dependencia no los distinguiría: se le avisa de los suyos, con un enlace que los lista.
  const propiosPorReportar = nivel === 'coordinador' ? pendientesDeReportar(indicadores, yoId) : 0

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <EncabezadoSeccion
        titulo="Resumen"
        datos={[
          { rotulo: 'Indicadores', valor: String(indicadores.length) },
          { rotulo: 'Estructura', valor: `${lineas} líneas · ${secretarias} secretarías` },
          { rotulo: 'Corte', valor: seguimiento.abierto ? seguimiento.abierto.nombre : 'Sin corte abierto' },
        ]}
      />

      {propiosPorReportar > 0 && seguimiento.abierto && (
        <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${T.avisoNota}`}>
          <p>
            Tienes <b className="tabular-nums">{propiosPorReportar}</b> {propiosPorReportar === 1 ? 'indicador a tu cargo' : 'indicadores a tu cargo'} por
            reportar en «{seguimiento.abierto.nombre}».
          </p>
          <Link href={`${HREF_INDICADORES}?usuario=${yoId}&filtro=por_reportar`} className={T.enlace}>Ver cuáles</Link>
        </div>
      )}

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
