import PlanNoDisponible from '@/components/pdm/PlanNoDisponible'
import ResponsablesPdm from '@/components/pdm/ResponsablesPdm'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm } from '@/lib/pdm/datos'
import { cargarDirectorio } from '@/lib/pdm/directorio'

export const generateMetadata = () => metadataPdm('Responsables')

export default async function ResponsablesPage() {
  await exigirAccesoPdm()
  const plan = await cargarPlanPdm()
  if (!plan.ok || plan.indicadores.length === 0) return <PlanNoDisponible seLeyo={plan.ok} />
  return <ResponsablesPdm directorio={await cargarDirectorio()} indicadores={plan.indicadores} />
}
