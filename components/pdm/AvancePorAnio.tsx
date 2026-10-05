'use client'

/**
 * El avance del plan, año por año: cuatro tarjetas con la MISMA anatomía y la misma escala, para que se comparen a
 * simple vista. Cada una dice cuánto lleva el año (avance promedio y cuántos indicadores alcanzaron su meta) y en qué
 * punto del reporte está cada indicador con meta (ver `lib/pdm/graficos.ts`).
 *
 * Las tarjetas SON el selector de año, como en «Mi trabajo»: elegir una cambia el detalle de abajo. Por eso, donde
 * se muestran, no hay un segundo selector de año (dos controles para lo mismo sería ruido).
 *
 * La leyenda lista siempre los cinco puntos, aunque valgan 0: una cifra que aparece y desaparece no deja comparar un
 * año con otro, y las filas quedan alineadas de una tarjeta a la siguiente.
 */

import { PARTES, ROTULO_DE_PARTE, pctLegible, type CuentaDeAnio } from '@/lib/pdm/graficos'
import { ROTULO_ESTADO_ANIO } from '@/lib/pdm/seguimiento'
import { BarraProgreso, BarraReportes, MarcadorDeParte } from './Barras'
import { T } from './tema'

function Tarjeta({ c, elegida, onElegir }: { c: CuentaDeAnio; elegida: boolean; onElegir: () => void }) {
  const proximo = c.estado === 'proximo'
  return (
    <button
      id={`pdm-grafico-anio-${c.anio}`}
      onClick={onElegir}
      aria-pressed={elegida}
      className={`flex min-w-0 flex-col rounded-lg border bg-white px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-2 ${
        elegida ? 'border-[#192031] ring-1 ring-inset ring-[#192031]' : `${proximo ? 'border-dashed' : ''} border-[#DCE0E8] hover:border-[#192031]`
      }`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={`text-[22px] font-semibold leading-none tracking-tight tabular-nums ${proximo ? 'text-[#667085]' : 'text-[#192031]'}`}>{c.anio}</span>
        <span className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${c.estado === 'en_curso' ? 'text-[#192031]' : 'text-[#667085]'}`}>
          {ROTULO_ESTADO_ANIO[c.estado]}
        </span>
      </span>

      {proximo ? (
        <>
          <span className={`mt-3 ${T.rotulo}`}>Se abre el 1 de enero</span>
          <span className="mt-1.5 text-sm text-[#667085]"><b className="font-semibold tabular-nums">{c.conMeta}</b> con meta</span>
          <span className="mt-auto pt-3 text-xs text-[#667085]">Aún no se puede reportar</span>
        </>
      ) : c.conMeta === 0 ? (
        <span className="mt-3 text-sm text-[#667085]">Sin metas en {c.anio}</span>
      ) : (
        <>
          <span className={`mt-3 ${T.rotulo}`}>Avance promedio</span>
          <span className="mt-1.5 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-[#192031]">{pctLegible(c.avancePromedio)}</span>
          <span className="mt-2.5 block"><BarraProgreso valor={c.avancePromedio} /></span>
          {/* Dos líneas de alto en el teléfono: la frase puede partirse, y todo lo de abajo debe quedar a la misma altura en las cuatro. */}
          <span className="mt-2 block min-h-8 text-xs leading-4 text-[#556072] lg:min-h-0">
            {c.avancePromedio === null
              ? 'Aún sin avance validado'
              : <><b className="font-semibold tabular-nums text-[#192031]">{c.alcanzaron}</b> de <span className="tabular-nums">{c.conMeta}</span> {c.alcanzaron === 1 ? 'alcanzó' : 'alcanzaron'} la meta</>}
          </span>

          <span className={`mt-3 border-t pt-3 ${T.regla} ${T.rotulo}`}>Reportes</span>
          <span className="mt-2 block"><BarraReportes c={c} oculta /></span>
          <span className="mt-2.5 flex flex-col gap-1">
            {PARTES.map(p => (
              <span key={p} className="flex items-center justify-between gap-2 text-xs leading-4">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[#556072]">
                  <MarcadorDeParte parte={p} />
                  <span className="truncate">{ROTULO_DE_PARTE[p]}</span>
                </span>
                <b className={`font-semibold tabular-nums ${c[p] === 0 ? 'text-[#667085]' : 'text-[#192031]'}`}>{c[p]}</b>
              </span>
            ))}
          </span>
        </>
      )}
    </button>
  )
}

export default function AvancePorAnio({ cuentas, anio, onElegir }: {
  cuentas: CuentaDeAnio[]
  anio: number
  onElegir: (anio: number) => void
}) {
  return (
    <section aria-labelledby="pdm-avance-anios" className="space-y-2.5">
      <h2 id="pdm-avance-anios" className={T.rotulo}>Avance del plan, año por año</h2>
      <div role="group" aria-labelledby="pdm-avance-anios" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cuentas.map(c => <Tarjeta key={c.anio} c={c} elegida={c.anio === anio} onElegir={() => onElegir(c.anio)} />)}
      </div>
      <p className={`text-xs leading-relaxed ${T.suave}`}>
        Solo cuenta lo que la secretaría aprobó. El avance promedio es la media de lo que cada indicador con meta lleva de su meta del año
        (con tope de 100 %); si aún no tiene avance validado, cuenta 0.
      </p>
    </section>
  )
}
