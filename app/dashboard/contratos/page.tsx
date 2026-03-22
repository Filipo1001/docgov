'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUsuario } from '@/lib/user-context'

export default function ContratosPage() {
  const { usuario, cargando: cargandoUser } = useUsuario()
  const [contratos, setContratos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!usuario) return

    async function cargar() {
      const supabase = createClient()

      let query = supabase
        .from('contratos')
        .select(`
          *,
          contratista:usuarios!contratos_contratista_id_fkey(nombre_completo),
          supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo),
          dependencia:dependencias(nombre, abreviatura)
        `)
        .order('created_at', { ascending: false })

      // Filtrar según rol
      if (usuario!.rol === 'supervisor') {
        query = query.eq('supervisor_id', usuario!.id)
      } else if (usuario!.rol === 'contratista') {
        query = query.eq('contratista_id', usuario!.id)
      }
      // admin ve todo, sin filtro adicional

      const { data } = await query
      setContratos(data || [])
      setCargando(false)
    }

    cargar()
  }, [usuario])

  if (cargandoUser || cargando) {
    return <p className="text-gray-500">Cargando contratos...</p>
  }

  const esAdmin = usuario?.rol === 'admin'
  const titulo = esAdmin ? 'Contratos' : 'Mis contratos'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{titulo}</h2>
        {esAdmin && (
          <Link
            href="/dashboard/contratos/nuevo"
            className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + Nuevo contrato
          </Link>
        )}
      </div>

      {contratos.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📄</span>
          </div>
          <h3 className="font-medium text-gray-900 mb-2">
            {esAdmin ? 'No hay contratos registrados' : 'No tienes contratos asignados'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {esAdmin
              ? 'Registra el primer contrato para comenzar a gestionar los pagos.'
              : 'Cuando el administrador te asigne un contrato, aparecerá aquí.'}
          </p>
          {esAdmin && (
            <Link
              href="/dashboard/contratos/nuevo"
              className="inline-block bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Registrar primer contrato
            </Link>
          )}
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
