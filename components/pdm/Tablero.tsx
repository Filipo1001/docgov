'use client'

/**
 * El tablero: lo que ve quien no quiere navegar el plan.
 *
 * Orden de lectura, de arriba abajo: cuatro cifras que dicen si hay que
 * preocuparse; cómo se reparte el plan por estado; dónde está cada secretaría y
 * cada línea; y por último la lista corta de lo que exige atención. Quien solo
 * lee las cuatro primeras tarjetas ya sabe si necesita seguir bajando.
 *
 * Todo se CALCULA a partir de los indicadores. Ninguna cifra de esta pantalla
 * se escribe a mano — que es justo lo que el archivo de Excel no puede decir de
 * su hoja de gráficos.
 */

import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  ESTADOS, ROTULO_RESPONSABLE, agrupar, estadoDe, fmt, fmtPct, haySeguimiento, resumir,
  sinResponsableUnico, tipoResponsable,
  type Indicador, type Resumen,
} from '@/lib/pdm/plan'
import { BarraEstados, Leyenda } from './Barras'

function Cifra({ titulo, valor, nota, tono = 'neutro' }: {
  titulo: string
  valor: string
  nota: string
  tono?: 'neutro' | 'alerta'
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className={`mt-2 text-3xl sm:text-4xl font-bold tabular-nums leading-none ${tono === 'alerta' ? 'text-red-600' : 'text-gray-900'}`}>
        {valor}
      </p>
      <p className="mt-2 text-xs sm:text-sm leading-snug text-gray-500">{nota}</p>
    </div>
  )
}

function FilaGrupo({ nombre, r, conSeguimiento, onClick }: { nombre: string; r: Resumen; conSeguimiento: boolean; onClick?: () => void }) {
  const contenido = (
    <div className="py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{nombre}</p>
        {conSeguimiento && <p className="shrink-0 text-sm font-bold tabular-nums text-gray-900">{fmtPct(r.cumplimiento)}</p>}
      </div>
      {conSeguimiento && <div className="mt-2"><BarraEstados r={r} alto="h-2" /></div>}
      <div className={`${conSeguimiento ? 'mt-2' : 'mt-1.5'} flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500`}>
        <span>{r.total} indicadores</span>
        {r.sinResponsable > 0 && (
          <span className="inline-flex items-center gap-1 font-medium text-red-700">
            <Icono glifo={Iconos.estado.advertencia} tamano="sm" />
            {r.sinResponsable} sin responsable único
          </span>
        )}
      </div>
    </div>
  )
  return onClick ? (
    <button onClick={onClick} className="block w-full text-left transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none">
      {contenido}
    </button>
  ) : contenido
}

export default function Tablero({
  lista, reportado, conEvidencia, controles, onAbrir, onVerDependencia,
}: {
  lista: Indicador[]
  reportado: Record<number, number>
  conEvidencia: number
  /** Vista de Control Interno: añade los controles de integridad. */
  controles?: boolean
  onAbrir: (id: number) => void
  onVerDependencia?: (dependencia: string) => void
}) {
  const r = resumir(lista, reportado)
  // Con el plan recién cargado, nadie ha reportado nada: «0 %» sería engañoso (suena a un plan que
  // no cumple, cuando es un plan que aún no ha empezado a medirse). Se dice tal cual.
  const conSeg = haySeguimiento(lista, reportado)
  const dependencias = agrupar(lista, i => i.dependencia)
  const lineas = agrupar(lista, i => i.linea).sort((a, b) => a[0].localeCompare(b[0]))

  const peso = (i: Indicador) => {
    const e = estadoDe(i, reportado[i.id])
    return (e === 'critico' ? 0 : e === 'atrasado' ? 1 : 2) + (sinResponsableUnico(i) ? 0 : 0.5)
  }
  const atencion = lista
    .filter(i => sinResponsableUnico(i) || ['critico', 'atrasado'].includes(estadoDe(i, reportado[i.id])))
    .sort((a, b) => peso(a) - peso(b))
  const porTipo = agrupar(lista.filter(sinResponsableUnico), i => tipoResponsable(i.responsable))

  return (
    <div className="space-y-5">

      {/* 1 · Cuatro cifras: ¿hay que preocuparse? */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra
          titulo="Cumplimiento provisional"
          valor={conSeg ? fmtPct(r.cumplimiento) : '—'}
          nota={conSeg
            ? `${r.cumplidos} de ${r.medibles} con meta 2026, según un criterio por definir`
            : `Aún no hay seguimiento: ${r.medibles} indicadores tienen meta 2026 y ninguno ha reportado`}
        />
        <Cifra
          titulo="Sin responsable único"
          valor={String(r.sinResponsable)}
          nota={`de ${r.total}: a nombre de un equipo, una oficina, varias personas o de nadie`}
          tono={r.sinResponsable ? 'alerta' : 'neutro'}
        />
        <Cifra
          titulo="Atrasados o críticos"
          valor={conSeg ? String(r.atrasados + r.criticos) : '—'}
          nota={conSeg
            ? `${r.criticos} críticos y ${r.atrasados} atrasados frente a su meta 2026`
            : 'Se calcula cuando haya avances reportados'}
        />
        <Cifra
          titulo="Con evidencia"
          valor={`${conEvidencia}`}
          nota={`de ${r.total}. Ningún reporte con evidencia todavía; el sistema la exige al reportar`}
        />
      </div>

      {/* 2 · Cómo se reparte el plan */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-bold text-gray-900">Estado del plan</h2>
        {conSeg ? (
          <>
            <div className="mt-3"><BarraEstados r={r} /></div>
            <div className="mt-3"><Leyenda r={r} /></div>
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            El plan está cargado con sus metas y sus responsables, y todavía sin avances: nadie ha
            reportado. Cuando lleguen los primeros reportes, aquí se verá cómo va cada indicador.
          </p>
        )}
        {r.sinMeta > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            {r.sinMeta} indicadores no tienen meta para 2026 y no entran en el cálculo.
          </p>
        )}
      </section>

      {/* 3 · Dónde está cada secretaría y cada línea.
          `min-w-0` en las tarjetas: un elemento de una cuadrícula no se encoge por debajo
          de su contenido, y el nombre de una secretaría en una sola línea empujaba la
          tarjeta a 404 px dentro de un teléfono de 375. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-gray-900">Por secretaría</h2>
          <div className="mt-1 divide-y divide-gray-100">
            {dependencias.map(([nombre, l]) => (
              <FilaGrupo
                key={nombre}
                nombre={nombre}
                r={resumir(l, reportado)}
                conSeguimiento={conSeg}
                onClick={onVerDependencia ? () => onVerDependencia(nombre) : undefined}
              />
            ))}
          </div>
        </section>
        <section className="min-w-0 rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-gray-900">Por línea estratégica</h2>
          <div className="mt-1 divide-y divide-gray-100">
            {lineas.map(([nombre, l]) => (
              <FilaGrupo key={nombre} nombre={nombre} r={resumir(l, reportado)} conSeguimiento={conSeg} />
            ))}
          </div>
        </section>
      </div>

      {/* 4 · Controles de integridad (Control Interno) */}
      {controles && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-bold text-gray-900">Controles de integridad</h2>
          <p className="mt-1 text-xs text-gray-500">Lo que Control Interno puede verificar sin pedirle un archivo a nadie.</p>
          <dl className="mt-3 divide-y divide-gray-100 text-sm">
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-gray-600">Indicadores sin persona que responda</dt>
              <dd className="font-bold tabular-nums text-gray-900">{r.sinResponsable}</dd>
            </div>
            {porTipo.map(([tipo, l]) => (
              <div key={tipo} className="flex items-baseline justify-between gap-4 py-2 pl-4">
                <dt className="text-xs text-gray-500">{ROTULO_RESPONSABLE[tipo as keyof typeof ROTULO_RESPONSABLE]}</dt>
                <dd className="text-xs font-semibold tabular-nums text-gray-700">{l.length}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-gray-600">Sin reporte en el corte</dt>
              <dd className="font-bold tabular-nums text-gray-900">{r.sinReporte}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-gray-600">Con evidencia adjunta</dt>
              <dd className="font-bold tabular-nums text-gray-900">{conEvidencia} de {r.total}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-gray-600">Sin meta definida para 2026</dt>
              <dd className="font-bold tabular-nums text-gray-900">{r.sinMeta}</dd>
            </div>
          </dl>
        </section>
      )}

      {/* 5 · Lo que exige atención */}
      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">Requieren atención</h2>
          <span className="text-xs text-gray-500">{atencion.length} indicadores</span>
        </div>
        <ul className="mt-1 divide-y divide-gray-100">
          {atencion.slice(0, 8).map(i => {
            const e = estadoDe(i, reportado[i.id])
            return (
              <li key={i.id}>
                <button
                  onClick={() => onAbrir(i.id)}
                  className="flex w-full items-start gap-3 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ESTADOS[e].punto}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug text-gray-900">{i.indicador}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {i.dependencia}
                      {sinResponsableUnico(i) && <span className="font-medium text-red-700"> · {ROTULO_RESPONSABLE[tipoResponsable(i.responsable)]}</span>}
                      {e === 'critico' || e === 'atrasado' ? ` · ${ESTADOS[e].rotulo}: ${fmt(i.avance)} de ${fmt(i.meta2026)}` : ''}
                    </span>
                  </span>
                  <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="mt-1 shrink-0 text-gray-300" />
                </button>
              </li>
            )
          })}
        </ul>
        {atencion.length > 8 && (
          <p className="pt-3 text-xs text-gray-500">Y {atencion.length - 8} más en la pestaña Indicadores.</p>
        )}
      </section>

      {conSeg && (
        <p className="px-1 text-xs leading-relaxed text-gray-500">
          Criterio provisional: un indicador se cuenta como cumplido cuando su avance alcanza la meta de 2026.
          Falta definir si el avance se reporta acumulado o del año, y qué umbrales separan «en ruta», «atrasado» y
          «crítico». Lo define la Alcaldía; una vez definido queda escrito en el sistema y se aplica igual a todos.
          Hasta entonces, este porcentaje es una referencia y no una cifra oficial.
        </p>
      )}
    </div>
  )
}
