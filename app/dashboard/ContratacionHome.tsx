'use client'

/**
 * Home del rol Contratación: gestión de usuarios contratistas y contratos.
 * Sin nada del flujo de informes — ese pertenece a asesores/secretaría.
 */

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { getContratacionStats } from '@/app/actions/contratacion'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'

function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

function fmtFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(iso + 'T12:00:00'))
}

const ACCESOS = [
  { href: '/dashboard/contratos/nuevo', icon: '📝', titulo: 'Nuevo contrato', desc: 'Registra el contrato y crea al contratista en un solo paso' },
  { href: '/dashboard/contratos', icon: '📄', titulo: 'Ver contratos', desc: 'Listado, edición y exportación' },
  { href: '/dashboard/admin/usuarios', icon: '👥', titulo: 'Contratistas', desc: 'Editar datos de las cuentas' },
]

export default function ContratacionHome({ nombre }: { nombre: string }) {
  const { data } = useQuery({
    queryKey: ['contratacion-stats'],
    queryFn: () => getContratacionStats(),
    staleTime: 60_000,
  })
  const stats = data?.data

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`${saludo()}, ${nombre.split(' ')[0]}`}
        subtitle="Gestión de contratación — usuarios y contratos"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Contratos activos" value={stats?.contratosActivos ?? '—'} color="gray" />
        <StatCard label="Vencen en 60 días" value={stats?.contratosPorVencer60 ?? '—'} color="amber" />
        <StatCard label="Pendientes de activar" value={stats?.importadosPendientes ?? '—'} color="blue" />
        <StatCard label="Sin firma registrada" value={stats?.contratistasSinFirma ?? '—'} color="red" />
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {ACCESOS.map(a => (
          <Link key={a.href} href={a.href} className="block">
            <Card className="h-full hover:shadow-md hover:border-gray-300 transition-all">
              <span className="text-2xl">{a.icon}</span>
              <h3 className="font-medium text-gray-900 text-sm mt-2">{a.titulo}</h3>
              <p className="text-xs text-gray-500 mt-1">{a.desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Contratos próximos a vencer */}
      {(stats?.proximosVencer?.length ?? 0) > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            ⚠️ Contratos próximos a vencer
          </h3>
          <div className="divide-y divide-gray-100">
            {stats!.proximosVencer.map(c => (
              <Link
                key={c.id}
                href={`/dashboard/contratos/${c.id}`}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.contratista}</p>
                  <p className="text-xs text-gray-400">Contrato N.° {c.numero}</p>
                </div>
                <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full whitespace-nowrap">
                  {fmtFecha(c.fecha_fin)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
