'use client'

/**
 * El tablero: lo que ve quien no quiere navegar el plan.
 *
 * Orden de lectura, de arriba abajo: la franja de cifras, que dice si hay que preocuparse; cómo se
 * reparte el plan por estado; dónde está cada secretaría y cada línea; y por último la lista corta de
 * lo que exige atención. Quien solo lee la franja ya sabe si necesita seguir bajando.
 *
 * Todo se CALCULA a partir de los indicadores. Ninguna cifra de esta pantalla se escribe a mano —
 * que es justo lo que el archivo de Excel no puede decir de su hoja de gráficos.
 */

import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  agrupar, estadoDe, fmt, fmtPct, haySeguimiento, resumir, sinAsignar,
  type Indicador, type Resumen,
} from '@/lib/pdm/plan'
import { MODOS, claveModo, resumirCorte, type AvanceModo, type Corte } from '@/lib/pdm/seguimiento'
import { BarraEstados, Leyenda } from './Barras'
import { Cifras, EstadoTexto, Panel, type Cifra } from './ui'
import { T } from './tema'

function FilaGrupo({ nombre, r, conSeguimiento, onClick }: { nombre: string; r: Resumen; conSeguimiento: boolean; onClick?: () => void }) {
  const contenido = (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-[#192031]">{nombre}</p>
        {conSeguimiento && <p className="shrink-0 text-sm font-semibold tabular-nums text-[#192031]">{fmtPct(r.cumplimiento)}</p>}
      </div>
      {conSeguimiento && <div className="mt-2"><BarraEstados r={r} alto="h-1.5" /></div>}
      <div className={`${conSeguimiento ? 'mt-2' : 'mt-1'} flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#667085]`}>
        <span><b className="font-semibold tabular-nums text-[#192031]">{r.total}</b> indicadores</span>
        {r.sinResponsable > 0 && (
          <span className="inline-flex items-center gap-1 font-medium text-[#B42318]">
            <Icono glifo={Iconos.estado.advertencia} tamano="sm" />
            {r.sinResponsable} sin responsable
          </span>
        )}
      </div>
    </div>
  )
  return onClick ? (
    <button onClick={onClick} className="block w-full text-left transition-colors hover:bg-[#F7F8FA] focus-visible:bg-[#F1F3F7] focus-visible:outline-none">
      {contenido}
    </button>
  ) : contenido
}

export default function Tablero({
  lista, criterio, corteAbierto, controles, onAbrir, onVerDependencia,
}: {
  lista: Indicador[]
  /** Qué significa el avance en este plan; `null`: por definir (el cumplimiento es provisional). */
  criterio: AvanceModo | null
  /** El corte donde hoy se reporta, si hay uno. */
  corteAbierto: Corte | null
  /** Vista de Control Interno: añade los controles de integridad. */
  controles?: boolean
  onAbrir: (id: number) => void
  onVerDependencia?: (dependencia: string) => void
}) {
  const r = resumir(lista)
  // Con el plan recién cargado, nadie ha validado nada: «0 %» sería engañoso (suena a un plan que
  // no cumple, cuando es un plan que aún no ha empezado a medirse). Se dice tal cual.
  const conSeg = haySeguimiento(lista)
  const dependencias = agrupar(lista, i => i.dependencia)
  const lineas = agrupar(lista, i => i.linea).sort((a, b) => a[0].localeCompare(b[0]))
  const modo = MODOS[claveModo(criterio)]
  const corte = corteAbierto ? resumirCorte(lista.map(i => i.enCorte?.situacion ?? null)) : null

  const peso = (i: Indicador) => {
    const e = estadoDe(i)
    return (e === 'critico' ? 0 : e === 'atrasado' ? 1 : 2) + (sinAsignar(i) ? 0 : 0.5)
  }
  const atencion = lista
    .filter(i => sinAsignar(i) || ['critico', 'atrasado'].includes(estadoDe(i)))
    .sort((a, b) => peso(a) - peso(b))

  const cifras: Cifra[] = [
    {
      titulo: criterio ? 'Cumplimiento' : 'Cumplimiento provisional',
      valor: conSeg ? fmtPct(r.cumplimiento) : '—',
      nota: conSeg
        ? `${r.cumplidos} de ${r.medibles} con meta, ${criterio ? `según el avance ${criterio === 'anual' ? 'del año' : 'acumulado'} validado` : 'según un criterio por definir'}`
        : `Aún no hay seguimiento: ${r.medibles} indicadores tienen meta y ninguno tiene un avance validado`,
    },
    {
      titulo: 'Sin responsable',
      valor: String(r.sinResponsable),
      nota: `de ${r.total}: nadie los tiene asignado en la plataforma`,
      tono: r.sinResponsable ? 'alerta' : 'neutro',
    },
    {
      titulo: 'Atrasados o críticos',
      valor: conSeg ? String(r.atrasados + r.criticos) : '—',
      nota: conSeg
        ? `${r.criticos} críticos y ${r.atrasados} atrasados frente a su meta`
        : 'Se calcula cuando haya avances validados',
    },
    corte && corteAbierto
      ? {
          titulo: 'Reportes del corte',
          valor: `${corte.porValidar + corte.aprobados + corte.devueltos}`,
          nota: `de ${corte.conResponsable} con responsable en «${corteAbierto.nombre}»: ${corte.porValidar} sin validar, ${corte.aprobados} ${corte.aprobados === 1 ? 'aprobado' : 'aprobados'}, ${corte.devueltos} ${corte.devueltos === 1 ? 'devuelto' : 'devueltos'}`,
        }
      : {
          titulo: 'Corte',
          valor: '—',
          nota: 'No hay un corte abierto: por ahora nadie puede reportar avances',
        },
  ]

  return (
    <div className="space-y-5">
      <Cifras items={cifras} />

      <Panel titulo="Estado del plan">
        {conSeg ? (
          <>
            <BarraEstados r={r} />
            <div className="mt-3"><Leyenda r={r} /></div>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-[#556072]">
            El plan está cargado con sus metas y sus responsables, y todavía sin avances validados.
            Cada reporte cuenta cuando la secretaría lo aprueba; desde entonces aquí se verá cómo va cada indicador.
          </p>
        )}
        {r.sinMeta > 0 && (
          <p className="mt-3 text-xs text-[#667085]">
            {r.sinMeta} indicadores no tienen meta y no entran en el cálculo.
          </p>
        )}
      </Panel>

      {/* `min-w-0` en los paneles: un elemento de una cuadrícula no se encoge por debajo de su
          contenido, y el nombre de una secretaría en una sola línea empujaba el panel a 404 px
          dentro de un teléfono de 375. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`min-w-0 overflow-hidden ${T.panel}`}>
          <h2 className={`${T.rotulo} border-b ${T.regla} px-4 py-3 sm:px-5`}>Por secretaría</h2>
          <div className={`divide-y ${T.divide}`}>
            {dependencias.map(([nombre, l]) => (
              <FilaGrupo
                key={nombre}
                nombre={nombre}
                r={resumir(l)}
                conSeguimiento={conSeg}
                onClick={onVerDependencia ? () => onVerDependencia(nombre) : undefined}
              />
            ))}
          </div>
        </section>
        <section className={`min-w-0 overflow-hidden ${T.panel}`}>
          <h2 className={`${T.rotulo} border-b ${T.regla} px-4 py-3 sm:px-5`}>Por línea estratégica</h2>
          <div className={`divide-y ${T.divide}`}>
            {lineas.map(([nombre, l]) => (
              <FilaGrupo key={nombre} nombre={nombre} r={resumir(l)} conSeguimiento={conSeg} />
            ))}
          </div>
        </section>
      </div>

      {/* Controles de integridad (Control Interno) */}
      {controles && (
        <Panel titulo="Controles de integridad" nota="Lo que Control Interno puede verificar sin pedirle un archivo a nadie">
          <dl className={`divide-y ${T.divide} text-sm`}>
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[#556072]">Indicadores sin persona que responda</dt>
              <dd className="font-semibold tabular-nums text-[#192031]">{r.sinResponsable}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[#556072]">Sin avance validado</dt>
              <dd className="font-semibold tabular-nums text-[#192031]">{r.sinReporte}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[#556072]">Sin meta definida</dt>
              <dd className="font-semibold tabular-nums text-[#192031]">{r.sinMeta}</dd>
            </div>
          </dl>
        </Panel>
      )}

      {/* Lo que exige atención */}
      <section className={`overflow-hidden ${T.panel}`}>
        <div className={`flex items-baseline justify-between gap-3 border-b ${T.regla} px-4 py-3 sm:px-5`}>
          <h2 className={T.rotulo}>Requieren atención</h2>
          <span className="text-xs text-[#667085]"><b className="tabular-nums text-[#192031]">{atencion.length}</b> indicadores</span>
        </div>
        <ul className={`divide-y ${T.divide}`}>
          {atencion.slice(0, 8).map(i => {
            const e = estadoDe(i)
            return (
              <li key={i.id}>
                <button
                  onClick={() => onAbrir(i.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F7F8FA] focus-visible:bg-[#F1F3F7] focus-visible:outline-none sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug text-[#192031]">{i.indicador}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#667085]">
                      <span>{i.dependencia}</span>
                      {sinAsignar(i) && <span className="font-medium text-[#B42318]">Sin responsable</span>}
                      {(e === 'critico' || e === 'atrasado') && (
                        <span className="inline-flex items-center gap-2">
                          <EstadoTexto estado={e} />
                          <span className="tabular-nums">{fmt(i.avance)} de {fmt(i.metaMedida)}</span>
                        </span>
                      )}
                    </span>
                  </span>
                  <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="mt-0.5 shrink-0 text-[#98A2B3]" />
                </button>
              </li>
            )
          })}
        </ul>
        {atencion.length > 8 && (
          <p className={`border-t ${T.regla} px-4 py-3 text-xs text-[#667085] sm:px-5`}>Y {atencion.length - 8} más en la pestaña Indicadores.</p>
        )}
      </section>

      {conSeg && (
        <p className={`text-xs leading-relaxed ${T.avisoNota}`}>
          {criterio === null ? (
            <>
              <b>Criterio provisional.</b> Un indicador se cuenta como cumplido cuando su avance validado alcanza la meta de 2026.
              Falta definir si el avance se reporta acumulado o del año, y qué umbrales separan «en ruta», «atrasado» y
              «crítico». Lo define la Alcaldía; una vez definido queda escrito en el sistema y se aplica igual a todos.
              Hasta entonces, este porcentaje es una referencia y no una cifra oficial.
            </>
          ) : (
            <>
              <b>{modo.titulo}.</b> Se mide contra la {modo.meta}. Un indicador se cuenta como cumplido cuando su avance validado
              la alcanza. Los umbrales que separan «en ruta», «atrasado» y «crítico» siguen por definir.
            </>
          )}
        </p>
      )}
    </div>
  )
}
