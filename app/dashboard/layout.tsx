'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEffect, useRef, useState } from 'react'
import { UserProvider, useUsuario } from '@/lib/user-context'
import { QueryProvider } from '@/lib/query-provider'
import { getMenuPorRol } from '@/lib/constants'
import NotificacionesBell from '@/components/NotificacionesBell'

// ─── User avatar (photo or initials) ─────────────────────────
function getInitiales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase()
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase()
}

function UserAvatar({ nombre, fotoUrl, size = 9 }: { nombre: string; fotoUrl?: string | null; size?: number }) {
  const dim = `w-${size} h-${size}`
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={nombre}
        className={`${dim} rounded-full object-cover flex-shrink-0`}
      />
    )
  }
  return (
    <div className={`${dim} bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0`}>
      <span className="text-xs font-semibold text-blue-700 leading-none">
        {getInitiales(nombre)}
      </span>
    </div>
  )
}

// ─── Pending count badge ──────────────────────────────────────
function PendingBadge({ n }: { n: number }) {
  if (n === 0) return null
  return (
    <span className="ml-auto min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none">
      {n > 99 ? '99+' : n}
    </span>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  // Auth redirect is handled by DashboardContent — Sidebar is purely presentational
  const { usuario, municipio, cargando } = useUsuario()
  const [pendientes, setPendientes] = useState(0)

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    onClose()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the count of periods waiting for review (for supervisor/admin)
  useEffect(() => {
    if (!usuario) return
    if (usuario.rol !== 'supervisor' && usuario.rol !== 'admin') return

    async function fetchPendientes() {
      const supabase = createClient()
      const { count } = await supabase
        .from('periodos')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'enviado')
      setPendientes(count ?? 0)
    }

    fetchPendientes()
    // Interval raised 60s → 120s and paused while the tab is hidden to reduce
    // the steady background load on Supabase. A visibility listener refetches
    // once on return so the badge is up to date when the user comes back.
    const tick = () => {
      if (document.visibilityState === 'visible') fetchPendientes()
    }
    const timer = setInterval(tick, 120_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [usuario])

  const menuItems = usuario ? getMenuPorRol(usuario.rol) : []

  async function cerrarSesion() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
              <span className="text-sm font-bold text-white">CD</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Contratista Digital</h1>
              {municipio && <p className="text-xs text-gray-400">{municipio.nombre}</p>}
            </div>
          </div>
        </div>

        {/* Navegacion */}
        <nav className="flex-1 p-4 overflow-y-auto">
          {cargando && !usuario ? (
            /* Skeleton nav items while auth resolves */
            <ul className="space-y-1">
              {[...Array(5)].map((_, i) => (
                <li key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </ul>
          ) : (
            <ul className="space-y-1">
              {menuItems.map((item) => {
                const activo =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href))
                const esInformes = item.href === '/dashboard/informes'
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        activo ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {esInformes && pendientes > 0 && <PendingBadge n={pendientes} />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </nav>

        {/* Notifications — all roles */}
        {usuario && (
          <div className="px-4 pb-2">
            <NotificacionesBell />
          </div>
        )}

        {/* Usuario */}
        <div className="p-4 border-t border-gray-100">
          {cargando && !usuario && (
            <div className="flex items-center gap-3 mb-3 animate-pulse">
              <div className="w-9 h-9 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-200 rounded w-24" />
                <div className="h-2.5 bg-gray-100 rounded w-16" />
              </div>
            </div>
          )}
          {usuario && (
            <Link
              href="/dashboard/perfil"
              className="flex items-center gap-3 mb-3 rounded-xl p-1.5 -mx-1.5 hover:bg-gray-50 transition-colors group"
            >
              <UserAvatar nombre={usuario.nombre_completo} fotoUrl={usuario.foto_url} size={9} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                  {usuario.nombre_completo.split(' ')[0]}
                </p>
                <p className="text-xs text-gray-400 capitalize">{usuario.rol}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors">
                <path d="M5 3l4 4-4 4" />
              </svg>
            </Link>
          )}
          <button
            onClick={cerrarSesion}
            className="w-full text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cerrar sesion
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Mobile header ────────────────────────────────────────────
function MobileHeader({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { municipio } = useUsuario()
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 md:hidden">
      <button
        onClick={onMenuToggle}
        className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
        aria-label="Abrir menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="5" x2="17" y2="5" />
          <line x1="3" y1="10" x2="17" y2="10" />
          <line x1="3" y1="15" x2="17" y2="15" />
        </svg>
      </button>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
          <span className="text-xs font-bold text-white">CD</span>
        </div>
        <div>
          <h1 className="text-sm font-bold text-gray-900">Contratista Digital</h1>
          {municipio && <p className="text-[10px] text-gray-400 -mt-0.5">{municipio.nombre}</p>}
        </div>
      </div>
    </header>
  )
}

// ─── Global loading skeleton shown while auth resolves ────────
function AuthLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar placeholder */}
      <div className="hidden md:flex fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex-col animate-pulse">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-gray-200 rounded w-28" />
              <div className="h-2.5 bg-gray-100 rounded w-20" />
            </div>
          </div>
        </div>
        <div className="flex-1 p-4 space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
      {/* Content placeholder */}
      <div className="md:ml-64 flex-1 p-4 md:p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    </div>
  )
}

// ─── Layout ───────────────────────────────────────────────────
function DashboardContent({ children }: { children: React.ReactNode }) {
  const { cargando, usuario, sesionExpirada } = useUsuario()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Prevent double-redirect if push is already in flight
  const redirecting = useRef(false)

  useEffect(() => {
    if (cargando) return
    if (!usuario && !redirecting.current) {
      redirecting.current = true
      router.push(sesionExpirada ? '/login?expired=1' : '/login')
    }
    if (usuario) redirecting.current = false
  }, [cargando, usuario, sesionExpirada, router])

  // Auth confirmed absent — redirect is already in flight, render nothing.
  // We do NOT gate on cargando here: the server already validated auth via
  // requireRole / requireContractAccess, so children can mount immediately
  // and use their SSR-supplied initial data while client-side auth resolves.
  if (!cargando && !usuario) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="md:ml-64 flex flex-col min-h-screen">
        <MobileHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">{children}</main>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <UserProvider>
        <DashboardContent>{children}</DashboardContent>
      </UserProvider>
    </QueryProvider>
  )
}
