import IndicadoresPdm from '@/components/pdm/IndicadoresPdm'
import PlanNoDisponible from '@/components/pdm/PlanNoDisponible'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm } from '@/lib/pdm/datos'
import { cargarDirectorio } from '@/lib/pdm/directorio'
import { FILTROS, type Filtro } from '@/lib/pdm/filtros'

export const generateMetadata = () => metadataPdm('Indicadores')

/**
 * Los enlaces de otras secciones llegan con el filtro en la dirección. Nada de
 * lo que venga se cree: cada valor se contrasta con lo que de verdad existe y, si
 * no coincide, se ignora y la lista sale completa.
 *
 *   dependencia  una secretaría del plan
 *   filtro       uno de los filtros rápidos
 *   usuario      el id de una persona de la plataforma → sus indicadores asignados
 *   origen       el nombre, tal como lo escribió el Excel, de alguien que todavía no
 *                tiene usuario → los indicadores que el Excel le atribuía
 *   grupo        el id de un grupo → los indicadores que lleva
 */
export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ dependencia?: string; filtro?: string; usuario?: string; origen?: string; grupo?: string }>
}) {
  await exigirAccesoPdm()
  const p = await searchParams
  const plan = await cargarPlanPdm()
  if (!plan.ok || plan.indicadores.length === 0) return <PlanNoDisponible seLeyo={plan.ok} />
  const dir = await cargarDirectorio()

  const dependencia = plan.indicadores.find(i => i.dependencia === p.dependencia)?.dependencia
  const filtro = FILTROS.find((f): f is Filtro => f === p.filtro)

  let restringirA: { etiqueta: string; ids: number[] } | undefined
  const persona = dir.personas.find(x => x.id === p.usuario)
  const sinUsuario = dir.sinUsuario.find(x => x.nombre === p.origen)
  const grupo = dir.grupos.find(x => x.id === p.grupo)
  if (persona) {
    restringirA = {
      etiqueta: persona.nombre,
      ids: plan.indicadores.filter(i => i.asignados.some(a => a.usuarioId === persona.id)).map(i => i.id),
    }
  } else if (grupo) {
    restringirA = {
      etiqueta: `${grupo.nombre} (grupo)`,
      ids: plan.indicadores.filter(i => i.asignados.some(a => a.grupoId === grupo.id)).map(i => i.id),
    }
  } else if (sinUsuario) {
    restringirA = {
      etiqueta: sinUsuario.nombre,
      ids: plan.indicadores
        .filter(i => i.responsable === sinUsuario.nombre && dir.fichas[i.id] !== undefined && 'sinUsuario' in dir.fichas[i.id])
        .map(i => i.id),
    }
  }

  return (
    <IndicadoresPdm
      // Un enlace nuevo a esta misma pantalla debe arrancar de cero.
      key={`${dependencia ?? ''}|${filtro ?? ''}|${persona?.id ?? grupo?.id ?? sinUsuario?.nombre ?? ''}`}
      indicadores={plan.indicadores}
      fichas={dir.fichas}
      personas={dir.personas}
      grupos={dir.grupos}
      dependenciaInicial={dependencia}
      filtroInicial={filtro}
      restringirA={restringirA}
    />
  )
}
