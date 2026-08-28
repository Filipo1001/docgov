'use client'

import { useUsuario } from '@/lib/user-context'
// DIAGNÓSTICO TEMPORAL — retirar cuando el panel congelado quede resuelto
import DiagnosticoPanel from '@/components/DiagnosticoPanel'
import SupervisorHome from './SupervisorHome'
import ContratistaHome from './ContratistaHome'
import AdminHome from './AdminHome'
import ReviewerHome from './ReviewerHome'
import ContratacionHome from './ContratacionHome'

export default function DashboardPage() {
  const { usuario, cargando, sesionExpirada } = useUsuario()

  // DIAGNÓSTICO TEMPORAL — se monta ANTES de los returns tempranos para que
  // siga visible en TODOS los estados, incluido `!usuario` (que hoy pinta
  // vacío) y el esqueleto. El fallo aparece tras horas de inactividad: hay
  // que poder fotografiarlo entonces.
  const diag = (
    <DiagnosticoPanel
      queryKey={['dashboard-contratista', usuario?.id]}
      cargando={cargando}
      hayUsuario={!!usuario}
      sesionExpirada={sesionExpirada}
    />
  )

  if (cargando) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-72" />
        <div className="h-5 bg-gray-100 rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
        {diag}
      </div>
    )
  }

  if (!usuario) return diag

  const panel = (() => {
  switch (usuario.rol) {
    case 'supervisor':
      return <SupervisorHome userId={usuario.id} nombre={usuario.nombre_completo} />

    case 'contratista':
      return <ContratistaHome userId={usuario.id} nombre={usuario.nombre_completo} />

    case 'admin':
      return <AdminHome nombre={usuario.nombre_completo} />

    case 'contratacion':
      return <ContratacionHome nombre={usuario.nombre_completo} />

    case 'asesor':
      return <ReviewerHome nombre={usuario.nombre_completo} dependenciaId={usuario.dependencia_id ?? null} />

    default:
      // gobierno, hacienda, or any future reviewer role
      return <ReviewerHome nombre={usuario.nombre_completo} dependenciaId={usuario.dependencia_id ?? null} />
  }
  })()

  return <>{panel}{diag}</>
}
