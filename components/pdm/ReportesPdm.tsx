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

const MAX_LISTA = 10

function Cifra({ titulo, valor, nota, tono = 'neutro' }: {
  titulo: string
  valor: number
  nota: string
  tono?: 'neutro' | 'aviso' | 'bien'
}) {
  const color = tono === 'aviso' ? 'text-amber-700' : tono === 'bien' ? 'text-emerald-700' : 'text-gray-900'
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className={`mt-2 text-3xl font-bold leading-none tabular-nums sm:text-4xl ${color}`}>{valor}</p>
      <p className="mt-2 text-xs leading-snug text-gray-500 sm:text-sm">{nota}</p>
    </div>
  )
}

/** Un número de la tabla: enlaza a la lista filtrada cuando se puede y hay algo que ver. */
function Numero({ n, href }: { n: number; href?: string }) {
  if (n === 0) return <span className="tabular-nums text-gray-300">0</span>
  if (!href) return <span className="font-semibold tabular-nums text-gray-900">{n}</span>
  return (
    <Link href={href} className="font-semibold tabular-nums text-teal-700 underline-offset-2 hover:underline">{n}</Link>
  )
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
        detalle={`${corte.nombre} · al ${fechaCorta(corte.fecha)} · ${corte.abierto ? 'abierto' : 'cerrado'}`}
      />

      {cortes.length > 1 && (
        <label className="flex flex-wrap items-center gap-2.5 text-sm">
          <span className="font-semibold text-gray-700">Corte</span>
          <select
            id="pdm-corte"
            value={corte.id}
            onChange={e => router.push(`${HREF_REPORTES}?corte=${encodeURIComponent(e.target.value)}`)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
          >
            {cortes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre} · {fechaCorta(c.fecha)}{c.abierto ? ' · abierto' : ''}</option>
            ))}
          </select>
        </label>
      )}

      {!datos || !t ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          No se pudieron leer los reportes de este corte. Recarga la página; si sigue igual, avisa a quien administra la plataforma.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra
              titulo="Con responsable"
              valor={t.conResponsable}
              nota={t.sinResponsable > 0 ? `Los únicos que pueden reportar. ${t.sinResponsable} más no tienen quién responda.` : 'Los únicos que pueden reportar.'}
            />
            <Cifra
              titulo="Por reportar"
              valor={t.faltan + t.devueltos}
              nota={t.devueltos > 0 ? `Faltan ${t.faltan} y ${t.devueltos} fueron devueltos para corregir` : 'Todavía no han reportado'}
              tono={t.faltan + t.devueltos > 0 ? 'aviso' : 'bien'}
            />
            <Cifra
              titulo="Sin validar"
              valor={t.porValidar}
              nota="Reportados, a la espera de la secretaría. Aún no cuentan"
              tono={t.porValidar > 0 ? 'aviso' : 'neutro'}
            />
            <Cifra titulo="Aprobados" valor={t.aprobados} nota="Validados: ya cuentan en el cumplimiento" tono="bien" />
          </div>

          {t.sinResponsable > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-800">
              <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-0.5 shrink-0" />
              <span>
                {t.sinResponsable} {t.sinResponsable === 1 ? 'indicador no tiene' : 'indicadores no tienen'} responsable y nadie puede reportar{t.sinResponsable === 1 ? 'lo' : 'los'}.{' '}
                <Link href={`${HREF_INDICADORES}?filtro=sin_responsable`} className="font-semibold underline underline-offset-2">Verlos</Link>
              </span>
            </p>
          )}

          <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
            <h2 className="text-sm font-bold text-gray-900">Por secretaría</h2>
            <div className="mt-2 hidden grid-cols-[1fr_6.5rem_6rem_6rem] gap-3 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:grid">
              <span>Secretaría</span>
              <span className="text-right">Por reportar</span>
              <span className="text-right">Sin validar</span>
              <span className="text-right">Aprobados</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {datos.porSecretaria.map(({ dependencia, resumen: r }) => (
                <li key={dependencia} className="grid grid-cols-3 items-baseline gap-x-3 gap-y-1 px-1 py-3 text-sm sm:grid-cols-[1fr_6.5rem_6rem_6rem]">
                  <div className="col-span-3 min-w-0 sm:col-span-1">
                    <p className="truncate font-semibold text-gray-900">{dependencia}</p>
                    <p className="text-xs text-gray-500">{r.conResponsable} con responsable</p>
                  </div>
                  <p className="sm:text-right">
                    <span className="mr-1 text-[11px] text-gray-500 sm:hidden">Por reportar</span>
                    <Numero n={r.faltan + r.devueltos} href={enlazar(dependencia, 'por_reportar')} />
                  </p>
                  <p className="sm:text-right">
                    <span className="mr-1 text-[11px] text-gray-500 sm:hidden">Sin validar</span>
                    <Numero n={r.porValidar} href={enlazar(dependencia, 'por_validar')} />
                  </p>
                  <p className="sm:text-right">
                    <span className="mr-1 text-[11px] text-gray-500 sm:hidden">Aprobados</span>
                    <Numero n={r.aprobados} />
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-bold text-gray-900">{gestiona(nivel) ? 'Esperan validación' : 'Reportados sin validar'}</h2>
              <span className="text-xs text-gray-500">{datos.porValidar.length} {datos.porValidar.length === 1 ? 'reporte' : 'reportes'}</span>
            </div>
            {datos.porValidar.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No hay reportes esperando validación en este corte.</p>
            ) : (
              <>
                <ul className="mt-1 divide-y divide-gray-100">
                  {datos.porValidar.slice(0, MAX_LISTA).map(({ indicador: i, reporte: r }) => (
                    <li key={i.id}>
                      <Link
                        href={`${HREF_INDICADORES}?abrir=${i.id}`}
                        className="flex items-start gap-3 py-3 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug text-gray-900">{i.indicador}</span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {i.dependencia} · {r.autorNombre} reportó <b className="tabular-nums text-gray-700">{fmt(r.valor)}</b> · {fechaHoraBogota(r.creado)}
                            {r.esCorreccion ? ' · corrección' : ''}
                          </span>
                        </span>
                        <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="mt-1 shrink-0 text-gray-300" />
                      </Link>
                    </li>
                  ))}
                </ul>
                {datos.porValidar.length > MAX_LISTA && (
                  <p className="pt-3 text-xs text-gray-500">
                    Y {datos.porValidar.length - MAX_LISTA} más
                    {corte.abierto && <>: <Link href={`${HREF_INDICADORES}?filtro=por_validar`} className="font-semibold text-teal-700 underline underline-offset-2">verlos en Indicadores</Link></>}.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}

      {nivel === 'admin' && (
        <p className="px-1 text-xs text-gray-500">
          Los cortes se crean, abren y cierran en <Link href={HREF_AJUSTES} className="font-semibold text-teal-700 underline underline-offset-2">Ajustes</Link>.
        </p>
      )}
    </div>
  )
}
