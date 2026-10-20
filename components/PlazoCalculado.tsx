import { plazoEnLetras } from '@/lib/plazo-contrato'

/**
 * El plazo, calculado de las fechas: «DOSCIENTOS DÍAS (200)». No es un campo: no se escribe ni se corrige. Si el número
 * no cuadra, lo que se corrige son las fechas.
 */
export default function PlazoCalculado({ dias, fechasAlReves }: { dias: number | null; fechasAlReves: boolean }) {
  return (
    <div id="plazo-calculado" className="col-span-2" aria-live="polite">
      <p className="block text-sm font-medium text-gray-700 mb-1">
        Plazo
        <span className="text-xs text-emerald-600 font-normal ml-1">se calcula de las fechas</span>
      </p>
      {fechasAlReves ? (
        <p className="w-full px-3 py-2.5 rounded-xl text-sm border border-red-200 bg-red-50 text-red-700">
          La fecha de terminación es anterior a la de inicio.
        </p>
      ) : dias === null ? (
        <p className="w-full px-3 py-2.5 rounded-xl text-sm border border-dashed border-gray-200 text-gray-400">
          Escribe la fecha de inicio y la de terminación.
        </p>
      ) : (
        <p className="w-full px-3 py-2.5 rounded-xl text-sm border border-emerald-200 bg-emerald-50 text-gray-900 font-semibold tracking-wide">
          {plazoEnLetras(dias)}
        </p>
      )}
      <p className="text-xs text-gray-400 mt-1">Se cuentan el primer y el último día.</p>
    </div>
  )
}
