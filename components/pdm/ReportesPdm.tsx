'use client'

/**
 * Reportes: cómo va un corte. Quién ya reportó, qué espera validación y qué falta, por secretaría.
 *
 * Es la pantalla de quien supervisa (la secretaría) y de quien audita (Control Interno): no se
 * reporta ni se valida desde aquí, sino que se ve dónde hace falta y se salta a la ficha del
 * indicador, donde sí se hace. Vale para cualquier corte, abierto o cerrado; los enlaces a la lista
 * de indicadores solo se ofrecen en el corte abierto, porque la lista habla del corte de hoy.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { fmt } from '@/lib/pdm/plan'
import { HREF_AJUSTES, HREF_INDICADORES, HREF_REPORTES } from '@/lib/pdm/menu'
import { fechaCorta, type Corte } from '@/lib/pdm/seguimiento'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import type { ReportesDelCorte } from '@/lib/pdm/reportes-armar'
import { gestiona, type NivelPdm } from '@/lib/pdm/niveles'
import EncabezadoSeccion from './EncabezadoSeccion'
import { Cifras } from './ui'
import { T } from './tema'

const MAX_LISTA = 10

/** Un número de la tabla: enlaza a la lista filtrada cuando se puede y hay algo que ver. */
function Numero({ n, href }: { n: number; href?: string }) {
  if (n === 0) return <span className="tabular-nums text-[#B8BFCC]">0</span>
  if (!href) return <span className="font-semibold tabular-nums text-[#192031]">{n}</span>
  return <Link href={href} className={`tabular-nums ${T.enlace}`}>{n}</Link>
}

export default function ReportesPdm({ cortes, corte, datos, nivel }: {
  cortes: Corte[]
  corte: Corte
  /** `null`: no se pudieron leer los reportes (se dice, no se pintan ceros). */
  datos: ReportesDelCorte | null
  nivel: NivelPdm
}) {
  const router = useRouter()
  const t = datos?.total
  const enlazar = (dependencia: string, filtro: 'por_reportar' | 'por_validar') =>
    corte.abierto ? `${HREF_INDICADORES}?dependencia=${encodeURIComponent(dependencia)}&filtro=${filtro}` : undefined

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <EncabezadoSeccion
        titulo="Reportes"
        datos={[
          { rotulo: 'Corte', valor: corte.nombre },
          { rotulo: 'Fecha de corte', valor: fechaCorta(corte.fecha) },
          { rotulo: 'Estado', valor: corte.abierto ? 'Abierto' : 'Cerrado' },
        ]}
      />

      {cortes.length > 1 && (
        <label className="block sm:w-96">
          <span className={T.rotulo}>Ver otro corte</span>
          <select
            id="pdm-corte"
            value={corte.id}
            onChange={e => router.push(`${HREF_REPORTES}?corte=${encodeURIComponent(e.target.value)}`)}
            className={`${T.campo} mt-1.5`}
          >
            {cortes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre} · {fechaCorta(c.fecha)}{c.abierto ? ' · abierto' : ''}</option>
            ))}
          </select>
        </label>
      )}

      {!datos || !t ? (
        <p role="alert" className={T.avisoMal}>
          No se pudieron leer los reportes de este corte. Recarga la página; si sigue igual, avisa a quien administra la plataforma.
        </p>
      ) : (
        <>
          <Cifras
            items={[
              {
                titulo: 'Con responsable',
                valor: String(t.conResponsable),
                nota: t.sinResponsable > 0 ? `Los únicos que pueden reportar. ${t.sinResponsable} más no tienen quién responda.` : 'Los únicos que pueden reportar.',
              },
              {
                titulo: 'Por reportar',
                valor: String(t.faltan + t.devueltos),
                nota: t.devueltos > 0 ? `Faltan ${t.faltan} y ${t.devueltos} fueron devueltos para corregir` : 'Todavía no han reportado',
              },
              { titulo: 'Sin validar', valor: String(t.porValidar), nota: 'Reportados, a la espera de la secretaría. Aún no cuentan' },
              { titulo: 'Aprobados', valor: String(t.aprobados), nota: 'Validados: ya cuentan en el cumplimiento', tono: t.aprobados > 0 ? 'bien' : 'neutro' },
            ]}
          />

          {t.sinResponsable > 0 && (
            <p className={`flex items-start gap-2 text-xs leading-relaxed ${T.avisoMal}`}>
              <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-0.5 shrink-0" />
              <span>
                {t.sinResponsable} {t.sinResponsable === 1 ? 'indicador no tiene' : 'indicadores no tienen'} responsable y nadie puede reportar{t.sinResponsable === 1 ? 'lo' : 'los'}.{' '}
                <Link href={`${HREF_INDICADORES}?filtro=sin_responsable`} className="font-semibold underline underline-offset-2">Verlos</Link>
              </span>
            </p>
          )}

          <section className={`overflow-hidden ${T.panel}`}>
            <h2 className={`${T.rotulo} border-b ${T.regla} px-4 py-3 sm:px-5`}>Por secretaría</h2>
            <div className={`hidden grid-cols-[1fr_7.5rem_6.5rem_6.5rem] gap-3 border-b ${T.regla} bg-[#F7F8FA] px-5 py-2 sm:grid`}>
              <span className={T.rotulo}>Secretaría</span>
              <span className={`${T.rotulo} text-right`}>Por reportar</span>
              <span className={`${T.rotulo} text-right`}>Sin validar</span>
              <span className={`${T.rotulo} text-right`}>Aprobados</span>
            </div>
            <ul className={`divide-y ${T.divide}`}>
              {datos.porSecretaria.map(({ dependencia, resumen: r }) => (
                <li key={dependencia} className="grid grid-cols-3 items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[1fr_7.5rem_6.5rem_6.5rem] sm:px-5">
                  <div className="col-span-3 min-w-0 sm:col-span-1">
                    <p className="truncate font-semibold text-[#192031]">{dependencia}</p>
                    <p className="text-xs text-[#667085]">{r.conResponsable} con responsable</p>
                  </div>
                  <p className="sm:text-right">
                    <span className="mr-1 text-[11px] text-[#667085] sm:hidden">Por reportar</span>
                    <Numero n={r.faltan + r.devueltos} href={enlazar(dependencia, 'por_reportar')} />
                  </p>
                  <p className="sm:text-right">
                    <span className="mr-1 text-[11px] text-[#667085] sm:hidden">Sin validar</span>
                    <Numero n={r.porValidar} href={enlazar(dependencia, 'por_validar')} />
                  </p>
                  <p className="sm:text-right">
                    <span className="mr-1 text-[11px] text-[#667085] sm:hidden">Aprobados</span>
                    <Numero n={r.aprobados} />
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className={`overflow-hidden ${T.panel}`}>
            <div className={`flex items-baseline justify-between gap-3 border-b ${T.regla} px-4 py-3 sm:px-5`}>
              <h2 className={T.rotulo}>{gestiona(nivel) ? 'Esperan validación' : 'Reportados sin validar'}</h2>
              <span className="text-xs text-[#667085]"><b className="tabular-nums text-[#192031]">{datos.porValidar.length}</b> {datos.porValidar.length === 1 ? 'reporte' : 'reportes'}</span>
            </div>
            {datos.porValidar.length === 0 ? (
              <p className="px-4 py-4 text-sm text-[#667085] sm:px-5">No hay reportes esperando validación en este corte.</p>
            ) : (
              <>
                <ul className={`divide-y ${T.divide}`}>
                  {datos.porValidar.slice(0, MAX_LISTA).map(({ indicador: i, reporte: r }) => (
                    <li key={i.id}>
                      <Link
                        href={`${HREF_INDICADORES}?abrir=${i.id}`}
                        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#F7F8FA] focus-visible:bg-[#F1F3F7] focus-visible:outline-none sm:px-5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug text-[#192031]">{i.indicador}</span>
                          <span className="mt-0.5 block text-xs text-[#667085]">
                            {i.dependencia} · {r.autorNombre} reportó <b className="tabular-nums text-[#192031]">{fmt(r.valor)}</b> · {fechaHoraBogota(r.creado)}
                            {r.esCorreccion ? ' · corrección' : ''}
                          </span>
                        </span>
                        <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="mt-0.5 shrink-0 text-[#98A2B3]" />
                      </Link>
                    </li>
                  ))}
                </ul>
                {datos.porValidar.length > MAX_LISTA && (
                  <p className={`border-t ${T.regla} px-4 py-3 text-xs text-[#667085] sm:px-5`}>
                    Y {datos.porValidar.length - MAX_LISTA} más
                    {corte.abierto && <>: <Link href={`${HREF_INDICADORES}?filtro=por_validar`} className={T.enlace}>verlos en Indicadores</Link></>}.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}

      {nivel === 'admin' && (
        <p className="px-1 text-xs text-[#667085]">
          Los cortes se crean, abren y cierran en <Link href={HREF_AJUSTES} className={T.enlace}>Ajustes</Link>.
        </p>
      )}
    </div>
  )
}
