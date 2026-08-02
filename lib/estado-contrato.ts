/**
 * Estado del contrato: lo que alguien DECIDE, no lo que se deduce del calendario.
 *
 * El vencimiento natural no es un estado guardado. Que hoy sea posterior a
 * fecha_fin se deriva del propio contrato, y guardarlo obligaría a un proceso
 * que lo fuera marcando —exactamente lo que dejó 49 contratos vencidos con
 * `activo = true`—. Aquí se registran solo los hechos que requieren un acto:
 * suspender, terminar antes de tiempo, liquidar o ceder.
 */

export type EstadoContrato = 'vigente' | 'suspendido' | 'terminado' | 'liquidado' | 'cedido'

export const ESTADOS_CONTRATO: Array<{
  id: EstadoContrato
  label: string
  /** Qué significa, en los términos del trámite. */
  ayuda: string
  color: string
}> = [
  { id: 'vigente',    label: 'Vigente',    ayuda: 'En ejecución normal.',                                   color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'suspendido', label: 'Suspendido', ayuda: 'Ejecución detenida temporalmente por acta.',             color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'terminado',  label: 'Terminado',  ayuda: 'Terminación anticipada, antes de la fecha pactada.',     color: 'bg-red-100 text-red-800 border-red-200' },
  { id: 'liquidado',  label: 'Liquidado',  ayuda: 'Acta de liquidación suscrita. Cierra el expediente.',    color: 'bg-gray-200 text-gray-700 border-gray-300' },
  { id: 'cedido',     label: 'Cedido',     ayuda: 'Cedido a otro contratista.',                             color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
]

export function metaEstado(estado: string | null | undefined) {
  return ESTADOS_CONTRATO.find(e => e.id === estado) ?? ESTADOS_CONTRATO[0]
}

/**
 * Etiqueta que ve el usuario, combinando el estado registrado con el calendario.
 *
 * Un contrato "vigente" cuya fecha de terminación ya pasó no está en ejecución:
 * decir "Vigente" sería falso. Pero tampoco fue terminado por nadie — cumplió
 * su plazo. Por eso el calendario solo matiza el estado por defecto y nunca
 * pisa un estado que alguien registró expresamente.
 */
export function etiquetaEstado(
  estado: string | null | undefined,
  fechaFin: string | null | undefined,
): { label: string; color: string } {
  const meta = metaEstado(estado)
  if (meta.id !== 'vigente') return { label: meta.label, color: meta.color }

  const vencido = !!fechaFin && fechaFin < new Date().toISOString().slice(0, 10)
  return vencido
    ? { label: 'Finalizado', color: 'bg-gray-100 text-gray-600 border-gray-200' }
    : { label: meta.label, color: meta.color }
}
