import ResponsablesPdm from '@/components/pdm/ResponsablesPdm'
import { exigirAccesoPdm, metadataPdm } from '@/lib/pdm/acceso'

export const generateMetadata = () => metadataPdm('Responsables')

export default async function ResponsablesPage() {
  await exigirAccesoPdm()
  return <ResponsablesPdm />
}
