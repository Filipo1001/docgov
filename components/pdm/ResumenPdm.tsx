'use client'

/**
 * Resumen: el tablero del plan en un año, sin filtros ni selectores más que el del año. Lo que mira quien
 * quiere saber si hay que preocuparse.
 *
 * Las cifras salen solo de lo VALIDADO por la secretaría. Desde la ficha de un indicador
 * se puede reportar, validar o comentar, pero el administrador no reporta ni reescribe los
 * avances de nadie: lo que un responsable reportó es suyo, y corregirlo deja una versión nueva.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { agrupar, proyectarLista, type Indicador } from '@/lib/pdm/plan'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import { pendientesDeReportar } from '@/lib/pdm/mi-trabajo'
import type { NivelPdm } from '@/lib/pdm/niveles'
import type { AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import { Presencia } from './Ventana'
import Pagina from './Pagina'
import EncabezadoSeccion from './EncabezadoSeccion'
import SelectorAnio from './SelectorAnio'
import Tablero from './Tablero'
import IndicadorModal from './IndicadorModal'
import { ACCIONES_SEGUIMIENTO_REALES } from './acciones-seguimiento-reales'
import { T } from './tema'
import type { PersonaFicha } from '@/lib/pdm/personas'

export default function ResumenPdm({ indicadores, fichas, nivel, yoId, anioActual, anioInicial, accionesSeguimiento = ACCIONES_SEGUIMIENTO_REALES }: {
  /** Con sus cuatro años: se proyectan al que se mira. */
  indicadores: Indicador[]
  fichas: Record<number, PersonaFicha>
  nivel: NivelPdm
  yoId: string
  /** El año calendario (hora de Colombia). */
  anioActual: number
  /** El año con que se abre la pantalla. */
  anioInicial: number
  accionesSeguimiento?: AccionesSeguimiento
}) {
  const router = useRouter()
  const [anio, setAnio] = useState(anioInicial)
  const [abierto, setAbierto] = useState<number | null>(null)
  const lista = useMemo(() => proyectarLista(indicadores, anio), [indicadores, anio])
  const indicador = abierto === null ? null : lista.find(i => i.id === abierto) ?? null

  const lineas = agrupar(lista, i => i.linea).length
  const secretarias = agrupar(lista, i => i.dependencia).length
  // Una secretaría también reporta los indicadores que lleva ella misma, y entre los de toda su
  // dependencia no los distinguiría: se le avisa de los suyos, con un enlace que los lista.
  const propiosPorReportar = nivel === 'coordinador' ? pendientesDeReportar(lista, yoId) : 0

  return (
    <Pagina>
      <EncabezadoSeccion
        titulo="Resumen"
        datos={[
          { rotulo: 'Indicadores', valor: String(lista.length) },
          { rotulo: 'Estructura', valor: `${lineas} líneas · ${secretarias} secretarías` },
          { rotulo: 'Año', valor: String(anio) },
        ]}
      />

      <SelectorAnio anio={anio} anioActual={anioActual} onCambiar={setAnio} />

      {propiosPorReportar > 0 && (
        <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${T.avisoNota}`}>
          <p>
            Tienes <b className="tabular-nums">{propiosPorReportar}</b> {propiosPorReportar === 1 ? 'indicador a tu cargo' : 'indicadores a tu cargo'} por
            reportar en {anio}.
          </p>
          <Link href={`${HREF_INDICADORES}?usuario=${yoId}&filtro=por_reportar&anio=${anio}`} className={T.enlace}>Ver cuáles</Link>
        </div>
      )}

      <Tablero
        lista={lista}
        anio={anio}
        anioActual={anioActual}
        onAbrir={setAbierto}
        onVerDependencia={d => router.push(`${HREF_INDICADORES}?dependencia=${encodeURIComponent(d)}&anio=${anio}`)}
      />

      <Presencia mostrar={indicador !== null}>
      <IndicadorModal
        key={abierto ?? 'cerrado'}
        indicador={indicador}
        onCerrar={() => setAbierto(null)}
        onAnio={setAnio}
        seguimiento={{ nivel, yoId, anioActual, acciones: accionesSeguimiento }}
        persona={indicador ? fichas[indicador.id] : undefined}
      />
      </Presencia>
    </Pagina>
  )
}
