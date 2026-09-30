/**
 * Lo que se ve cuando no hay plan que mostrar: o no se pudo leer, o todavía no
 * tiene indicadores. Las dos cosas se dicen tal cual; ninguna se disfraza con datos
 * de reemplazo (el único plan de respaldo que hubo traía avances sin dueño, y se retiró).
 */
export default function PlanNoDisponible({ seLeyo }: { seLeyo: boolean }) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
      <p className="text-sm font-semibold text-gray-800">
        {seLeyo ? 'El plan todavía no tiene indicadores cargados.' : 'No se pudo leer el plan.'}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
        {seLeyo
          ? 'Cuando se cargue, aparecerá aquí.'
          : 'Recarga la página. Si sigue igual, avisa a quien administra la plataforma: el resto de Contratista Digital no se ve afectado.'}
      </p>
    </div>
  )
}
