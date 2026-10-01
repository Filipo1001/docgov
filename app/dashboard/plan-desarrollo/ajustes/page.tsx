import AjustesPdm from '@/components/pdm/AjustesPdm'
import PlanNoDisponible from '@/components/pdm/PlanNoDisponible'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm, contarReportesPorCorte } from '@/lib/pdm/datos'

export const generateMetadata = () => metadataPdm('Ajustes')

/**
 * Cómo se mide el avance y los cortes. Solo el administrador: quien no lo es vuelve al resumen
 * (y su pestaña ni siquiera se pinta).
 */
export default async function AjustesPage() {
  const acceso = await exigirAccesoPdm('admin')
  const plan = await cargarPlanPdm()
  if (!plan.ok) return <PlanNoDisponible seLeyo={false} nivel={acceso.nivel} />
  const reportesPorCorte = await contarReportesPorCorte(plan.seguimiento.cortes.map(c => c.id))
  return <AjustesPdm seguimiento={plan.seguimiento} reportesPorCorte={reportesPorCorte} />
}
