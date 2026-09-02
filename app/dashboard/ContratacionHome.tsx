'use client'

/**
 * Home del rol Contratación: gestión de usuarios contratistas y contratos.
 * Sin nada del flujo de informes — ese pertenece a asesores/secretaría.
 */

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { getContratacionStats } from '@/app/actions/contratacion'
import { getDatosFaltantes, type FilaFaltantes } from '@/app/actions/datos-faltantes'
import { capitalizarNombre } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'

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

const ACCESOS: { href: string; icono: LucideIcon; titulo: string; desc: string }[] = [
  // Mismo icono que "Registrar contrato" en AdminHome: es el mismo concepto.
  { href: '/dashboard/contratos/nuevo', icono: Iconos.accion.agregar, titulo: 'Nuevo contrato', desc: 'Registra el contrato y crea al contratista en un solo paso' },
  { href: '/dashboard/contratos', icono: Iconos.navegacion.contratos, titulo: 'Ver contratos', desc: 'Listado, edición y exportación' },
  { href: '/dashboard/admin/usuarios', icono: Iconos.navegacion.contratistas, titulo: 'Contratistas', desc: 'Activar cuentas y editar sus datos' },
]

export default function ContratacionHome({ nombre }: { nombre: string }) {
  const { data } = useQuery({
    queryKey: ['contratacion-stats'],
    queryFn: () => getContratacionStats(),
    staleTime: 60_000,
  })
  const stats = data?.data

  // Se consulta aparte de las cifras: recorre contratos, periodos, otrosíes,
  // actividades y evidencias, así que tarda más. Separarla deja que el resto
  // del panel pinte de inmediato en vez de esperar por ella.
  const { data: faltantesRes, isLoading: cargandoFaltantes } = useQuery({
    queryKey: ['datos-faltantes'],
    queryFn: () => getDatosFaltantes(),
    staleTime: 60_000,
  })
  const faltantes = faltantesRes?.data

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`${saludo()}, ${capitalizarNombre(nombre.split(' ')[0])}`}
        subtitle="Gestión de contratación — usuarios y contratos"
      />

      {/* Stats — cada cifra lleva a la pantalla donde se resuelve. Mostrar un
          pendiente sin ofrecer dónde atenderlo solo genera frustración. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Link href="/dashboard/contratos" className="block rounded-2xl transition-transform hover:-translate-y-0.5">
          <StatCard label="Contratos activos" value={stats?.contratosActivos ?? '—'} color="gray" />
        </Link>
        <Link href="/dashboard/contratos?vigencia=vigentes" className="block rounded-2xl transition-transform hover:-translate-y-0.5">
          <StatCard label="Vencen en 60 días" value={stats?.contratosPorVencer60 ?? '—'} color="amber" />
        </Link>
        <Link href="/dashboard/admin/usuarios?tab=pendientes" className="block rounded-2xl transition-transform hover:-translate-y-0.5">
          <StatCard label="Pendientes de activar" value={stats?.importadosPendientes ?? '—'} color="blue" />
        </Link>
        <Link href="/dashboard/contratos?incompletos=1" className="block rounded-2xl transition-transform hover:-translate-y-0.5">
          <StatCard label="Contratos incompletos" value={stats?.contratosIncompletos ?? '—'} color="red" />
        </Link>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {ACCESOS.map(a => (
          <Link key={a.href} href={a.href} className="block">
            <Card className="h-full hover:shadow-md hover:border-gray-300 transition-all">
              <Icono glifo={a.icono} tamano="lg" className="text-gray-400" />
              <h3 className="font-medium text-gray-900 text-sm mt-2">{a.titulo}</h3>
              <p className="text-xs text-gray-500 mt-1">{a.desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Datos que faltan para producir los documentos ──────────────────
          Colografía deliberada, siguiendo ESTADO_COLOR: el bloqueante lleva
          rojo tintado —impide producir el documento— y el incompleto ámbar,
          que sale pero flojo. Sin iconografía decorativa: la severidad la
          carga el color y la palabra, no un adorno. */}
      {!cargandoFaltantes && faltantes && faltantes.filas.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Datos faltantes para generar documentos
            </h3>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {faltantes.filas.length} de {faltantes.contratosRevisados} contratos
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            {faltantes.totalBloqueantes > 0 && (
              <span className="text-red-700 font-medium">
                {faltantes.totalBloqueantes} impiden emitir el documento
              </span>
            )}
            {faltantes.totalBloqueantes > 0 && faltantes.totalIncompletos > 0 && ' · '}
            {faltantes.totalIncompletos > 0 && (
              <span className="text-amber-700 font-medium">
                {faltantes.totalIncompletos} lo dejan incompleto
              </span>
            )}
          </p>

          <div className="divide-y divide-gray-100">
            {faltantes.filas.map((f: FilaFaltantes) => {
              const bloqueantes = f.faltantes.filter(x => x.severidad === 'bloqueante')
              return (
                <Link
                  key={f.contratoId}
                  href={`/dashboard/contratos/${f.contratoId}`}
                  className="block py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{f.contratista}</p>
                      <p className="text-xs text-gray-400">
                        Contrato N.° {f.contratoNumero}
                        {f.dependencia && ` — ${f.dependencia}`}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
                        bloqueantes.length > 0
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {bloqueantes.length > 0 ? 'Bloqueante' : 'Incompleto'}
                    </span>
                  </div>

                  <ul className="mt-2 space-y-1.5">
                    {f.faltantes.map((x, i) => (
                      <li key={i} className="flex gap-2.5">
                        {/* El punto de color es el único elemento gráfico:
                            marca severidad sin robarle peso al texto. */}
                        <span
                          className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            x.severidad === 'bloqueante' ? 'bg-red-500' : 'bg-amber-500'
                          }`}
                        />
                        <span className="min-w-0">
                          <span className="text-xs text-gray-700">{x.detalle}</span>
                          <span className="block text-[11px] text-gray-400">
                            Afecta: {x.afecta.join(' · ')}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Link>
              )
            })}
          </div>
        </Card>
      )}

      {/* El "todo en orden" solo aparece cuando de verdad se revisó: sin este
          guard, un fallo de la consulta se leería como ausencia de problemas. */}
      {!cargandoFaltantes && faltantes && faltantes.filas.length === 0 && (
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900">
            Datos faltantes para generar documentos
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Los {faltantes.contratosRevisados} contratos vigentes tienen lo necesario
            para emitir sus documentos.
          </p>
        </Card>
      )}

      {/* Contratos próximos a vencer */}
      {(stats?.proximosVencer?.length ?? 0) > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="text-amber-500" />
            Contratos próximos a vencer
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
