'use client'

import { useUsuario } from '@/lib/user-context'
import SupervisorHome from './SupervisorHome'
import ContratistaHome from './ContratistaHome'
import AdminHome from './AdminHome'
import ReviewerHome from './ReviewerHome'

export default function DashboardPage() {
  const { usuario, cargando } = useUsuario()

  if (cargando) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-72" />
        <div className="h-5 bg-gray-100 rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (!usuario) return null

  switch (usuario.rol) {
    case 'supervisor':
      return <SupervisorHome userId={usuario.id} nombre={usuario.nombre_completo} />

    case 'contratista':
      return <ContratistaHome userId={usuario.id} nombre={usuario.nombre_completo} />

    case 'admin':
      return <AdminHome nombre={usuario.nombre_completo} />

    case 'asesor':
      return <ReviewerHome nombre={usuario.nombre_completo} rol="asesor" />

    default:
      // gobierno, hacienda, or any future reviewer role
      return <ReviewerHome nombre={usuario.nombre_completo} rol={usuario.rol} />
  }
}
