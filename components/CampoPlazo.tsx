'use client'

/**
 * El campo «Plazo (días)» de los formularios de contrato: se escribe, y lo que dicen las fechas es una SUGERENCIA, no una regla.
 *
 * Debajo del campo siempre se lee el plazo en letras («DOSCIENTOS DÍAS (200)») y, si lo escrito no coincide con lo que dan las
 * fechas, un aviso lo dice con los dos números y ofrece usar el de las fechas. El aviso no impide guardar: el plazo que manda es
 * el que dice el contrato. Ver lib/plazo-contrato.ts.
 */

import { MAX_PLAZO_DIAS, compararPlazo, plazoEnLetras } from '@/lib/plazo-contrato'
import type { EstadoDePlazo } from '@/lib/use-plazo'

export default function CampoPlazo({ plazo, porFechas, fechasAlReves, deshabilitado = false, diasOtrosi = 0, clase, claseDeshabilitado }: {
  plazo: EstadoDePlazo
  /** Lo que dan las fechas contando el primer y el último día; `null` si faltan o van al revés. */
  porFechas: number | null
  fechasAlReves: boolean
  deshabilitado?: boolean
  /** Días de plazo de los otrosíes ya aplicados (solo al editar): se suman al plazo escrito, igual que en los documentos. */
  diasOtrosi?: number
  /** Las clases del campo de texto del formulario que lo monta. */
  clase: string
  claseDeshabilitado?: string
}) {
  // Lo que imprimen los documentos: el escrito más los otrosíes aplicados. Es lo que se compara con las fechas.
  const total = plazo.invalido || plazo.efectivo === null ? null : plazo.efectivo + diasOtrosi
  const comparacion = compararPlazo(total, porFechas)
  return (
    <div className="col-span-2">
      <label htmlFor="plazo_dias" className="block text-sm font-medium text-gray-700 mb-1">
        Plazo (días)
        <span className="text-xs text-gray-400 font-normal ml-1">lo que dice el contrato</span>
      </label>
      <input
        id="plazo_dias" name="plazo_dias" inputMode="numeric" autoComplete="off"
        value={plazo.valor} onChange={e => plazo.alEscribir(e.target.value)}
        placeholder={porFechas !== null ? String(porFechas) : 'Ej. 180'}
        disabled={deshabilitado} aria-invalid={plazo.invalido || undefined} aria-describedby="plazo-ayuda"
        className={deshabilitado && claseDeshabilitado ? claseDeshabilitado : plazo.invalido ? `${clase} border-red-300 bg-red-50` : clase}
      />

      <div id="plazo-ayuda" aria-live="polite" className="mt-1.5 space-y-1.5">
        {plazo.invalido ? (
          <p className="text-xs text-red-700">El plazo debe ser un número entero de días, entre 1 y {MAX_PLAZO_DIAS.toLocaleString('es-CO')}.</p>
        ) : plazo.efectivo !== null ? (
          <p className="text-sm font-semibold tracking-wide text-gray-900">{plazoEnLetras(plazo.efectivo)}</p>
        ) : null}
        {diasOtrosi > 0 && total !== null && (
          <p className="text-xs text-gray-500">
            Más {diasOtrosi} {diasOtrosi === 1 ? 'día' : 'días'} de otrosí ya aplicado{diasOtrosi === 1 ? '' : 's'}: el contrato suma <b>{total} días</b>.
          </p>
        )}

        {fechasAlReves ? (
          <p className="text-xs text-red-700">La fecha de terminación es anterior a la de inicio.</p>
        ) : porFechas === null ? (
          <p className="text-xs text-gray-400">Escribe las dos fechas y se sugiere el plazo contando el primer y el último día.</p>
        ) : comparacion.tipo === 'coincide' ? (
          <p className="text-xs text-emerald-700">Coincide con las fechas ({porFechas} días, contando el primer y el último día).</p>
        ) : comparacion.tipo === 'distinto' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            Las fechas dan <b>{comparacion.porFechas} días</b> y {diasOtrosi > 0 ? 'el plazo del contrato' : 'el plazo escrito'} es <b>{comparacion.escrito}</b>
            {' '}({comparacion.diferencia > 0 ? '+' : '−'}{Math.abs(comparacion.diferencia)}). Los documentos imprimen el plazo del contrato;
            la vigencia la definen las fechas.
            {!deshabilitado && diasOtrosi === 0 && (
              <button type="button" onClick={plazo.usarSugerencia} className="ml-1.5 font-semibold underline underline-offset-2 hover:text-amber-950">
                Usar {comparacion.porFechas} días
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
