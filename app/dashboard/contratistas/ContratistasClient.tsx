'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUsuario } from '@/lib/user-context'
import { getContratistasPorDependencia } from '@/services/periodos'
import { formatCedula } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'

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
      <div className="space-y-3 animate-pulse">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-xl" />)}
      </div>
    )
  }

  if (!usuario?.dependencia_id) {
    return (
      <Card className="p-12">
        <EmptyState
          icon="⚠️"
          title="Sin dependencia asignada"
          description="Tu usuario no tiene una dependencia asignada. Contacta al administrador."
        />
      </Card>
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
    <div>
      <PageHeader
        title="Contratistas"
        subtitle={`${contratistas.length} contratistas en tu dependencia`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total" value={contratistas.length} color="gray" />
        <StatCard label="Con contrato" value={contratistas.filter(c => c.tiene_contrato).length} color="emerald" />
        <StatCard label="Sin contrato" value={contratistas.filter(c => !c.tiene_contrato).length} color="red" />
        <StatCard label="Resultados" value={filtrados.length} color="blue" />
      </div>

      {/* Search */}
      <div className="mb-6">
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por nombre o cedula..."
        />
      </div>

      {filtrados.length === 0 ? (
        <Card>
          <EmptyState
            icon="📭"
            title="Sin contratistas"
            description={busqueda ? 'No hay resultados para esa busqueda.' : 'No hay contratistas en tu dependencia.'}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* With contract (green) */}
          {conContrato.map(c => (
            <Link
              key={c.id}
              href={c.contrato_activo ? `/dashboard/contratos/${c.contrato_activo.id}` : '#'}
              className="bg-green-50 rounded-2xl border border-green-200 p-4 hover:bg-green-100 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Avatar nombre={c.nombre_completo} foto={c.foto_url} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate group-hover:text-green-800 transition-colors">
                    {c.nombre_completo}
                  </p>
                  <p className="text-xs text-gray-500">C.C. {formatCedula(c.cedula)}</p>
                </div>
              </div>
              {c.contrato_activo && (
                <div className="mt-3">
                  <Badge variant="green">Contrato N.° {c.contrato_activo.numero}</Badge>
                </div>
              )}
            </Link>
          ))}

          {/* Without contract (red) */}
          {sinContrato.map(c => (
            <div
              key={c.id}
              className="bg-red-50 rounded-2xl border border-red-200 p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar nombre={c.nombre_completo} foto={c.foto_url} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{c.nombre_completo}</p>
                  <p className="text-xs text-gray-500">C.C. {formatCedula(c.cedula)}</p>
                </div>
              </div>
              <div className="mt-3">
                <Badge variant="red">Sin contrato</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
