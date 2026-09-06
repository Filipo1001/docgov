'use client'

/**
 * Home del rol Alcalde: cuatro tarjetas y nada más.
 *
 * Una por secretaría con operación. Cada una responde tres cosas de un
 * vistazo y sin párrafos —cuánto pesa, si va al día, si algo se le vence—
 * porque quien la mira no viene a leer un informe: viene a saber a quién
 * llamar.
 *
 * LA BARRA ES EL CORAZÓN DE LA TARJETA. Muestra lo ejecutado sobre lo
 * contratado, con una marca vertical en el punto del plazo ya transcurrido.
 * Si el relleno llega a la marca, van al día. Si se queda corto, no. Eso
 * evita la lectura al revés: Bienestar Social ejecuta 24% y es la que mejor
 * va —solo ha corrido el 16% de su plazo—, mientras Hacienda ejecuta 61% con
 * el 66% corrido. Sin la marca, el alcalde felicitaría a la equivocada.
 *
 * Nada de alertas en bloque: el vencimiento próximo es un distintivo en la
 * esquina de la tarjeta que lo tiene, y el estado del mes es un punto de
 * color. Ambos se ven en un segundo y ninguno ocupa una línea de texto.
 */

import { useQuery } from '@tanstack/react-query'
import { getResumenAlcalde, type TarjetaSecretaria } from '@/app/actions/alcalde'
import Avatar from '@/components/ui/Avatar'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { MARCA } from '@/lib/marca'

/** Millones, que es la unidad en la que se habla de estos contratos. */
function millones(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2).replace('.', ',')} mil M`
  return `$${Math.round(n / 1_000_000)} M`
}

function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })
    .format(new Date(iso + 'T12:00:00'))
}

/** Nombre corto: «Secretaría de Hacienda» → «Hacienda». El alcalde sabe
 *  perfectamente que son secretarías; repetirlo cuatro veces es ruido. */
function corto(nombre: string): string {
  return nombre
    .replace(/^Secretar[íi]a\s+(General\s+y\s+de\s+|General\s+de\s+|de\s+)?/i, '')
    .trim() || nombre
}

const SEMAFORO: Record<'bien' | 'atencion' | 'mal', { punto: string; texto: string; etiqueta: string }> = {
  bien:     { punto: 'bg-emerald-500', texto: 'text-emerald-700', etiqueta: 'al día' },
  atencion: { punto: 'bg-amber-500',   texto: 'text-amber-700',   etiqueta: 'con pendientes' },
  mal:      { punto: 'bg-red-500',     texto: 'text-red-700',     etiqueta: 'atrasada' },
}

function Tarjeta({ s, mes }: { s: TarjetaSecretaria; mes: string }) {
  const sem = s.estadoMes ? SEMAFORO[s.estadoMes] : null
  // Al día si lo ejecutado alcanza el plazo corrido, con 5 puntos de tolerancia:
  // el pago va un mes por detrás del servicio por definición del ciclo.
  const alDia = s.pctEjecutado >= s.pctPlazo - 5

  return (
    <button
      type="button"
      // Enlace pendiente: el detalle por secretaría aún no existe. Se deja el
      // gesto —cursor, elevación, galón— para poder probar la navegación
      // completa el día que se construya, sin rediseñar la tarjeta.
      aria-disabled="true"
      className="group text-left w-full bg-white rounded-2xl border border-gray-200 p-5
                 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer
                 focus:outline-none focus:ring-2 focus:ring-gray-300"
    >
      {/* Secretario */}
      <div className="flex items-start gap-3">
        <Avatar nombre={s.secretario ?? corto(s.nombre)} foto={s.foto} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-semibold text-gray-900 leading-tight">{corto(s.nombre)}</p>
            <Icono
              glifo={Iconos.accion.avanzar}
              tamano="sm"
              className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0 mt-1"
            />
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {s.secretario
              ? s.secretario.split(' ').slice(0, 2).map(w => w[0] + w.slice(1).toLowerCase()).join(' ')
              : 'Sin secretario asignado'}
          </p>
          <p className="text-xs text-gray-400 mt-1.5">
            {s.contratistas} {s.contratistas === 1 ? 'contratista' : 'contratistas'}
          </p>
        </div>
      </div>

      {/* Plata */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-bold" style={{ color: MARCA }}>{millones(s.ejecutado)}</p>
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
          <span className="text-[11px] text-gray-400">{s.pctPlazo}% del plazo</span>
        </div>
      </div>

      {/* Señales: mes cerrado y vencimientos. Un punto y un distintivo. */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
        {sem ? (
          <span className="flex items-center gap-1.5 text-xs">
            <span className={`w-2 h-2 rounded-full ${sem.punto}`} />
            <span className={sem.texto}>{mes} {sem.etiqueta}</span>
          </span>
        ) : (
          <span className="text-xs text-gray-400">Sin periodos en {mes}</span>
        )}

        {s.vencenPronto > 0 && s.fechaVencimiento && (
          <span className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 whitespace-nowrap">
            {s.vencenPronto} vencen {fechaCorta(s.fechaVencimiento)}
          </span>
        )}
      </div>
    </button>
  )
}

export default function AlcaldeHome({ nombre }: { nombre: string }) {
  const { data: res, isLoading } = useQuery({
    queryKey: ['resumen-alcalde'],
    queryFn: () => getResumenAlcalde(),
    staleTime: 5 * 60 * 1000,
  })

  const d = res?.data
  const primerNombre = nombre.split(' ').slice(0, 2)
    .map(w => w[0] + w.slice(1).toLowerCase()).join(' ')

  return (
    <div className="space-y-6">
      {/* Recibimiento. El eslogan del plan de desarrollo va como tipografía:
          no hay archivo de logotipo, y compuesto así no envejece ni depende
          de un asset que alguien tenga que mantener. */}
      <div>
        <p
          className="text-[11px] font-semibold tracking-[0.2em] uppercase text-gray-400"
          style={{ letterSpacing: '0.2em' }}
        >
          Por Amor a Fredonia
        </p>
        <h1 className="text-2xl font-bold mt-1.5" style={{ color: MARCA }}>
          Señor Alcalde {primerNombre}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Bienvenido a Contratista Digital</p>
      </div>

      {isLoading || !d ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-64 bg-gray-100 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {d.secretarias.map(s => (
              <Tarjeta key={s.id} s={s} mes={d.mesCerrado} />
            ))}
          </div>

          {/* Cierre: el municipio en una línea. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-1 pt-1">
            <p className="text-sm text-gray-500">
              <span className="font-semibold" style={{ color: MARCA }}>{millones(d.ejecutadoTotal)}</span>
              {' '}ejecutados de {millones(d.contratadoTotal)} contratados
            </p>
            <p className="text-sm text-gray-400">{d.contratistasTotal} contratistas en total</p>
          </div>
        </>
      )}
    </div>
  )
}
