'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { UserProvider, useUsuario } from '@/lib/user-context'
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
  const { usuario, municipio, cargando } = useUsuario()
  const [pendientes, setPendientes] = useState(0)

  useEffect(() => {
    if (!cargando && !usuario) router.push('/login')
  }, [cargando, usuario, router])

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
    const timer = setInterval(fetchPendientes, 60_000)
    return () => clearInterval(timer)
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
              <span className="text-sm font-bold text-white">DG</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">DocGov</h1>
              {municipio && <p className="text-xs text-gray-400">{municipio.nombre}</p>}
            </div>
          </div>
        </div>

        {/* Navegacion */}
        <nav className="flex-1 p-4 overflow-y-auto">
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
        </nav>

        {/* Notifications — all roles */}
        {usuario && (
          <div className="px-4 pb-2">
            <NotificacionesBell />
          </div>
        )}

        {/* Usuario */}
        <div className="p-4 border-t border-gray-100">
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
        className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
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
          <span className="text-xs font-bold text-white">DG</span>
        </div>
        <div>
          <h1 className="text-sm font-bold text-gray-900">DocGov</h1>
          {municipio && <p className="text-[10px] text-gray-400 -mt-0.5">{municipio.nombre}</p>}
        </div>
      </div>
    </header>
  )
}

// ─── Layout ───────────────────────────────────────────────────
function DashboardContent({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="md:ml-64 flex flex-col min-h-screen">
        <MobileHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <DashboardContent>{children}</DashboardContent>
    </UserProvider>
  )
}
