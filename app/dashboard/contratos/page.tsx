'use client'

import Link from 'next/link'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useUsuario } from '@/lib/user-context'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function formatCOP(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-CO')}`
}

const RANGOS = [
  { label: 'Todos los valores',         min: 0,         max: Infinity },
  { label: 'Hasta $3.000.000',          min: 0,         max: 3_000_000 },
  { label: '$3.000.001 – $6.000.000',   min: 3_000_001, max: 6_000_000 },
  { label: '$6.000.001 – $9.000.000',   min: 6_000_001, max: 9_000_000 },
  { label: 'Más de $9.000.000',         min: 9_000_001, max: Infinity },
]

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ContratosPage() {
  const { usuario, cargando: cargandoUser } = useUsuario()
  const [contratos, setContratos]           = useState<any[]>([])
  const [cargando, setCargando]             = useState(true)

  // ── Filters (admin only) ──────────────────────────────────────
  const [busqueda, setBusqueda]         = useState('')
  const [filtroDep, setFiltroDep]       = useState('')
  const [filtroSup, setFiltroSup]       = useState('')
  const [filtroRango, setFiltroRango]   = useState(0)          // index in RANGOS
  const [soloIncompletos, setSoloInc]   = useState(false)
  const [filtroVigencia, setFiltroVig]  = useState<'todos' | 'vigentes' | 'vencidos'>('todos')

  useEffect(() => {
    if (!usuario) return
    async function cargar() {
      const supabase = createClient()
      let query = supabase
        .from('contratos')
        .select(`
          *,
          contratista:usuarios!contratos_contratista_id_fkey(
            nombre_completo, cedula, email, telefono, foto_url,
            firma_url, cargo, banco, tipo_cuenta, numero_cuenta
          ),
          supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
          dependencia:dependencias(id, nombre, abreviatura)
        `)
        .order('numero', { ascending: true })

      if (usuario!.rol === 'supervisor') {
        query = query.eq('supervisor_id', usuario!.id)
      } else if (usuario!.rol === 'contratista') {
        query = query.eq('contratista_id', usuario!.id)
      }

      const { data } = await query
      setContratos(data || [])
      setCargando(false)
    }
    cargar()
  }, [usuario])

  const esAdmin = usuario?.rol === 'admin'
  const hoy = new Date().toISOString().split('T')[0]

  // ── Derived filter options from loaded data ───────────────────
  const dependencias = useMemo(() => {
    const map = new Map<string, string>()
    contratos.forEach(c => {
      if (c.dependencia?.id) map.set(c.dependencia.id, c.dependencia.nombre)
    })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [contratos])

  const supervisores = useMemo(() => {
    const map = new Map<string, string>()
    contratos.forEach(c => {
      if (c.supervisor?.id) map.set(c.supervisor.id, c.supervisor.nombre_completo)
    })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [contratos])

  // ── Missing data check ────────────────────────────────────────
  function datosFaltantes(contrato: any): string[] {
    if (!esAdmin) return []
    const c = contrato.contratista
    if (!c) return ['Contratista no encontrado']
    const f: string[] = []
    if (!c.email || c.email.endsWith('@pendiente.local')) f.push('Email')
    if (!c.telefono)     f.push('Celular')
    if (!c.cargo)        f.push('Cargo')
    if (!c.foto_url)     f.push('Foto')
    if (!c.firma_url)    f.push('Firma')
    if (!c.banco || !c.tipo_cuenta || !c.numero_cuenta) f.push('Cuenta bancaria')
    return f
  }

  // ── Apply filters ─────────────────────────────────────────────
  const visibles = useMemo(() => {
    if (!esAdmin) return contratos

    const q = norm(busqueda)
    const rango = RANGOS[filtroRango]

    return contratos.filter(c => {
      // Text search
      if (q) {
        const enNumero = norm(c.numero ?? '').includes(q)
        const enNombre = norm(c.contratista?.nombre_completo ?? '').includes(q)
        const enCedula = norm(c.contratista?.cedula ?? '').includes(q)
        if (!enNumero && !enNombre && !enCedula) return false
      }
      // Dependencia
      if (filtroDep && c.dependencia?.id !== filtroDep) return false
      // Supervisor
      if (filtroSup && c.supervisor?.id !== filtroSup) return false
      // Rango salarial (valor_mensual)
      const vm = c.valor_mensual ?? 0
      if (vm < rango.min || vm > rango.max) return false
      // Solo incompletos
      if (soloIncompletos && datosFaltantes(c).length === 0) return false
      // Vigencia
      if (filtroVigencia === 'vigentes'  && c.fecha_fin <  hoy) return false
      if (filtroVigencia === 'vencidos'  && c.fecha_fin >= hoy) return false
      return true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratos, busqueda, filtroDep, filtroSup, filtroRango, soloIncompletos, filtroVigencia])

  const hayFiltrosActivos = busqueda || filtroDep || filtroSup || filtroRango > 0 || soloIncompletos || filtroVigencia !== 'todos'

  function limpiarFiltros() {
    setBusqueda('')
    setFiltroDep('')
    setFiltroSup('')
    setFiltroRango(0)
    setSoloInc(false)
    setFiltroVig('todos')
  }

  if (cargandoUser || cargando) {
    return <p className="text-gray-500">Cargando contratos...</p>
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {esAdmin ? 'Contratos' : 'Mis contratos'}
        </h2>
        {esAdmin && (
          <Link
            href="/dashboard/contratos/nuevo"
            className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + Nuevo contrato
          </Link>
        )}
      </div>

      {/* ── Search + Filters (admin only) ───────────────────────── */}
      {esAdmin && contratos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 space-y-3">

          {/* Search bar */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por N.º contrato, nombre del contratista o cédula…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap gap-2 items-center">

            {/* Secretaría */}
            <select
              value={filtroDep}
              onChange={e => setFiltroDep(e.target.value)}
              className={`px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${filtroDep ? 'border-gray-900 text-gray-900 font-medium' : 'border-gray-200 text-gray-500'}`}
            >
              <option value="">Todas las secretarías</option>
              {dependencias.map(([id, nombre]) => (
                <option key={id} value={id}>{nombre.replace(/^Secretaría\s+/i, 'Sec. ')}</option>
              ))}
            </select>

            {/* Supervisor */}
            <select
              value={filtroSup}
              onChange={e => setFiltroSup(e.target.value)}
              className={`px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${filtroSup ? 'border-gray-900 text-gray-900 font-medium' : 'border-gray-200 text-gray-500'}`}
            >
              <option value="">Todos los supervisores</option>
              {supervisores.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre.split(' ').slice(0, 2).join(' ')}
                </option>
              ))}
            </select>

            {/* Rango salarial */}
            <select
              value={filtroRango}
              onChange={e => setFiltroRango(Number(e.target.value))}
              className={`px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${filtroRango > 0 ? 'border-gray-900 text-gray-900 font-medium' : 'border-gray-200 text-gray-500'}`}
            >
              {RANGOS.map((r, i) => (
                <option key={i} value={i}>{r.label}</option>
              ))}
            </select>

            {/* Vigencia */}
            <div className="flex border border-gray-200 rounded-xl overflow-hidden text-sm">
              {(['todos', 'vigentes', 'vencidos'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setFiltroVig(v)}
                  className={`px-3 py-2 transition-colors ${filtroVigencia === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {v === 'todos' ? 'Todos' : v === 'vigentes' ? 'Vigentes' : 'Vencidos'}
                </button>
              ))}
            </div>

            {/* Solo incompletos toggle */}
            <button
              onClick={() => setSoloInc(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-sm transition-colors ${
                soloIncompletos
                  ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[9px] ${soloIncompletos ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300'}`}>
                {soloIncompletos ? '✓' : ''}
              </span>
              Solo incompletos
            </button>

            {/* Clear */}
            {hayFiltrosActivos && (
              <button
                onClick={limpiarFiltros}
                className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Result count */}
          <p className="text-xs text-gray-400">
            {hayFiltrosActivos
              ? `${visibles.length} de ${contratos.length} contratos`
              : `${contratos.length} contratos en total`}
          </p>
        </div>
      )}

      {/* ── List ─────────────────────────────────────────────────── */}
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
      ) : visibles.length === 0 ? (
        <div className="bg-white rounded-2xl border p-10 text-center">
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm font-medium text-gray-700">Sin resultados</p>
          <p className="text-xs text-gray-400 mt-1">Prueba con otros filtros</p>
          <button onClick={limpiarFiltros} className="mt-3 text-sm text-gray-500 underline hover:text-gray-700">
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((contrato) => {
            const faltantes  = datosFaltantes(contrato)
            const incompleto = faltantes.length > 0
            const vencido    = contrato.fecha_fin < hoy

            return (
              <Link
                key={contrato.id}
                href={`/dashboard/contratos/${contrato.id}`}
                className={`block rounded-2xl border p-5 transition-colors ${
                  incompleto
                    ? 'bg-red-50 border-red-200 hover:border-red-300'
                    : 'bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">

                    {/* Top row */}
                    <div className="flex items-center flex-wrap gap-2 mb-1.5">
                      <span className="text-sm font-bold text-gray-900 font-mono">
                        {contrato.numero}-{contrato.anio}
                      </span>
                      {contrato.dependencia?.abreviatura && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {contrato.dependencia.abreviatura}
                        </span>
                      )}
                      {vencido && (
                        <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          Vencido
                        </span>
                      )}
                      {incompleto && (
                        <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                          Faltan: {faltantes.join(' · ')}
                        </span>
                      )}
                    </div>

                    {/* Object */}
                    <p className="text-sm text-gray-600 line-clamp-1 mb-2">{contrato.objeto}</p>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                      <span className="font-medium text-gray-700">
                        {contrato.contratista?.nombre_completo?.split(' ').slice(0, 3).join(' ')}
                      </span>
                      {contrato.contratista?.cedula && (
                        <span className="font-mono">{contrato.contratista.cedula}</span>
                      )}
                      <span>Sup: {contrato.supervisor?.nombre_completo?.split(' ').slice(0, 2).join(' ')}</span>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">
                      {formatCOP(contrato.valor_mensual ?? 0)}<span className="text-xs text-gray-400 font-normal">/mes</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatCOP(contrato.valor_total ?? 0)} total</p>
                    <p className="text-xs text-gray-400">{contrato.plazo_meses}m · {contrato.fecha_inicio?.slice(0, 7)}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
