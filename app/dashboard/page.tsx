'use client'

import { useEffect } from 'react'
import { useQueryClient, onlineManager, focusManager } from '@tanstack/react-query'
import { useUsuario } from '@/lib/user-context'
import { createClient } from '@/lib/supabase'
import { reportarDiagnosticoDashboard } from '@/app/actions/diagnostico'
import SupervisorHome from './SupervisorHome'
import ContratistaHome from './ContratistaHome'
import AdminHome from './AdminHome'
import ReviewerHome from './ReviewerHome'
import ContratacionHome from './ContratacionHome'

/**
 * DIAGNÓSTICO TEMPORAL — retirar tras resolver el bug del dashboard.
 * A los 6 s de montar, manda al servidor una foto del estado interno:
 * todas las queries de TanStack, conectividad y salud de la sesión.
 */
function useDiagnosticoDashboard(rol: string | undefined) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!rol) return
    const timer = setTimeout(async () => {
      try {
        const queries = queryClient.getQueryCache().getAll().map(q => ({
          key: q.queryKey,
          status: q.state.status,
          fetchStatus: q.state.fetchStatus,
          dataUpdatedAt: q.state.dataUpdatedAt,
          errorUpdateCount: q.state.errorUpdateCount,
          fetchFailureCount: q.state.fetchFailureCount,
          error: q.state.error ? String((q.state.error as { message?: string })?.message ?? q.state.error).slice(0, 200) : null,
          hayData: q.state.data !== undefined,
        }))
        let sesion: Record<string, unknown> = {}
        try {
          const carrera = await Promise.race([
            createClient().auth.getSession(),
            new Promise<'timeout'>(r => setTimeout(() => r('timeout'), 3000)),
          ])
          sesion = carrera === 'timeout'
            ? { getSession: 'COLGADO >3s' }
            : {
                getSession: 'ok',
                hayToken: !!carrera.data.session?.access_token,
                expiraEn: carrera.data.session?.expires_at
                  ? carrera.data.session.expires_at - Math.floor(Date.now() / 1000)
                  : null,
              }
        } catch (e) { sesion = { getSession: `error: ${String(e).slice(0, 120)}` } }
        const payload = {
          rol,
          online: navigator.onLine,
          rqOnline: onlineManager.isOnline(),
          rqFocused: focusManager.isFocused(),
          visibilidad: document.visibilityState,
          hayCookieSb: document.cookie.split(';').some(c => { const n = c.trim(); return n.startsWith('sb-') && n.includes('-auth-token') }),
          sesion,
          queries,
        }
        console.log('[diagnostico-dashboard]', payload)
        reportarDiagnosticoDashboard(payload).catch(() => {})
      } catch { /* diagnóstico: nunca romper la página */ }
    }, 6000)
    return () => clearTimeout(timer)
  }, [rol, queryClient])
}

export default function DashboardPage() {
  const { usuario, cargando } = useUsuario()
  useDiagnosticoDashboard(usuario?.rol)

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

    case 'contratacion':
      return <ContratacionHome nombre={usuario.nombre_completo} />

    case 'asesor':
      return <ReviewerHome nombre={usuario.nombre_completo} dependenciaId={usuario.dependencia_id ?? null} />

    default:
      // gobierno, hacienda, or any future reviewer role
      return <ReviewerHome nombre={usuario.nombre_completo} dependenciaId={usuario.dependencia_id ?? null} />
  }
}
