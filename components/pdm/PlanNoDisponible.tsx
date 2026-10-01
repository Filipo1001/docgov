import type { NivelPdm } from '@/lib/pdm/niveles'

/**
 * Lo que se ve cuando no hay plan que mostrar: o no se pudo leer, o quien mira no tiene
 * indicadores a la vista. Las dos cosas se dicen tal cual; ninguna se disfraza con datos de
 * reemplazo (el único plan de respaldo que hubo traía avances sin dueño, y se retiró).
 *
 * «Sin indicadores» no siempre significa que el plan está vacío: la base solo muestra a cada
 * quien lo suyo. Quien responde por indicadores y todavía no tiene ninguno asignado, o una
 * secretaría sin indicadores, ve un mensaje que lo dice y no uno que miente sobre el plan.
 */
export default function PlanNoDisponible({ seLeyo, nivel }: { seLeyo: boolean; nivel?: NivelPdm }) {
  const titulo = !seLeyo
    ? 'No se pudo leer el plan.'
    : nivel === 'responsable'
      ? 'Todavía no tienes indicadores asignados.'
      : nivel === 'coordinador'
        ? 'Tu secretaría no tiene indicadores en el plan.'
        : 'El plan todavía no tiene indicadores cargados.'
  const detalle = !seLeyo
    ? 'Recarga la página. Si sigue igual, avisa a quien administra la plataforma: el resto de Contratista Digital no se ve afectado.'
    : nivel === 'responsable'
      ? 'Cuando tu secretaría te asigne alguno, aparecerá aquí.'
      : nivel === 'coordinador'
        ? 'Si crees que debería tenerlos, avisa a quien administra el plan.'
        : 'Cuando se cargue, aparecerá aquí.'

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
      <p className="text-sm font-semibold text-gray-800">{titulo}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{detalle}</p>
    </div>
  )
}
