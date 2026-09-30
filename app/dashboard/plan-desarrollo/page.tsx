import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import PlanDesarrolloCliente from '@/components/pdm/PlanDesarrolloCliente'
import { REPORTANTES, coincideNombre } from '@/lib/pdm/plan'
import { pdmHabilitado } from '@/lib/pdm/habilitado'

/**
 * Plan de Desarrollo — vista previa.
 *
 * ── Dos seguros para que esto no llegue a producción por accidente ────────
 *
 * 1. Solo existe donde `pdmHabilitado()` lo afirma: vista previa o desarrollo
 *    local. En cualquier otro sitio —producción, o un entorno que no se pueda
 *    identificar— responde 404. Falla hacia lo cerrado: si un día esta rama se
 *    fusiona a main sin querer, en app.contratistadigital.com esta URL
 *    simplemente no existe. Es la MISMA función que decide si la barra lateral
 *    muestra el botón, así que botón y página no pueden discrepar.
 *
 * 2. No hay ni una escritura a la base de datos. Los indicadores salen de un
 *    archivo sembrado y los reportes viven en memoria. El único acceso a la
 *    base es el que ya hace `requireRole`, de solo lectura, para saber quién
 *    entra.
 *
 * No toca `middleware.ts`. La única huella en el resto de la aplicación es el
 * botón de la barra lateral del administrador, que pregunta a `pdmHabilitado()`
 * antes de pintarse. La ruta cuelga de /dashboard, que ya está enrutada, así que
 * `/verificar` no se ve involucrada en nada de esto (regla 1 de CLAUDE.md).
 */

export const metadata = { title: 'Plan de Desarrollo — vista previa' }

export default async function PlanDesarrolloPage() {
  if (!pdmHabilitado()) notFound()

  // Solo el administrador, por ahora. El módulo se abre por roles de a uno,
  // empezando por el que puede configurarlo todo; los demás entrarán cuando su
  // parte exista. Con «Ver como» el administrador puede mirar cómo lo verían.
  const usuario = await requireRole(['admin'])

  const personaInicial = REPORTANTES.find(p => coincideNombre(usuario.nombre_completo ?? '', p.nombre))?.nombre

  return <PlanDesarrolloCliente vistaInicial="alcalde" personaInicial={personaInicial} />
}
