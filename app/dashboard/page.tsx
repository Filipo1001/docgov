'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const [usuario, setUsuario] = useState<any>(null)
  const [municipio, setMunicipio] = useState<any>(null)
  const [sesion, setSesion] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function cargarDatos() {
      const supabase = createClient()

      // Verificar si hay sesión activa
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      setSesion(session)

      // Buscar datos del usuario en nuestra tabla
      const { data: user } = await supabase
        .from('usuarios')
        .select('*, dependencias(nombre)')
        .eq('id', session.user.id)
        .single()

      // Cargar municipio
      const { data: muni } = await supabase
        .from('municipios')
        .select('*')
        .single()

      setUsuario(user)
      setMunicipio(muni)
      setCargando(false)
    }

    cargarDatos()
  }, [router])

  async function cerrarSesion() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando dashboard...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">DocGov</h1>
            {municipio && (
              <p className="text-sm text-gray-400">{municipio.nombre}, {municipio.departamento}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">
                {usuario?.nombre_completo || sesion?.user?.email}
              </p>
              {usuario && (
                <p className="text-xs text-gray-400 capitalize">{usuario.rol}</p>
              )}
            </div>
            <button
              onClick={cerrarSesion}
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* Bienvenida */}
        <div className="bg-white rounded-2xl shadow-sm border p-8 mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            {usuario
              ? `Bienvenido, ${usuario.nombre_completo.split(' ')[0]}`
              : 'Bienvenido a DocGov'
            }
          </h2>
          <p className="text-gray-500">
            {usuario
              ? `Rol: ${usuario.rol} — ${usuario.dependencias?.nombre || 'Sin dependencia asignada'}`
              : 'Tu sesión está activa pero aún no tienes un perfil de usuario registrado en el sistema.'
            }
          </p>
        </div>

        {/* Si no tiene perfil de usuario */}
        {!usuario && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6">
            <h3 className="font-medium text-amber-900 mb-2">Perfil pendiente</h3>
            <p className="text-sm text-amber-700">
              Tu cuenta de acceso funciona ({sesion?.user?.email}), pero el administrador aún no ha creado tu perfil de usuario.
              Contacta al administrador del sistema para que te asigne un rol (contratista, supervisor, etc.).
            </p>
          </div>
        )}

        {/* Tarjetas de acceso rápido */}
        {usuario && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border p-6 hover:border-gray-300 transition-colors cursor-pointer">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">Mis contratos</h3>
              <p className="text-sm text-gray-500 mt-1">Ver contratos activos y periodos de pago</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border p-6 hover:border-gray-300 transition-colors cursor-pointer">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">Registrar actividades</h3>
              <p className="text-sm text-gray-500 mt-1">Registrar actividades del mes actual</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border p-6 hover:border-gray-300 transition-colors cursor-pointer">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">Aprobaciones</h3>
              <p className="text-sm text-gray-500 mt-1">Revisar documentos pendientes</p>
            </div>
          </div>
        )}

        {/* Info de sesión (debug - útil durante desarrollo) */}
        <div className="mt-8 bg-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Info de sesión (debug - se quita en producción):</p>
          <p className="text-xs text-gray-500 font-mono">Email: {sesion?.user?.email}</p>
          <p className="text-xs text-gray-500 font-mono">User ID: {sesion?.user?.id}</p>
          <p className="text-xs text-gray-500 font-mono">Perfil en DB: {usuario ? 'Sí' : 'No'}</p>
        </div>

      </main>
    </div>
  )
}