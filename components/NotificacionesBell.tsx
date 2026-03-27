'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUsuario } from '@/lib/user-context'
import { getNotificaciones, marcarLeida, marcarTodasLeidas } from '@/services/notificaciones'
import type { Notificacion } from '@/lib/types'

function tiempoRelativo(fechaISO: string): string {
  const ahora = Date.now()
  const fecha = new Date(fechaISO).getTime()
  const diff = Math.floor((ahora - fecha) / 1000)

  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`
  return new Date(fechaISO).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function iconoPorTipo(tipo: string): string {
  switch (tipo) {
    case 'aprobado_asesor': return '✅'
    case 'aprobado': return '🎉'
    case 'rechazado': return '❌'
    case 'enviado': return '📩'
    case 'radicado': return '📁'
    default: return '🔔'
  }
}

export default function NotificacionesBell() {
  const { usuario } = useUsuario()
  const router = useRouter()
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    if (!usuario) return
    const data = await getNotificaciones(usuario.id)
    setNotificaciones(data)
  }, [usuario])

  useEffect(() => {
    cargar()
    const timer = setInterval(cargar, 60_000)
    return () => clearInterval(timer)
  }, [cargar])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const noLeidas = notificaciones.filter(n => !n.leida).length

  async function handleClickNotificacion(n: Notificacion) {
    if (!n.leida) {
      await marcarLeida(n.id)
      setNotificaciones(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x))
    }
    if (n.periodo_id) {
      const contratoId = (n.periodo as any)?.contrato_id
      if (contratoId) {
        router.push(`/dashboard/contratos/${contratoId}/periodo/${n.periodo_id}`)
      } else {
        router.push('/dashboard/contratos')
      }
    }
    setAbierto(false)
  }

  async function handleMarcarTodas() {
    if (!usuario) return
    await marcarTodasLeidas(usuario.id)
    setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })))
  }

  if (!usuario) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto(!abierto)}
        className="relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <span>🔔</span>
        <span className="flex-1 text-left">Notificaciones</span>
        {noLeidas > 0 && (
          <span className="min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notificaciones</h3>
            {noLeidas > 0 && (
              <button
                onClick={handleMarcarTodas}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notificaciones.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl mb-2">🔔</p>
                <p className="text-sm text-gray-500">Sin notificaciones</p>
              </div>
            ) : (
              notificaciones.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotificacion(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${
                    !n.leida ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0 mt-0.5">{iconoPorTipo(n.tipo)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-tight ${!n.leida ? 'text-gray-900' : 'text-gray-700'}`}>
                        {n.titulo}
                      </p>
                      {n.mensaje && (
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug line-clamp-2">
                          {n.mensaje}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">{tiempoRelativo(n.created_at)}</p>
                    </div>
                    {!n.leida && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
