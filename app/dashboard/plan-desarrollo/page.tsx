import MiTrabajoPdm from '@/components/pdm/MiTrabajoPdm'
import PlanNoDisponible from '@/components/pdm/PlanNoDisponible'
import ResumenPdm from '@/components/pdm/ResumenPdm'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm } from '@/lib/pdm/datos'
import { cargarDirectorio } from '@/lib/pdm/directorio'
import { armarMisGrupos } from '@/lib/pdm/mi-trabajo'

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
 * 2. Esta pantalla solo LEE las tablas `pdm_*` (con la sesión de quien mira) y las de
 *    usuarios y contratos que ya lee la pantalla de usuarios de CD. Las escrituras
 *    (reportar, validar, asignar) salen de la ficha de un indicador y de las otras
 *    secciones, siempre con la sesión de quien las hace.
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

  // Quien solo responde por indicadores no necesita el tablero del plan sino saber qué le toca: su
  // inicio es «Mi trabajo». Sin indicadores a su cargo también lo ve (puede tener grupos y, cuando le
  // asignen uno, aquí aparecerá), así que solo un plan ilegible lo manda al aviso.
  if (acceso.nivel === 'responsable') {
    if (!plan.ok) return <PlanNoDisponible seLeyo={false} nivel={acceso.nivel} />
    const dir = await cargarDirectorio()
    return (
      <MiTrabajoPdm
        indicadores={plan.indicadores}
        fichas={dir.fichas}
        grupos={armarMisGrupos(dir.grupos, dir.personas, acceso.userId)}
        gruposLeidos={dir.ok}
        nivel={acceso.nivel}
        yoId={acceso.userId}
        seguimiento={plan.seguimiento}
      />
    )
  }

  if (!plan.ok || plan.indicadores.length === 0) return <PlanNoDisponible seLeyo={plan.ok} nivel={acceso.nivel} />
  const { fichas } = await cargarDirectorio()
  return <ResumenPdm indicadores={plan.indicadores} fichas={fichas} nivel={acceso.nivel} yoId={acceso.userId} seguimiento={plan.seguimiento} />
}
