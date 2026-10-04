import EvidenciasPdm from '@/components/pdm/EvidenciasPdm'
import PlanNoDisponible from '@/components/pdm/PlanNoDisponible'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm } from '@/lib/pdm/datos'
import { cargarEvidencias } from '@/lib/pdm/evidencias'
import { leerFiltros } from '@/lib/pdm/evidencias-armar'

export const generateMetadata = () => metadataPdm('Evidencias')

/**
 * Todos los archivos que respaldan los reportes. Lo ve cada quien con lo que la base le deja ver: un responsable
 * los de sus indicadores, una secretaría los de su dependencia, Control Interno y el administrador todo.
 *
 * Los filtros llegan en la dirección y nada de lo que venga se cree: cada valor se contrasta con lo que existe
 * (años del plan, tipos y estados conocidos, secretarías del plan) y, si no coincide, se ignora.
 *
 *   anio · q · tipo · estado · dependencia · historico=1 · pagina
 */
export default async function EvidenciasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acceso = await exigirAccesoPdm()
  const p = await searchParams
  const plan = await cargarPlanPdm()
  if (!plan.ok) return <PlanNoDisponible seLeyo={false} nivel={acceso.nivel} />

  const dependencias = [...new Set(plan.indicadores.map(i => i.dependencia))].sort((a, b) => a.localeCompare(b, 'es'))
  const filtro = leerFiltros(p, dependencias)
  const datos = await cargarEvidencias(filtro)
  return <EvidenciasPdm filtro={{ ...filtro, pagina: datos.pagina }} datos={datos} dependencias={dependencias} />
}
