'use client'

/**
 * El TABLERO de la secretaría: el inicio del módulo para el nivel «secretaría» (el secretario de despacho).
 *
 * Responde, en este orden, lo que pidió quien lo usa: cómo va su secretaría, cómo va el plan de la Alcaldía y cómo va su
 * secretaría frente a las otras. Debajo, lo que puede hacer ya (qué espera su validación, qué no tiene dueño), el avance por
 * sector, el ritmo del año y su equipo.
 *
 * Todas las cuentas salen de `lib/pdm/tablero.ts` (puras y probadas); aquí solo se eligen el año y la medida y se pinta. Lo que
 * viene de otras secretarías son números que entrega la base (migración 071); si esa lectura falla, el tablero lo dice y sigue
 * mostrando todo lo de la propia secretaría.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { aniosIniciados } from '@/lib/pdm/graficos'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import { pendientesDeReportar } from '@/lib/pdm/mi-trabajo'
import { proyectarLista, type Indicador } from '@/lib/pdm/plan'
import type { PersonaDirectorio } from '@/lib/pdm/personas'
import {
  atencionDe, comparacionDelAnio, equipoDe, lecturaDelTablero, propiaPorAnio, sectoresDe,
  type DatosDelTablero, type MedidaDelTablero,
} from '@/lib/pdm/tablero'
import Pagina from '../Pagina'
import { T } from '../tema'
import { PanelAlcaldia, PanelComparacion, PanelTuSecretaria } from './PanelesPrincipales'
import { MetodoDeCalculo, PanelAtencion, PanelEquipo, PanelRitmo, PanelSectores } from './PanelesDeDetalle'
import Presentacion from './Presentacion'

const BOTON = 'rounded-md border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-1'
const PUESTO = 'border-[#192031] bg-[#192031] text-white'
const LIBRE = 'border-[#C5CBD6] bg-white text-[#556072] hover:border-[#192031] hover:text-[#192031]'

const MEDIDAS: { clave: MedidaDelTablero; rotulo: string }[] = [
  { clave: 'cumplimiento', rotulo: 'Cumplimiento' }, { clave: 'reportes', rotulo: 'Estado de los reportes' },
]

export default function TableroSecretaria({ indicadores, personas, personasLeidas, datos, yoId, anioInicial }: {
  /** Los indicadores de la secretaría de quien mira, con sus cuatro años (la base ya los recortó). */
  indicadores: Indicador[]
  /** Las personas con indicadores a su cargo en esta secretaría. */
  personas: PersonaDirectorio[]
  /** Falso si el directorio no se pudo leer: el equipo y «sin acceso» dicen que no están disponibles, no que no hay nadie. */
  personasLeidas: boolean
  datos: DatosDelTablero
  yoId: string
  anioInicial: number
}) {
  const { anioActual } = datos
  const [anio, setAnio] = useState(anioInicial)
  const [medida, setMedida] = useState<MedidaDelTablero>('cumplimiento')
  const [presentando, setPresentando] = useState(false)
  const botonPresentar = useRef<HTMLButtonElement>(null)
  // Al salir, el foco vuelve al botón que la abrió. Estable: la presentación se engancha a la pantalla completa con él.
  const cerrarPresentacion = useCallback(() => { setPresentando(false); botonPresentar.current?.focus() }, [])

  const propia = useMemo(() => propiaPorAnio(datos.secretaria, indicadores, anioActual), [datos.secretaria, indicadores, anioActual])
  const cifras = propia.porAnio[anio]
  const comparacion = useMemo(() => (datos.otras ? comparacionDelAnio(datos.otras, propia, anio) : null), [datos.otras, propia, anio])
  const sectores = useMemo(() => sectoresDe(indicadores, anio, anioActual), [indicadores, anio, anioActual])
  const equipo = useMemo(() => equipoDe(indicadores, personas, anio, anioActual), [indicadores, personas, anio, anioActual])
  const antiguedad = datos.antiguedadPorAnio[anio] ?? null
  const lectura = useMemo(() => lecturaDelTablero(cifras, anioActual, antiguedad), [cifras, anioActual, antiguedad])
  const atencion = useMemo(() => atencionDe(cifras, antiguedad, personasLeidas ? equipo.filter(p => p.sinAcceso).length : null), [cifras, antiguedad, equipo, personasLeidas])
  // Una secretaría también reporta los indicadores que lleva ella misma: se le avisa de los suyos, con un enlace que los lista.
  const propiosPorReportar = useMemo(() => pendientesDeReportar(proyectarLista(indicadores, anio), yoId), [indicadores, anio, yoId])
  const anios = aniosIniciados(anioActual)

  return (
    <Pagina>
      <header className={`flex flex-col gap-4 border-b ${T.reglaFuerte} pb-5 lg:flex-row lg:items-end lg:justify-between`}>
        <div className="min-w-0">
          <p className={T.rotulo}>Resumen · {datos.secretaria}</p>
          <h1 className="mt-0.5 text-[26px] font-semibold leading-tight tracking-tight text-[#192031]">Así va tu secretaría</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {anios.length > 1 && (
            <div role="group" aria-label="Año" className="flex flex-wrap items-center gap-2">
              <span className={`${T.rotulo} mr-1`}>Año</span>
              {anios.map(a => (
                <button key={a} type="button" aria-pressed={a === anio} onClick={() => setAnio(a)} className={`${BOTON} ${a === anio ? PUESTO : LIBRE}`}>{a}</button>
              ))}
            </div>
          )}
          {/* Proyectar es cosa de computador: en un teléfono en vertical la lámina sería un sello. */}
          <button ref={botonPresentar} type="button" onClick={() => setPresentando(true)} className={`${BOTON} ${PUESTO} hidden md:inline-flex`}>Presentar</button>
        </div>
      </header>

      {propiosPorReportar > 0 && (
        <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${T.avisoNota}`}>
          <p>
            Tienes <b className="tabular-nums">{propiosPorReportar}</b> {propiosPorReportar === 1 ? 'indicador a tu cargo' : 'indicadores a tu cargo'} por reportar en {anio}.
          </p>
          <Link href={`${HREF_INDICADORES}?usuario=${yoId}&filtro=por_reportar&anio=${anio}`} className={T.enlace}>Ver cuáles</Link>
        </div>
      )}

      <section aria-label="Lectura del año" className={`${T.panel} px-5 py-4`}>
        <p className="max-w-[62ch] text-lg font-medium leading-snug tracking-tight text-[#192031] [text-wrap:pretty] sm:text-xl">
          {lectura.titular.map((t, i) => (t.fuerte ? <b key={i} className="font-bold">{t.texto}</b> : <span key={i}>{t.texto}</span>))}
        </p>
        <p className={`mt-2 text-xs ${T.suave}`}>{lectura.detalle ? `${lectura.detalle} ` : ''}Cifras al {datos.corte}.</p>
      </section>

      <div role="group" aria-label="Medida de las comparaciones" className="flex flex-wrap items-center gap-2">
        <span className={`${T.rotulo} mr-1`}>Comparar por</span>
        {MEDIDAS.map(m => (
          <button key={m.clave} type="button" aria-pressed={medida === m.clave} onClick={() => setMedida(m.clave)} className={`${BOTON} ${medida === m.clave ? PUESTO : LIBRE}`}>{m.rotulo}</button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.3fr]">
        <div className="h-full min-w-0 md:col-span-2 lg:col-span-1"><PanelTuSecretaria c={cifras} anioActual={anioActual} /></div>
        <div className="h-full min-w-0"><PanelAlcaldia comparacion={comparacion} anio={anio} anioActual={anioActual} /></div>
        <div className="h-full min-w-0"><PanelComparacion comparacion={comparacion} medida={medida} /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="order-2 h-full min-w-0 lg:order-1"><PanelSectores sectores={sectores} anio={anio} medida={medida} /></div>
        <div className="order-1 h-full min-w-0 lg:order-2"><PanelAtencion items={atencion} anio={anio} /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="h-full min-w-0"><PanelRitmo ritmo={datos.ritmo} esAnioActual={anio === anioActual} anio={anio} /></div>
        <div className="h-full min-w-0"><PanelEquipo equipo={equipo} leido={personasLeidas} /></div>
      </div>

      <MetodoDeCalculo />

      {presentando && (
        <Presentacion
          onCerrar={cerrarPresentacion}
          datos={{ secretaria: datos.secretaria, anio, anioActual, cifras, comparacion, sectores, medida, lectura, corte: datos.corte }}
        />
      )}
    </Pagina>
  )
}
