import { requireRole } from '@/lib/auth'
import { getDependencias, getUsuariosParaSelect } from '@/services/admin'
import NuevoContratoClient from './NuevoContratoClient'

export default async function NuevoContratoPage() {
  await requireRole(['admin'])

  // Cargamos las listas en el servidor (auth garantizada por cookies httpOnly)
  // y las pasamos como props, para que los selects nunca queden vacíos por una
  // sesión de navegador fría.
  const [dependencias, usuarios] = await Promise.all([
    getDependencias(),
    getUsuariosParaSelect(),
  ])

  return (
    <NuevoContratoClient
      initialDependencias={dependencias.map(d => ({ id: d.id, nombre: d.nombre }))}
      initialUsuarios={usuarios}
    />
  )
}
