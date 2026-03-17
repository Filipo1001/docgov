'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function Home() {
  const [municipio, setMunicipio] = useState<any>(null)
  const [dependencias, setDependencias] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargarDatos() {
      const supabase = createClient()

      const { data: muni } = await supabase
        .from('municipios')
        .select('*')
        .single()

      const { data: deps } = await supabase
        .from('dependencias')
        .select('*')

      setMunicipio(muni)
      setDependencias(deps || [])
      setCargando(false)
    }

    cargarDatos()
  }, [])

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">

        <div className="bg-white rounded-2xl shadow-sm border p-8 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            DocGov
          </h1>
          <p className="text-gray-500">
            Plataforma de gestión documental contractual
          </p>
        </div>

        {municipio && (
          <div className="bg-white rounded-2xl shadow-sm border p-8 mb-6">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
              Municipio conectado
            </h2>
            <p className="text-2xl font-semibold text-gray-900">
              {municipio.nombre}, {municipio.departamento}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">NIT</span>
                <p className="text-gray-700 font-medium">{municipio.nit}</p>
              </div>
              <div>
                <span className="text-gray-400">Categoría</span>
                <p className="text-gray-700 font-medium">{municipio.categoria}</p>
              </div>
              <div className="col-span-2">
                <span className="text-gray-400">Representante Legal</span>
                <p className="text-gray-700 font-medium">{municipio.representante_legal}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border p-8">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Dependencias ({dependencias.length})
          </h2>
          <div className="space-y-3">
            {dependencias.map((dep: any) => (
              <div
                key={dep.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
              >
                <span className="text-gray-900 font-medium">{dep.nombre}</span>
                <span className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full">
                  {dep.abreviatura}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-gray-400 text-sm mt-8">
          Conexión exitosa a Supabase ✓
        </p>

      </div>
    </div>
  )
}