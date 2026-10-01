import PlanNoDisponible from '@/components/pdm/PlanNoDisponible'
import ResumenPdm from '@/components/pdm/ResumenPdm'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm } from '@/lib/pdm/datos'
import { cargarDirectorio } from '@/lib/pdm/directorio'

/**
 * Plan de Desarrollo — Resumen (vista previa).
 *
 * ── Dos seguros para que esto no llegue a producción por accidente ────────
 *
 * 1. Solo existe donde `pdmHabilitado()` lo afirma: vista previa o desarrollo
 *    local. En cualquier otro sitio —producción, o un entorno que no se pueda
 *    identificar— responde 404. Falla hacia lo cerrado. Es la MISMA función que
 *    decide si la barra lateral muestra el botón, así que botón y páginas no
 *    pueden discrepar. Cada página la llama a través de `exigirAccesoPdm`.
 *
 * 2. No hay ni una escritura a la base de datos. El módulo LEE las tablas `pdm_*`
 *    (con la sesión de quien mira) y las de usuarios y contratos que ya lee la
 *    pantalla de usuarios de CD. Escribir llega con la pantalla de asignación.
 *
 * No toca `middleware.ts`. La huella en el resto de la aplicación son dos: el
 * botón de la barra lateral del administrador y el layout del panel, que en
 * estas rutas pinta el marco del módulo (`MarcoPdm`) en vez de la barra de
 * contratos. Las rutas cuelgan de /dashboard, que ya está enrutada, así que
 * `/verificar` no se ve involucrada en nada de esto (regla 1 de CLAUDE.md).
 */

export const generateMetadata = () => metadataPdm('Resumen')

export default async function ResumenPage() {
  const acceso = await exigirAccesoPdm()
  const plan = await cargarPlanPdm()
  if (!plan.ok || plan.indicadores.length === 0) return <PlanNoDisponible seLeyo={plan.ok} nivel={acceso.nivel} />
  const { fichas } = await cargarDirectorio()
  return <ResumenPdm indicadores={plan.indicadores} fichas={fichas} />
}
