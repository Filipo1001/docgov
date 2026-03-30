'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUsuario } from '@/lib/user-context'
import SupervisorHome from './SupervisorHome'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'

const estadoPendientePorRol: Record<string, string> = {
  supervisor:  'enviado',
  asesor:      'revision_asesor',
  gobierno:    'revision_gobierno',
  hacienda:    'revision_hacienda',
}

export default function DashboardPage() {
  const { usuario, cargando: cargandoUser } = useUsuario()
  const [stats, setStats] = useState({ a: 0, b: 0, c: 0 })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!usuario) return
    if (usuario.rol === 'supervisor') { setCargando(false); return }

    async function cargar() {
      const supabase = createClient()

      if (usuario!.rol === 'admin') {
        const [{ count: a }, { count: b }, { count: c }] = await Promise.all([
          supabase.from('contratos').select('*', { count: 'exact', head: true }),
          supabase.from('periodos').select('*', { count: 'exact', head: true })
            .in('estado', ['enviado', 'revision_asesor', 'revision_gobierno', 'revision_hacienda']),
          supabase.from('periodos').select('*', { count: 'exact', head: true }).eq('estado', 'aprobado'),
        ])
        setStats({ a: a || 0, b: b || 0, c: c || 0 })
      } else if (usuario!.rol === 'contratista') {
        const { data: mis } = await supabase.from('contratos').select('id').eq('contratista_id', usuario!.id)
        const ids = mis?.map(c => c.id) ?? []
        const [{ count: b }, { count: c }] = await Promise.all([
          ids.length ? supabase.from('periodos').select('*', { count: 'exact', head: true })
            .in('contrato_id', ids).in('estado', ['borrador', 'rechazado'])
            : Promise.resolve({ count: 0 }),
          ids.length ? supabase.from('periodos').select('*', { count: 'exact', head: true })
            .in('contrato_id', ids).eq('estado', 'aprobado')
            : Promise.resolve({ count: 0 }),
        ])
        setStats({ a: ids.length, b: b || 0, c: c || 0 })
      } else {
        const estadoPendiente = estadoPendientePorRol[usuario!.rol] ?? 'revision_asesor'
        const [{ count: b }, { count: c }] = await Promise.all([
          supabase.from('periodos').select('*', { count: 'exact', head: true }).eq('estado', estadoPendiente),
          supabase.from('periodos').select('*', { count: 'exact', head: true }).eq('estado', 'aprobado'),
        ])
        setStats({ a: 0, b: b || 0, c: c || 0 })
      }

      setCargando(false)
    }

    cargar()
  }, [usuario])

  if (cargandoUser) return <p className="text-gray-500">Cargando...</p>
  if (!usuario) return null

  // ── Supervisor gets a dedicated rich dashboard ──
  if (usuario.rol === 'supervisor') {
    return <SupervisorHome userId={usuario.id} nombre={usuario.nombre_completo} />
  }

  if (cargando) return <p className="text-gray-500">Cargando...</p>

  type Cfg = {
    titulo: string
    subtitulo: string
    cards: Array<{ label: string; val: number; color: 'emerald' | 'blue' | 'amber' | 'red' | 'indigo' | 'gray' }>
    accesos: Array<{ href: string; icon: string; label: string; desc: string }>
  }

  const config: Partial<Record<string, Cfg>> = {
    admin: {
      titulo: 'Panel de administracion',
      subtitulo: 'Vista general de todos los contratos y periodos',
      cards: [
        { label: 'Contratos totales',    val: stats.a, color: 'gray' },
        { label: 'Periodos en revision', val: stats.b, color: 'amber' },
        { label: 'Periodos aprobados',   val: stats.c, color: 'emerald' },
      ],
      accesos: [
        { href: '/dashboard/contratos/nuevo', icon: '➕', label: 'Registrar contrato',  desc: 'Crear un nuevo contrato de prestacion de servicios' },
        { href: '/dashboard/contratos',       icon: '📋', label: 'Ver contratos',        desc: 'Lista de todos los contratos activos' },
        { href: '/dashboard/aprobaciones',    icon: '✅', label: 'Aprobaciones',          desc: 'Periodos pendientes de revision en el sistema' },
      ],
    },
    contratista: {
      titulo: 'Mis contratos',
      subtitulo: 'Registra tus actividades mensuales y envia tus cuentas de cobro',
      cards: [
        { label: 'Mis contratos',           val: stats.a, color: 'gray' },
        { label: 'Periodos por completar',  val: stats.b, color: 'amber' },
        { label: 'Periodos aprobados',      val: stats.c, color: 'emerald' },
      ],
      accesos: [
        { href: '/dashboard/contratos', icon: '📋', label: 'Mis contratos', desc: 'Ver tus contratos vigentes y registrar actividades por periodo' },
      ],
    },
    asesor: {
      titulo: 'Revision juridica',
      subtitulo: 'Periodos pendientes de tu aprobacion',
      cards: [
        { label: 'Pendientes de revision', val: stats.b, color: 'amber' },
        { label: 'Periodos aprobados',     val: stats.c, color: 'emerald' },
      ],
      accesos: [
        { href: '/dashboard/aprobaciones', icon: '✅', label: 'Revisar periodos', desc: 'Periodos en revision juridica que requieren tu aprobacion' },
      ],
    },
    gobierno: {
      titulo: 'Revision de gobierno',
      subtitulo: 'Periodos pendientes de tu aprobacion',
      cards: [
        { label: 'Pendientes de revision', val: stats.b, color: 'amber' },
        { label: 'Periodos aprobados',     val: stats.c, color: 'emerald' },
      ],
      accesos: [
        { href: '/dashboard/aprobaciones', icon: '✅', label: 'Revisar periodos', desc: 'Periodos que requieren aprobacion de gobierno' },
      ],
    },
    hacienda: {
      titulo: 'Hacienda',
      subtitulo: 'Periodos pendientes de pago',
      cards: [
        { label: 'Pendientes de aprobacion', val: stats.b, color: 'amber' },
        { label: 'Periodos aprobados',       val: stats.c, color: 'emerald' },
      ],
      accesos: [
        { href: '/dashboard/aprobaciones', icon: '✅', label: 'Gestionar pagos', desc: 'Aprobar periodos para pago final' },
      ],
    },
  }

  const cfg = config[usuario.rol] ?? config.contratista!

  return (
    <div>
      <PageHeader
        title={cfg.titulo}
        subtitle={`Bienvenido, ${usuario.nombre_completo.split(' ')[0]} — ${cfg.subtitulo}`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cfg.cards.map((card, i) => (
          <StatCard
            key={i}
            label={card.label}
            value={card.val}
            color={card.color}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cfg.accesos.map((acceso, i) => (
          <Link key={i} href={acceso.href} className="block">
            <Card className="hover:border-gray-300 transition-colors group h-full">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-gray-200 transition-colors">
                <span className="text-xl">{acceso.icon}</span>
              </div>
              <h3 className="font-medium text-gray-900">{acceso.label}</h3>
              <p className="text-sm text-gray-500 mt-1">{acceso.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
