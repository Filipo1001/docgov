'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function DashboardPage() {
  const [stats, setStats] = useState({ contratos: 0, pendientes: 0, aprobados: 0 })

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      
      const { count: totalContratos } = await supabase
        .from('contratos')
        .select('*', { count: 'exact', head: true })

      const { count: pendientes } = await supabase
        .from('periodos')
        .select('*', { count: 'exact', head: true })
        .in('estado', ['enviado', 'revision_supervisor', 'revision_asesor', 'revision_gobierno', 'revision_hacienda'])

      const { count: aprobados } = await supabase
        .from('periodos')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'aprobado')

      setStats({
        contratos: totalContratos || 0,
        pendientes: pendientes || 0,
        aprobados: aprobados || 0,
      })
    }
    cargar()
  }, [])

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border p-6">
          <p className="text-sm text-gray-400 mb-1">Contratos activos</p>
          <p className="text-3xl font-bold text-gray-900">{stats.contratos}</p>
        </div>
        <div className="bg-white rounded-2xl border p-6">
          <p className="text-sm text-gray-400 mb-1">Periodos pendientes</p>
          <p className="text-3xl font-bold text-amber-600">{stats.pendientes}</p>
        </div>
        <div className="bg-white rounded-2xl border p-6">
          <p className="text-sm text-gray-400 mb-1">Periodos aprobados</p>
          <p className="text-3xl font-bold text-green-600">{stats.aprobados}</p>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/dashboard/contratos/nuevo"
          className="bg-white rounded-2xl border p-6 hover:border-gray-300 transition-colors group"
        >
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
            <span className="text-xl">➕</span>
          </div>
          <h3 className="font-medium text-gray-900">Registrar contrato</h3>
          <p className="text-sm text-gray-500 mt-1">Crear un nuevo contrato de prestación de servicios</p>
        </Link>

        <Link
          href="/dashboard/contratos"
          className="bg-white rounded-2xl border p-6 hover:border-gray-300 transition-colors group"
        >
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
            <span className="text-xl">📋</span>
          </div>
          <h3 className="font-medium text-gray-900">Ver contratos</h3>
          <p className="text-sm text-gray-500 mt-1">Lista de contratos activos y sus periodos de pago</p>
        </Link>
      </div>
    </div>
  )
}