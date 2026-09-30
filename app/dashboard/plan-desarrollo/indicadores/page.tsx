import IndicadoresPdm from '@/components/pdm/IndicadoresPdm'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarDirectorio } from '@/lib/pdm/directorio'
import { FILTROS, type Filtro } from '@/lib/pdm/filtros'
import { DEPENDENCIAS, REPORTANTES } from '@/lib/pdm/plan'

export const generateMetadata = () => metadataPdm('Indicadores')

/**
 * Los enlaces de otras secciones llegan con el filtro en la dirección. Nada de
 * lo que venga se cree: cada valor se contrasta con el catálogo y, si no
 * coincide, se ignora y la lista sale completa.
 */
export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ dependencia?: string; filtro?: string; responsable?: string }>
}) {
  await exigirAccesoPdm()
  const p = await searchParams
  const { fichas } = await cargarDirectorio()

  const dependencia = DEPENDENCIAS.find(d => d === p.dependencia)
  const filtro = FILTROS.find((f): f is Filtro => f === p.filtro)
  const responsable = REPORTANTES.find(r => r.nombre === p.responsable)?.nombre

  return (
    <IndicadoresPdm
      // Un enlace nuevo a esta misma pantalla debe arrancar de cero.
      key={`${dependencia ?? ''}|${filtro ?? ''}|${responsable ?? ''}`}
      dependenciaInicial={dependencia}
      filtroInicial={filtro}
      responsable={responsable}
      fichas={fichas}
    />
  )
}
