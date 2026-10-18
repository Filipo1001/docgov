import HistorialPdm from '@/components/pdm/HistorialPdm'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'
import { cargarOperaciones } from '@/lib/pdm/operaciones-datos'

export const generateMetadata = () => metadataPdm('Historial')

/**
 * El historial de repartos, grupos y accesos, y la forma de deshacerlos. Solo el administrador: la puerta es
 * `exigirAccesoPdm('admin')` y, además, la base (`pdm_operaciones` y `pdm_deshacer`, migración 067) solo contesta al
 * administrador. La pestaña tampoco se pinta para nadie más.
 */
export default async function HistorialPage() {
  await exigirAccesoPdm('admin')
  const lectura = await cargarOperaciones()
  return <HistorialPdm operaciones={lectura.ok ? lectura.operaciones : []} leyo={lectura.ok} />
}
