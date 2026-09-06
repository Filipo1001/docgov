'use client'

/**
 * Panel de control de la alcaldía.
 *
 * Cuatro cifras, cuatro tarjetas y tres gráficas, en ese orden. Nada del ciclo
 * mensual —si una cuenta de cobro quedó sin revisar es del tablero del
 * supervisor—: aquí solo entra lo que el alcalde decide o le preguntan.
 *
 * Las gráficas van en SVG a mano, sin librería. Son tres formas de barra y no
 * justifican los ~500 KB de una librería de gráficos en el paquete que baja
 * cada usuario de la alcaldía.
 *
 * Cada una lleva un tratamiento distinto a propósito, porque responden
 * preguntas distintas:
 *   · Ejecución mensual  → barras verticales. Es una serie de tiempo.
 *   · Presupuesto        → barras horizontales apiladas. Es una composición.
 *   · Vencimientos       → línea de tiempo. Es un calendario.
 */

import { useQuery } from '@tanstack/react-query'
import {
  getResumenAlcalde,
  type TarjetaSecretaria, type PuntoMes, type Vencimiento,
} from '@/app/actions/alcalde'
import Avatar from '@/components/ui/Avatar'
import Card from '@/components/ui/Card'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { MARCA } from '@/lib/marca'

const millones = (n: number) =>
  n >= 1_000_000_000
    ? `$${(n / 1_000_000_000).toFixed(2).replace('.', ',')} mil M`
    : `$${Math.round(n / 1_000_000)} M`

const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })
    .format(new Date(iso + 'T12:00:00'))

// ─── Cifras de cabecera ─────────────────────────────────────────────────────

function Cifra({ valor, etiqueta, resaltada = false }: {
  valor: string; etiqueta: string; resaltada?: boolean
}) {
  return (
    <div className={`rounded-2xl p-4 ${resaltada ? 'bg-[#192031]' : 'bg-gray-50'}`}>
      <p className={`text-xl lg:text-2xl font-bold ${resaltada ? 'text-white' : ''}`}
         style={resaltada ? undefined : { color: MARCA }}>
        {valor}
      </p>
      <p className={`text-xs mt-0.5 ${resaltada ? 'text-white/60' : 'text-gray-500'}`}>{etiqueta}</p>
    </div>
  )
}

// ─── Gráfica 1 · Ejecución mensual (barras verticales) ──────────────────────

function EjecucionMensual({ serie, anio }: { serie: PuntoMes[]; anio: number }) {
  const max = Math.max(...serie.map(p => p.valor), 1)
  const cerrados = serie.filter(p => !p.enCurso)
  const promedio = cerrados.length
    ? cerrados.reduce((s, p) => s + p.valor, 0) / cerrados.length
    : 0

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="text-sm font-medium text-gray-900">Ejecución mensual {anio}</p>
        <p className="text-xs text-gray-400">promedio {millones(promedio)}/mes</p>
      </div>
      <p className="text-[11px] text-gray-400 mb-5">Pagos radicados a contratistas</p>

      <div className="flex items-end gap-2 h-44">
        {serie.map(p => {
          const alto = Math.max(2, (p.valor / max) * 100)
          return (
            <div key={p.mes} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <span className="text-[10px] text-gray-500 tabular-nums whitespace-nowrap">
                {p.valor > 0 ? millones(p.valor) : '—'}
              </span>
              <div className="w-full flex-1 flex items-end">
                <div
                  // El mes en curso va rayado, no lleno: el día 6 su barra es
                  // un muñón y sin distinguirla se leería como un desplome.
                  className={`w-full rounded-t-md transition-all ${
                    p.enCurso ? 'bg-gray-200 border border-dashed border-gray-400' : ''
                  }`}
                  style={{
                    height: `${alto}%`,
                    backgroundColor: p.enCurso ? undefined : MARCA,
                  }}
                  title={`${p.mes}: ${millones(p.valor)} · ${p.pagos} pagos`}
                />
              </div>
              <span className={`text-[10px] whitespace-nowrap ${p.enCurso ? 'text-gray-400 italic' : 'text-gray-500'}`}>
                {p.mes.slice(0, 3)}
              </span>
            </div>
          )
        })}
      </div>

      {serie.some(p => p.enCurso) && (
        <p className="text-[11px] text-gray-400 mt-3 text-right">
          {serie[serie.length - 1].mes} va en curso
        </p>
      )}
    </Card>
  )
}

// ─── Gráfica 2 · Presupuesto por secretaría (barras horizontales apiladas) ──

function PresupuestoPorSecretaria({ items, total }: { items: TarjetaSecretaria[]; total: number }) {
  return (
    <Card>
      <p className="text-sm font-medium text-gray-900 mb-1">Presupuesto por secretaría</p>
      <p className="text-[11px] text-gray-400 mb-5">
        Ejecutado y pendiente sobre {millones(total)} contratados
      </p>

      <div className="space-y-4">
        {items.map(s => {
          const anchoTotal = total ? (s.contratado / total) * 100 : 0
          const pctEjec = s.contratado ? (s.ejecutado / s.contratado) * 100 : 0
          return (
            <div key={s.id}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <p className="text-xs text-gray-700 truncate">{s.nombre}</p>
                <p className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                  <span className="font-semibold" style={{ color: MARCA }}>{millones(s.ejecutado)}</span>
                  {' / '}{millones(s.contratado)}
                </p>
              </div>
              {/* El ancho total de la barra es proporcional al peso de la
                  secretaría; el relleno oscuro, a lo ya ejecutado. Así se ven
                  las dos cosas —cuánto pesa y cuánto lleva— en una sola pieza. */}
              <div className="h-6 bg-gray-50 rounded-md overflow-hidden">
                <div className="h-full rounded-md bg-gray-200 flex" style={{ width: `${anchoTotal}%` }}>
                  <div
                    className="h-full rounded-l-md"
                    style={{ width: `${pctEjec}%`, backgroundColor: MARCA }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-5 pt-3 border-t border-gray-100">
        <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: MARCA }} /> Ejecutado
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-200" /> Por ejecutar
        </span>
      </div>
    </Card>
  )
}

// ─── Gráfica 3 · Vencimientos (línea de tiempo) ─────────────────────────────

function LineaVencimientos({ items }: { items: Vencimiento[] }) {
  if (items.length === 0) return null
  const maxContratos = Math.max(...items.map(v => v.contratos), 1)

  return (
    <Card>
      <p className="text-sm font-medium text-gray-900 mb-1">Cuándo terminan los contratos</p>
      <p className="text-[11px] text-gray-400 mb-6">
        Cada punto es un mes; su tamaño, cuántos contratos terminan
      </p>

      <div className="relative">
        {/* Riel */}
        <div className="absolute left-0 right-0 top-6 h-px bg-gray-200" />
        <div className="relative flex justify-between items-start gap-2">
          {items.map(v => {
            const escala = 0.45 + 0.55 * (v.contratos / maxContratos)
            const tam = Math.round(44 * escala)
            const grande = v.contratos / maxContratos > 0.5
            return (
              <div key={v.clave} className="flex flex-col items-center gap-2 min-w-0 flex-1">
                <div className="h-12 flex items-center justify-center">
                  <div
                    className={`rounded-full flex items-center justify-center font-bold text-white
                                ${grande ? 'ring-4 ring-red-100' : ''}`}
                    style={{
                      width: tam, height: tam,
                      backgroundColor: grande ? '#dc2626' : MARCA,
                      fontSize: tam > 32 ? 13 : 11,
                    }}
                    title={`${v.etiqueta}: ${v.contratos} contratos · ${millones(v.valor)}`}
                  >
                    {v.contratos}
                  </div>
                </div>
                <p className="text-[11px] text-gray-600 text-center whitespace-nowrap">
                  {v.etiqueta.split(' ')[0].slice(0, 3)}
                </p>
                <p className="text-[10px] text-gray-400 text-center whitespace-nowrap">
                  {millones(v.valor)}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ─── Tarjeta de secretaría ──────────────────────────────────────────────────

function Tarjeta({ s }: { s: TarjetaSecretaria }) {
  // Al día si lo ejecutado alcanza el plazo corrido, con 5 puntos de holgura:
  // el pago va un mes por detrás del servicio por definición del ciclo.
  const alDia = s.pctEjecutado >= s.pctPlazo - 5

  return (
    <button
      type="button"
      // Enlace pendiente: el detalle por secretaría aún no existe. Se deja el
      // gesto —cursor, elevación, galón— para enchufarlo sin rediseñar nada.
      aria-disabled="true"
      className="group text-left w-full bg-white rounded-2xl border border-gray-200 p-5
                 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer
                 focus:outline-none focus:ring-2 focus:ring-gray-300"
    >
      <div className="flex items-center gap-4">
        <Avatar nombre={s.secretario ?? s.nombre} foto={s.foto} size="lg" />

        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-gray-900 leading-tight">{s.nombre}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {s.secretario
              ? s.secretario.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')
              : 'Sin secretario asignado'}
          </p>
        </div>

        <div className="hidden sm:block text-center px-4 flex-shrink-0">
          <p className="text-2xl font-bold" style={{ color: MARCA }}>{s.contratistas}</p>
          <p className="text-[11px] text-gray-400">contratistas</p>
        </div>

        <Icono
          glifo={Iconos.accion.avanzar}
          tamano="sm"
          className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0"
        />
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xl font-bold" style={{ color: MARCA }}>{millones(s.ejecutado)}</p>
          <p className="text-sm text-gray-400">de {millones(s.contratado)}</p>
        </div>

        <div className="relative mt-2 h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${alDia ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(100, s.pctEjecutado)}%` }}
          />
          {/* Marca del plazo transcurrido: la referencia contra la que se lee */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-900/50"
            style={{ left: `${Math.min(100, s.pctPlazo)}%` }}
            title={`${s.pctPlazo}% del plazo transcurrido`}
          />
        </div>

        <div className="flex items-center justify-between mt-1.5">
          <span className={`text-xs font-medium ${alDia ? 'text-emerald-700' : 'text-amber-700'}`}>
            {s.pctEjecutado}% ejecutado
          </span>
          <div className="flex items-center gap-3">
            {s.vencenPronto > 0 && s.fechaVencimiento && (
              <span className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                {s.vencenPronto} vencen {fechaCorta(s.fechaVencimiento)}
              </span>
            )}
            <span className="text-[11px] text-gray-400">{s.pctPlazo}% del plazo</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Pantalla ───────────────────────────────────────────────────────────────

export default function AlcaldeHome({ nombre }: { nombre: string }) {
  const { data: res, isLoading } = useQuery({
    queryKey: ['resumen-alcalde'],
    queryFn: () => getResumenAlcalde(),
    staleTime: 5 * 60 * 1000,
  })

  const d = res?.data
  const saludo = nombre.split(' ').slice(0, 2)
    .map(w => w[0] + w.slice(1).toLowerCase()).join(' ')

  return (
    <div className="space-y-5">
      {/* El eslogan del plan de desarrollo va como tipografía: no es un
          logotipo, y compuesto así no depende de ningún archivo. */}
      <div>
        <p className="text-[11px] font-semibold uppercase text-gray-400" style={{ letterSpacing: '0.2em' }}>
          Por Amor a Fredonia
        </p>
        <h1 className="text-2xl font-bold mt-1.5" style={{ color: MARCA }}>
          Señor Alcalde {saludo}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Bienvenido a Contratista Digital</p>
      </div>

      {isLoading || !d ? (
        <div className="space-y-5 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl" />)}
          </div>
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Cifra valor={millones(d.contratadoTotal)} etiqueta="Contratado vigente" />
            <Cifra valor={millones(d.ejecutadoTotal)} etiqueta="Ejecutado" />
            <Cifra valor={millones(d.porEjecutar)} etiqueta="Por ejecutar" resaltada />
            <Cifra valor={String(d.contratistasTotal)} etiqueta="Contratistas activos" />
          </div>

          {/* Las secretarías, una por fila */}
          <div className="space-y-4">
            {d.secretarias.map(s => <Tarjeta key={s.id} s={s} />)}
          </div>

          <EjecucionMensual serie={d.serieMensual} anio={d.anio} />
          <PresupuestoPorSecretaria items={d.secretarias} total={d.contratadoTotal} />
          <LineaVencimientos items={d.vencimientos} />
        </>
      )}
    </div>
  )
}
