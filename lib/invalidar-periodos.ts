import type { QueryClient } from '@tanstack/react-query'

/**
 * Punto ÚNICO de invalidación tras cambiar el estado de un periodo.
 *
 * El problema que resuelve: siete pantallas muestran el estado de un mismo
 * periodo y cada una guardaba su propia copia sin avisar a las demás. El
 * supervisor aprobaba en el detalle del periodo, volvía a Informes y el
 * informe seguía "sin aprobar" — no porque la aprobación fallara, sino porque
 * esa otra pantalla no se había enterado. Con cachés de 60 s (Informes) y
 * 5 min (paneles), la ventana para toparse con el dato viejo era amplia.
 *
 * `revalidatePath` del servidor no cubre esto: invalida el renderizado de
 * Next, no las cachés de TanStack en el navegador, que son las que alimentan
 * estas pantallas.
 *
 * Toda acción que cambie un periodo —aprobar, devolver, radicar, revisar
 * planilla, en singular o en lote— debe llamar aquí. Es preferible invalidar
 * de más que dejar una pantalla mintiendo: marcar obsoleto no dispara red por
 * sí solo, solo refresca lo que esté montado.
 */
const CLAVES_AFECTADAS = [
  ['informes'],              // /dashboard/informes — lista principal
  ['informes-borrador'],     // /dashboard/informes — pestaña "sin enviar"
  ['dashboard-contratista'], // panel del contratista
  ['dashboard-supervisor'],  // panel de la secretaría
  ['dashboard-admin'],       // panel de administración
  ['dashboard-reviewer'],    // panel de asesor/gobierno/hacienda
  ['contratos-todos'],       // /dashboard/contratos — trae periodos embebidos
  ['contratacion-stats'],    // panel de contratación
  ['aprobaciones'],          // /dashboard/aprobaciones
  ['colaborador'],           // /dashboard/colaboradores/[id]
  ['periodo'],               // detalle de un periodo
] as const

export function invalidarPeriodos(queryClient: QueryClient): void {
  for (const clave of CLAVES_AFECTADAS) {
    // Coincidencia por prefijo: alcanza las variantes con mes, año o id.
    queryClient.invalidateQueries({ queryKey: clave }).catch(() => {})
  }
}
