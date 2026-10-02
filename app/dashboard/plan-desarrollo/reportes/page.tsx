import PlanNoDisponible from '@/components/pdm/PlanNoDisponible'
import ReportesPdm from '@/components/pdm/ReportesPdm'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm } from '@/lib/pdm/datos'
import { anioDeParametro } from '@/lib/pdm/seguimiento'

export const generateMetadata = () => metadataPdm('Reportes')

/**
 * Cómo va un año. Lo ven quienes gestionan (cada secretaría, lo suyo) y Control Interno (todo).
 * Quien solo responde por indicadores ve el estado de los suyos en «Mi trabajo» e «Indicadores».
 *
 *   anio   uno de los años del plan; se contrasta con ellos. Sin él (o con uno que no es del plan), el de hoy.
 */
export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const acceso = await exigirAccesoPdm('gestor_o_consulta')
  const p = await searchParams
  const plan = await cargarPlanPdm()
  if (!plan.ok || plan.indicadores.length === 0) return <PlanNoDisponible seLeyo={plan.ok} nivel={acceso.nivel} />

  const { anioActual } = plan.seguimiento
  return (
    <ReportesPdm
      key={p.anio ?? ''}
      indicadores={plan.indicadores}
      anioActual={anioActual}
      anioInicial={anioDeParametro(p.anio, anioActual)}
      nivel={acceso.nivel}
    />
  )
}
