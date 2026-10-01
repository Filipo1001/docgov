import PlanNoDisponible from '@/components/pdm/PlanNoDisponible'
import ResponsablesPdm from '@/components/pdm/ResponsablesPdm'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm } from '@/lib/pdm/datos'
import { cargarDirectorio } from '@/lib/pdm/directorio'

export const generateMetadata = () => metadataPdm('Responsables')

export default async function ResponsablesPage() {
  // El directorio de personas lo ven quienes gestionan y Control Interno; quien solo responde por
  // indicadores no lo ve (y su pestaña tampoco se pinta).
  const acceso = await exigirAccesoPdm('gestor_o_consulta')
  const plan = await cargarPlanPdm()
  if (!plan.ok || plan.indicadores.length === 0) return <PlanNoDisponible seLeyo={plan.ok} nivel={acceso.nivel} />
  return <ResponsablesPdm directorio={await cargarDirectorio()} indicadores={plan.indicadores} nivel={acceso.nivel} yoId={acceso.userId} />
}
