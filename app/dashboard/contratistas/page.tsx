'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUsuario } from '@/lib/user-context'
import { getContratistasPorDependencia } from '@/services/periodos'

function Avatar({ nombre }: { nombre: string }) {
  const initials = nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
      {initials}
    </div>
  )
}

export default function ContratistasPage() {
  const { usuario, cargando: cargandoUser } = useUsuario()
  const [contratistas, setContratistas] = useState<Awaited<ReturnType<typeof getContratistasPorDependencia>>>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (!usuario?.dependencia_id) { setCargando(false); return }
    async function load() {
      const data = await getContratistasPorDependencia(usuario!.dependencia_id!)
      setContratistas(data)
      setCargando(false)
    }
    load()
  }, [usuario])

  if (cargandoUser || cargando) {
    return (
      <div className="space-y-3 animate-pulse max-w-2xl">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-xl" />)}
      </div>
    )
  }

  if (!usuario?.dependencia_id) {
    return (
      <div className="bg-white rounded-2xl border p-12 text-center max-w-2xl">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="font-semibold text-gray-900 mb-1">Sin dependencia asignada</h3>
        <p className="text-sm text-gray-500">
          Tu usuario no tiene una dependencia asignada. Contacta al administrador.
        </p>
      </div>
    )
  }

  const filtrados = contratistas.filter(c => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return c.nombre_completo.toLowerCase().includes(q) || c.cedula?.includes(q)
  })

  const conContrato = filtrados.filter(c => c.tiene_contrato)
  const sinContrato = filtrados.filter(c => !c.tiene_contrato)

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Contratistas</h2>
        <p className="text-sm text-gray-400 mt-1">
          {contratistas.length} contratistas en tu dependencia
        </p>
      </div>

      {/* Search */}
      <input
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o cédula..."
        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-6"
      />

      {filtrados.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <h3 className="font-semibold text-gray-900 mb-1">Sin contratistas</h3>
          <p className="text-sm text-gray-500">
            {busqueda ? 'No hay resultados para esa búsqueda.' : 'No hay contratistas en tu dependencia.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* With contract (green) */}
          {conContrato.map(c => (
            <Link
              key={c.id}
              href={c.contrato_activo ? `/dashboard/contratos/${c.contrato_activo.id}` : '#'}
              className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors"
            >
              <Avatar nombre={c.nombre_completo} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{c.nombre_completo}</p>
                <p className="text-xs text-gray-500">C.C. {c.cedula}</p>
              </div>
              {c.contrato_activo && (
                <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                  Contrato N.° {c.contrato_activo.numero}
                </span>
              )}
            </Link>
          ))}

          {/* Without contract (red) */}
          {sinContrato.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl"
            >
              <Avatar nombre={c.nombre_completo} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{c.nombre_completo}</p>
                <p className="text-xs text-gray-500">C.C. {c.cedula}</p>
              </div>
              <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                Sin contrato
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
