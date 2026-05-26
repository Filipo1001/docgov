'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUsuario } from '@/lib/user-context'
import { createClient } from '@/lib/supabase'
import { getNotificaciones, getConteoNoLeidas, marcarLeida, marcarTodasLeidas } from '@/services/notificaciones'
import type { Notificacion } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    case 'revision': return '🔍'
    case 'aprobado': return '🎉'
    case 'rechazado': return '❌'
    case 'enviado': return '📩'
    case 'radicado': return '📁'
    default: return '🔔'
  }
}

// ─── Circuit breaker config ────────────────────────────────────────────────────
// Si 3 cargas consecutivas fallan, el sistema espera 30 min antes de reintentar.
// Esto evita bombardear la DB cuando está caída (lo que empeora la crisis).
const CIRCUIT_MAX_FAILURES = 3
const CIRCUIT_BACKOFF_MS = 30 * 60 * 1000 // 30 minutos

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificacionesBell() {
  const { usuario } = useUsuario()
  const router = useRouter()
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [totalNoLeidas, setTotalNoLeidas] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Circuit breaker state (no reactivo — solo refs para no causar re-renders)
  const fallosConsecutivos = useRef(0)
  const backoffHasta = useRef(0)

  const cargar = useCallback(async () => {
    if (!usuario) return

    // ── Circuit breaker: skip si estamos en período de espera ────────────────
    if (Date.now() < backoffHasta.current) return

    try {
      const [data, conteo] = await Promise.all([
        getNotificaciones(usuario.id),
        getConteoNoLeidas(usuario.id),
      ])
      setNotificaciones(data)
      setTotalNoLeidas(conteo)
      // Éxito → resetear contador de fallos
      fallosConsecutivos.current = 0
    } catch {
      fallosConsecutivos.current += 1
      if (fallosConsecutivos.current >= CIRCUIT_MAX_FAILURES) {
        // Abrir el circuit breaker: no reintentar por 30 minutos
        backoffHasta.current = Date.now() + CIRCUIT_BACKOFF_MS
        fallosConsecutivos.current = 0
        console.warn('[NotificacionesBell] Circuit breaker abierto — DB no disponible, reintento en 30 min')
      }
    }
  }, [usuario])

  useEffect(() => {
    if (!usuario) return

    // Carga inicial
    cargar()

    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let mounted = true

    // ── Realtime: walkie-talkie siempre abierto con la DB ───────────────────
    // @supabase/ssr resuelve el estado de sesión de forma asíncrona al montar.
    // Si suscribimos el canal ANTES de que getSession() resuelva, el WebSocket
    // sale con solo el apikey (sin JWT) y el servidor responde 401.
    // Solución: esperar la sesión, inyectarla con setAuth(), luego suscribir.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return // componente desmontado antes de que resolviera

      // Inyectar el JWT para que postgres_changes pueda verificar RLS
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token)
      }

      channel = supabase
        .channel(`notificaciones_usuario_${usuario.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notificaciones',
            filter: `usuario_id=eq.${usuario.id}`,
          },
          () => cargar()
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notificaciones',
            filter: `usuario_id=eq.${usuario.id}`,
          },
          () => cargar()
        )
        .subscribe()
    })

    // ── Fallback poll cada 15 min ─────────────────────────────────────────────
    // Red de seguridad por si el WebSocket se desconecta silenciosamente.
    const fallback = setInterval(cargar, 15 * 60 * 1000)

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
      clearInterval(fallback)
    }
  }, [usuario, cargar])

  // Cerrar dropdown al hacer clic fuera
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
      setTotalNoLeidas(prev => Math.max(0, prev - 1))
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
    setTotalNoLeidas(0)
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
        {totalNoLeidas > 0 && (
          <span className="min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none">
            {totalNoLeidas > 99 ? '99+' : totalNoLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notificaciones</h3>
            {totalNoLeidas > 0 && (
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
