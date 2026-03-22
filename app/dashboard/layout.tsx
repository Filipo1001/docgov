'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEffect } from 'react'
import { UserProvider, useUsuario } from '@/lib/user-context'
import { MENU_POR_ROL } from '@/lib/constants'

function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { usuario, municipio, cargando } = useUsuario()

  useEffect(() => {
    if (!cargando && !usuario) router.push('/login')
  }, [cargando, usuario, router])

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
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    activo ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
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
