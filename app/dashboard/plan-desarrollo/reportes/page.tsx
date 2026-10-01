import Link from 'next/link'
import PlanNoDisponible from '@/components/pdm/PlanNoDisponible'
import ReportesPdm from '@/components/pdm/ReportesPdm'
import EncabezadoSeccion from '@/components/pdm/EncabezadoSeccion'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm, cargarVigentesDelCorte } from '@/lib/pdm/datos'
import { HREF_AJUSTES } from '@/lib/pdm/menu'
import { armarReportesDelCorte } from '@/lib/pdm/reportes-armar'

export const generateMetadata = () => metadataPdm('Reportes')

/**
 * Cómo va un corte. Lo ven quienes gestionan (cada secretaría, lo suyo) y Control Interno (todo).
 * Quien solo responde por indicadores ve el estado de los suyos en «Indicadores».
 *
 *   corte   el id de un corte; se contrasta con los que existen. Sin él (o con uno que no existe),
 *           el abierto, y si no hay abierto, el más reciente.
 */
export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ corte?: string }> }) {
  const acceso = await exigirAccesoPdm('gestor_o_consulta')
  const p = await searchParams
  const plan = await cargarPlanPdm()
  if (!plan.ok || plan.indicadores.length === 0) return <PlanNoDisponible seLeyo={plan.ok} nivel={acceso.nivel} />

  const { cortes, abierto } = plan.seguimiento
  if (cortes.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-5">
        <EncabezadoSeccion titulo="Reportes" />
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-gray-800">Todavía no hay cortes.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
            {acceso.nivel === 'admin'
              ? <>Crea el primero en <Link href={HREF_AJUSTES} className="font-semibold text-teal-700 underline underline-offset-2">Ajustes</Link> para que los responsables empiecen a reportar.</>
              : 'Cuando se abra el primero, aquí se verá cómo va cada secretaría.'}
          </p>
        </div>
      </div>
    )
  }

  const corte = cortes.find(c => c.id === p.corte) ?? abierto ?? cortes[0]
  const vigentes = await cargarVigentesDelCorte(corte.id)
  const datos = vigentes ? armarReportesDelCorte(plan.indicadores, vigentes) : null
  return <ReportesPdm cortes={cortes} corte={corte} datos={datos} nivel={acceso.nivel} />
}
