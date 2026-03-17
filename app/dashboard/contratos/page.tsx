'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function ContratosPage() {
  const [contratos, setContratos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      const { data } = await supabase
        .from('contratos')
        .select(`
          *,
          contratista:usuarios!contratos_contratista_id_fkey(nombre_completo),
          supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo),
          dependencia:dependencias(nombre, abreviatura)
        `)
        .order('created_at', { ascending: false })

      setContratos(data || [])
      setCargando(false)
    }
    cargar()
  }, [])

  if (cargando) {
    return <p className="text-gray-500">Cargando contratos...</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Contratos</h2>
        <Link
          href="/dashboard/contratos/nuevo"
          className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          + Nuevo contrato
        </Link>
      </div>

      {contratos.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📄</span>
          </div>
          <h3 className="font-medium text-gray-900 mb-2">No hay contratos registrados</h3>
          <p className="text-sm text-gray-500 mb-4">Registra el primer contrato para comenzar a gestionar los pagos.</p>
          <Link
            href="/dashboard/contratos/nuevo"
            className="inline-block bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Registrar primer contrato
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {contratos.map((contrato) => (
            <Link
              key={contrato.id}
              href={`/dashboard/contratos/${contrato.id}`}
              className="block bg-white rounded-2xl border p-6 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-bold text-gray-900">
                      Contrato N.º {contrato.numero}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {contrato.dependencia?.abreviatura}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{contrato.objeto}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>Contratista: {contrato.contratista?.nombre_completo}</span>
                    <span>•</span>
                    <span>Supervisor: {contrato.supervisor?.nombre_completo}</span>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-semibold text-gray-900">
                    ${contrato.valor_total?.toLocaleString('es-CO')}
                  </p>
                  <p className="text-xs text-gray-400">{contrato.plazo_meses} meses</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}