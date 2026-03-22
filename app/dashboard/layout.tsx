'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { UserProvider, useUsuario } from '@/lib/user-context'
import { MENU_POR_ROL, ESTADO_REVISOR } from '@/lib/constants'
import type { EstadoPeriodo } from '@/lib/types'

// ─── Pending count badge ──────────────────────────────────────
function Badge({ n }: { n: number }) {
  if (n === 0) return null
  return (
    <span className="ml-auto min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none">
      {n > 99 ? '99+' : n}
    </span>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────
function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { usuario, municipio, cargando } = useUsuario()
  const [pendientes, setPendientes] = useState(0)

  useEffect(() => {
    if (!cargando && !usuario) router.push('/login')
  }, [cargando, usuario, router])

  // Fetch the count of periods waiting for this user's review
  useEffect(() => {
    if (!usuario) return
    const rolEstado: EstadoPeriodo | undefined = ESTADO_REVISOR[usuario.rol]
    if (!rolEstado && usuario.rol !== 'admin') return

    async function fetchPendientes() {
      const supabase = createClient()

      if (usuario!.rol === 'admin') {
        // Admin sees all in-review periods
        const { count } = await supabase
          .from('periodos')
          .select('id', { count: 'exact', head: true })
          .in('estado', ['enviado', 'revision_asesor', 'revision_gobierno', 'revision_hacienda'])
        setPendientes(count ?? 0)
      } else if (rolEstado) {
        // Each reviewer sees only their own queue
        const { count } = await supabase
          .from('periodos')
          .select('id', { count: 'exact', head: true })
          .eq('estado', rolEstado)
        setPendientes(count ?? 0)
      }
    }

    fetchPendientes()
    // Re-check every 60 s without hammering the DB
    const timer = setInterval(fetchPendientes, 60_000)
    return () => clearInterval(timer)
  }, [usuario])

  const menuItems = usuario ? (MENU_POR_ROL[usuario.rol] ?? MENU_POR_ROL.contratista) : []

  async function cerrarSesion() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full">
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

      {/* Navegación */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const activo =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            const esAprobaciones = item.href === '/dashboard/aprobaciones'
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
                  {esAprobaciones && <Badge n={pendientes} />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Usuario */}
      <div className="p-4 border-t border-gray-100">
        {usuario && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-blue-700">
                {usuario.nombre_completo.charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {usuario.nombre_completo.split(' ')[0]}
              </p>
              <p className="text-xs text-gray-400 capitalize">{usuario.rol}</p>
            </div>
          </div>
        )}
        <button
          onClick={cerrarSesion}
          className="w-full text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar />
        <main className="flex-1 ml-64 p-8">{children}</main>
      </div>
    </UserProvider>
  )
}
