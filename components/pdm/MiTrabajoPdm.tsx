'use client'

/**
 * Mi trabajo: la pantalla de inicio de quien responde por indicadores.
 *
 * El tablero del plan (cumplimiento por secretaría, por línea) es para quien gestiona o vigila; a un
 * responsable le sirve otra cosa: saber qué le toca hacer hoy. Esta pantalla lo dice en este orden:
 *
 *   1. Las cuatro cifras del corte abierto, de un vistazo: qué falta, qué le devolvieron, qué espera a
 *      la secretaría y qué ya cuenta.
 *   2. Lo que le toca reportar, con lo devuelto primero (alguien ya lo miró y espera su respuesta).
 *   3. Lo que espera a la secretaría y lo aprobado.
 *   4. Sus grupos y con quién comparte el trabajo.
 *
 * Cada fila abre la ficha del indicador, donde se reporta. No hay botones que no lleven a ningún sitio.
 */

import { useMemo, useState } from 'react'
import type { Indicador } from '@/lib/pdm/plan'
import { fechaCorta, resumirCorte, type Seguimiento } from '@/lib/pdm/seguimiento'
import { esMio, miPapel, ordenarMiTrabajo, type GrupoMio, type SeccionTrabajo } from '@/lib/pdm/mi-trabajo'
import type { NivelPdm } from '@/lib/pdm/niveles'
import type { PersonaFicha } from '@/lib/pdm/personas'
import type { AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import EncabezadoSeccion from './EncabezadoSeccion'
import IndicadorModal from './IndicadorModal'
import { COLUMNAS, FilaIndicador } from './ListaIndicadores'
import MisGrupos from './MisGrupos'
import { Cifras, Panel, type Cifra } from './ui'
import { ACCIONES_SEGUIMIENTO_REALES } from './acciones-seguimiento-reales'
import { T } from './tema'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function ListaSeccion({ seccion, papel, yoId, onAbrir }: {
  seccion: SeccionTrabajo
  papel: (i: Indicador) => string
  yoId: string
  onAbrir: (id: number) => void
}) {
  return (
    <section className={`overflow-hidden ${T.panel}`}>
      <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b ${T.regla} px-4 py-3 sm:px-5`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className={T.rotulo}>{seccion.titulo}</h2>
          {seccion.nota && <span className={`text-xs ${T.tenue}`}>{seccion.nota}</span>}
        </div>
        <span className={`text-xs ${T.tenue}`}>
          <b className={`tabular-nums ${T.tinta}`}>{seccion.indicadores.length}</b> {seccion.indicadores.length === 1 ? 'indicador' : 'indicadores'}
        </span>
      </div>
      <div className={`hidden gap-x-4 border-b ${T.regla} bg-[#F7F8FA] px-5 py-2 md:grid ${COLUMNAS}`}>
        <span className={T.rotulo}>Código</span>
        <span className={T.rotulo}>Indicador</span>
        <span className={T.rotulo}>Tu papel</span>
        <span className={T.rotulo}>Avance / meta</span>
        <span className={T.rotulo}>Estado</span>
      </div>
      <div className={`divide-y ${T.divide}`}>
        {seccion.indicadores.map(i => (
          <FilaIndicador key={i.id} i={i} asignado={papel(i)} yoId={yoId} onAbrir={() => onAbrir(i.id)} />
        ))}
      </div>
    </section>
  )
}

export default function MiTrabajoPdm({
  indicadores, fichas, grupos, gruposLeidos, nivel, yoId, seguimiento, accionesSeguimiento = ACCIONES_SEGUIMIENTO_REALES,
}: {
  indicadores: Indicador[]
  fichas: Record<number, PersonaFicha>
  /** Los grupos de los que formo parte. */
  grupos: GrupoMio[]
  /** `false`: no se pudo leer el directorio, y entonces no se sabe si tengo grupos. */
  gruposLeidos: boolean
  nivel: NivelPdm
  yoId: string
  seguimiento: Seguimiento
  accionesSeguimiento?: AccionesSeguimiento
}) {
  const [abierto, setAbierto] = useState<number | null>(null)
  const indicador = abierto === null ? null : indicadores.find(i => i.id === abierto) ?? null

  const secciones = useMemo(() => ordenarMiTrabajo(indicadores, yoId), [indicadores, yoId])
  const mios = useMemo(() => indicadores.filter(i => esMio(i, yoId)), [indicadores, yoId])
  const nombreDeGrupo = useMemo(() => new Map(grupos.map(g => [g.id, g.nombre])), [grupos])

  const corte = seguimiento.abierto
  const c = resumirCorte(mios.map(i => i.enCorte?.situacion ?? null))
  const nada = corte !== null && mios.length > 0 && !secciones.some(s => s.clave === 'reportar')

  // Mi papel en un indicador, tal como lo dice mi fila: principal o apoyo, y de qué grupo vino.
  function papel(i: Indicador): string {
    const p = miPapel(i, yoId)
    if (!p) return ''
    const grupo = p.grupoId ? nombreDeGrupo.get(p.grupoId) : undefined
    return `${p.principal ? 'Principal' : 'Apoyo'}${grupo ? ` · ${grupo}` : ''}`
  }

  const cifras: Cifra[] = [
    { titulo: 'Falta reportar', valor: String(c.faltan), nota: 'indicadores sin reporte en este corte' },
    {
      titulo: 'Devueltos',
      valor: String(c.devueltos),
      nota: 'la secretaría espera tu respuesta',
      tono: c.devueltos > 0 ? 'alerta' : 'neutro',
    },
    { titulo: 'Sin validar', valor: String(c.porValidar), nota: 'reportados; esperan a la secretaría' },
    {
      titulo: 'Aprobados',
      valor: String(c.aprobados),
      nota: 'ya cuentan en el cumplimiento',
      tono: c.aprobados > 0 ? 'bien' : 'neutro',
    },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <EncabezadoSeccion
        titulo="Mi trabajo"
        datos={[
          { rotulo: 'A tu cargo', valor: plural(mios.length, 'indicador', 'indicadores') },
          ...(grupos.length > 0 ? [{ rotulo: 'Grupos', valor: String(grupos.length) }] : []),
          { rotulo: 'Corte', valor: corte ? corte.nombre : 'Sin corte abierto' },
          ...(corte ? [{ rotulo: 'Fecha de corte', valor: fechaCorta(corte.fecha) }] : []),
        ]}
      />

      {mios.length === 0 ? (
        <Panel>
          <p className={`text-sm font-medium ${T.tinta}`}>Todavía no tienes indicadores a tu cargo.</p>
          <p className={`mt-1 text-sm ${T.suave}`}>Cuando tu secretaría te asigne alguno, aparecerá aquí y podrás reportarlo en cada corte.</p>
        </Panel>
      ) : (
        <>
          {corte ? (
            <Cifras items={cifras} />
          ) : (
            <p className={T.avisoNota}>No hay un corte abierto, así que por ahora no hay nada que reportar. Cuando se abra uno, aquí verás lo que te toca.</p>
          )}
          {nada && <p className={T.avisoBien}>No tienes nada pendiente por reportar en «{corte.nombre}».</p>}
          {secciones.map(s => <ListaSeccion key={s.clave} seccion={s} papel={papel} yoId={yoId} onAbrir={setAbierto} />)}
        </>
      )}

      {grupos.length > 0 && <MisGrupos grupos={grupos} />}
      {!gruposLeidos && (
        <p className={`text-xs ${T.tenue}`}>No se pudieron leer tus grupos en este momento. Vuelve a cargar la página para intentarlo de nuevo.</p>
      )}

      <IndicadorModal
        key={abierto ?? 'cerrado'}
        indicador={indicador}
        onCerrar={() => setAbierto(null)}
        seguimiento={{ nivel, yoId, corteAbierto: corte, acciones: accionesSeguimiento }}
        persona={indicador ? fichas[indicador.id] : undefined}
      />
    </div>
  )
}
