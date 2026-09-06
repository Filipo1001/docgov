'use client'

/**
 * Home del rol Alcalde. Una sola pantalla, sin acciones.
 *
 * Responde «¿cómo vamos y a quién llamo?». Todo lo que responde «¿qué hago
 * ahora?» pertenece a otro rol y aquí sería ruido: no hay aprobar, rechazar,
 * radicar ni corregir, ni el detalle de actividades, evidencias, planillas u
 * obligaciones. Tampoco datos personales: la pantalla se arma con totales,
 * así que nunca transporta cédulas, cuentas bancarias ni teléfonos.
 *
 * El orden es el de las decisiones que sí son suyas:
 *   1. Lo que se le vence encima     → renovar o dejar caer el servicio
 *   2. Cuánto pesa la nómina         → el dato que le piden en concejo
 *   3. Cómo cerró el último mes      → si el ciclo funciona
 *   4. Qué secretaría va atrasada    → la llamada concreta
 *   5. Cuánto respaldo documental    → su defensa ante un ente de control
 */

import { useQuery } from '@tanstack/react-query'
import { getResumenAlcalde, type FilaSecretaria } from '@/app/actions/alcalde'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

const money = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

/** Compacto para las cifras grandes: $2.496 millones se lee de un vistazo. */
function moneyCorto(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2).replace('.', ',')} mil M`
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)} M`
  return money(n)
}

function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(iso + 'T12:00:00'))
}

/** Verde ≥90, ámbar 70–89, rojo <70. Un umbral fijo evita que el peor del mes
 *  se pinte de rojo aunque vaya bien, que es lo que pasa al colorear por ranking. */
function tono(pct: number) {
  if (pct >= 90) return { texto: 'text-emerald-700', barra: 'bg-emerald-500', fondo: 'bg-emerald-50' }
  if (pct >= 70) return { texto: 'text-amber-700', barra: 'bg-amber-500', fondo: 'bg-amber-50' }
  return { texto: 'text-red-700', barra: 'bg-red-500', fondo: 'bg-red-50' }
}

function Cifra({ valor, etiqueta, nota }: { valor: string; etiqueta: string; nota?: string }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-5">
      <p className="text-2xl font-bold text-gray-900">{valor}</p>
      <p className="text-sm text-gray-500 mt-0.5">{etiqueta}</p>
      {nota && <p className="text-[11px] text-gray-400 mt-1">{nota}</p>}
    </div>
  )
}

export default function AlcaldeHome({ nombre }: { nombre: string }) {
  const { data: res, isLoading } = useQuery({
    queryKey: ['resumen-alcalde'],
    queryFn: () => getResumenAlcalde(),
    staleTime: 5 * 60 * 1000,
  })

  const d = res?.data

  if (isLoading || !d) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-72" />
        <div className="h-24 bg-gray-100 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
        </div>
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  const t = tono(d.pctCerrado)
  const delta = d.pctPrevio === null ? null : d.pctCerrado - d.pctPrevio

  // Solo lo que vence dentro de 30 días sube al aviso. Más allá no es urgencia,
  // y un aviso permanente deja de leerse.
  const inminentes = d.vencimientos.filter(v => v.dias <= 30)
  const contratosInminentes = inminentes.reduce((s, v) => s + v.contratos, 0)
  const valorInminente = inminentes.reduce((s, v) => s + v.valor, 0)
  const pctCartera = d.contratosVigentes
    ? Math.round(100 * contratosInminentes / d.contratosVigentes)
    : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${saludo()}, ${nombre.split(' ')[0]}`}
        subtitle={`${d.contratosVigentes} contratos de prestación de servicios vigentes`}
      />

      {/* 1 · Lo que se vence. Va primero porque es lo único con fecha límite. */}
      {inminentes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="text-red-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-800">
                {contratosInminentes === 1
                  ? 'Un contrato vence en los próximos 30 días'
                  : `${contratosInminentes} contratos vencen en los próximos 30 días`}
              </p>
              <p className="text-xs text-red-700/90 mt-1 leading-relaxed">
                Son {money(valorInminente)} y el {pctCartera}% de los contratos vigentes.
                Renovarlos o dejarlos terminar es una decisión con fecha: después del
                vencimiento no hay contrato al que prorrogar.
              </p>
              <div className="mt-3 space-y-1.5">
                {inminentes.map(v => (
                  <div key={v.fecha} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-red-900 font-medium">
                      {fechaLarga(v.fecha)}
                      <span className="text-red-700/70 font-normal">
                        {' '}· en {v.dias} {v.dias === 1 ? 'día' : 'días'}
                      </span>
                    </span>
                    <span className="text-red-800 tabular-nums flex-shrink-0">
                      {v.contratos} {v.contratos === 1 ? 'contrato' : 'contratos'} · {moneyCorto(v.valor)}
                    </span>
                  </div>
                ))}
              </div>
              {inminentes[0]?.secretarias.length > 0 && (
                <p className="text-[11px] text-red-700/70 mt-2">
                  Concentrados en: {inminentes[0].secretarias.join(' · ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2 · Cuánto pesa */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Cifra valor={moneyCorto(d.valorVigente)} etiqueta="Valor contratado vigente" />
        <Cifra valor={moneyCorto(d.pagadoAnio)} etiqueta={`Pagado en ${d.anioCerrado}`} nota={`${d.pagosRadicados} cuentas radicadas`} />
        <Cifra valor={String(d.personas)} etiqueta="Personas contratadas" />
        <Cifra valor={String(d.documentosEmitidos)} etiqueta="Documentos verificables" nota="Con código y QR, comprobables por terceros" />
      </div>

      {/* 3 · Cómo cerró el último mes cerrado */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              Cierre de {d.mesCerrado} {d.anioCerrado}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Último mes cerrado. {d.mesActual} sigue en curso.
            </p>
          </div>
          {/* Sin periodos no hay nota. Un 0% ahí diría «incumplieron» cuando lo
              que pasa es que no había nada que cumplir — el caso de un
              municipio en su primer mes. */}
          <div className="text-right">
            {d.totalCerrado === 0 ? (
              <p className="text-sm text-gray-400">Sin periodos en {d.mesCerrado}</p>
            ) : (
              <>
                <p className={`text-3xl font-bold ${t.texto}`}>{d.pctCerrado}%</p>
                <p className="text-xs text-gray-500">
                  {d.cerradosCerrado} de {d.totalCerrado} completaron el ciclo
                </p>
              </>
            )}
          </div>
        </div>

        {d.totalCerrado > 0 && (
          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${t.barra} rounded-full transition-all`} style={{ width: `${d.pctCerrado}%` }} />
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {delta !== null && d.totalCerrado > 0 && (
            <span className={delta < 0 ? 'text-red-600' : delta > 0 ? 'text-emerald-600' : 'text-gray-500'}>
              {delta === 0
                ? `Igual que en ${d.mesPrevio}`
                : `${Math.abs(delta)} puntos ${delta > 0 ? 'más' : 'menos'} que en ${d.mesPrevio}`}
            </span>
          )}
          {/* El mes en curso va contado, no calificado: el día 6 un porcentaje
              bajo no significa incumplimiento, significa que apenas empieza. */}
          <span className="text-gray-500">
            {d.mesActual}: {d.enviadosActual} de {d.totalActual} informes ya enviados
          </span>
        </div>
      </Card>

      {/* 4 · A quién llamar */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icono glifo={Iconos.navegacion.dependencias} tamano="sm" className="text-gray-400" />
          <p className="text-sm font-medium text-gray-900">Por secretaría, en {d.mesCerrado}</p>
        </div>
        <p className="text-[11px] text-gray-400 mb-4">
          Sobre los contratos que tenían periodo ese mes. Los que empezaron después no cuentan:
          no podían reportar.
        </p>

        <div className="space-y-3">
          {d.secretarias.map((s: FilaSecretaria) => {
            const st = tono(s.pct)
            return (
              <div key={s.nombre} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm text-gray-900 truncate">{s.nombre}</p>
                    {s.conPeriodo === 0 ? (
                      <span className="text-xs text-gray-400 flex-shrink-0">sin periodos en {d.mesCerrado}</span>
                    ) : (
                      <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${st.texto}`}>
                        {s.pct}%
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${st.barra} rounded-full`} style={{ width: `${s.pct}%` }} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {s.conPeriodo > 0
                      ? <>
                          {s.cerrados} de {s.conPeriodo} cerrados
                          {s.sinEnviar > 0 && ` · ${s.sinEnviar} sin enviar`}
                          {s.esperando > 0 && ` · ${s.esperando} esperando aprobación`}
                        </>
                      : <>{s.contratosVigentes} contratos vigentes hoy</>}
                    {' · '}{moneyCorto(s.valorVigente)} vigentes
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
