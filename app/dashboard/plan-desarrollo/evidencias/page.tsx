import EvidenciasPdm from '@/components/pdm/EvidenciasPdm'
import PlanNoDisponible from '@/components/pdm/PlanNoDisponible'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm } from '@/lib/pdm/datos'
import { cargarEvidencias } from '@/lib/pdm/evidencias'
import { leerFiltros } from '@/lib/pdm/evidencias-armar'

export const generateMetadata = () => metadataPdm('Evidencias')

/**
 * Los indicadores que tienen evidencia en un año, con sus archivos (uno solo, o una carpeta). Cada quien ve lo que la
 * base le deja ver: un responsable los suyos, una secretaría los de su dependencia, Control Interno y el administrador todo.
 *
 * Los filtros llegan en la dirección y nada de lo que venga se cree: cada valor se contrasta con lo que existe
 * (años del plan, estados conocidos, secretarías del plan) y, si no coincide, se ignora.
 *
 *   anio · q · estado · dependencia · pagina
 *
 * Siempre hay UN año (sin él, el de hoy): los años no se mezclan.
 */
export default async function EvidenciasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acceso = await exigirAccesoPdm()
  const p = await searchParams
  const plan = await cargarPlanPdm()
  if (!plan.ok) return <PlanNoDisponible seLeyo={false} nivel={acceso.nivel} />

  const dependencias = [...new Set(plan.indicadores.map(i => i.dependencia))].sort((a, b) => a.localeCompare(b, 'es'))
  const filtro = leerFiltros(p, dependencias, plan.seguimiento.anioActual)
  const datos = await cargarEvidencias(plan.indicadores, filtro)
  return (
    <EvidenciasPdm
      filtro={{ ...filtro, pagina: datos.pagina }}
      datos={datos}
      dependencias={dependencias}
      anioActual={plan.seguimiento.anioActual}
    />
  )
}
