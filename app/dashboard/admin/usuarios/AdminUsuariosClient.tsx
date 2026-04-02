'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { activarContratista } from '@/app/actions/admin'
import { formatCedula } from '@/lib/format'
import type { UsuarioAdmin, ContratistaPendiente, Dependencia } from '@/services/admin'

const ROL_COLOR: Record<string, string> = {
  admin:       'bg-purple-100 text-purple-700',
  supervisor:  'bg-blue-100 text-blue-700',
  contratista: 'bg-gray-100 text-gray-700',
  asesor:      'bg-orange-100 text-orange-700',
  gobierno:    'bg-cyan-100 text-cyan-700',
  hacienda:    'bg-amber-100 text-amber-700',
}

function Avatar({ foto, nombre }: { foto?: string; nombre: string }) {
  const initials = nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  if (foto) {
    return (
      <img src={foto} alt={nombre} className="w-9 h-9 rounded-full object-cover ring-2 ring-white" />
    )
  }
  return (
    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 ring-2 ring-white">
      {initials}
    </div>
  )
}

// ── Activate modal ─────────────────────────────────────────────

function ActivarModal({
  contratista,
  dependencias,
  onClose,
  onDone,
}: {
  contratista: ContratistaPendiente
  dependencias: Dependencia[]
  onClose: () => void
  onDone: () => void
}) {
  const [email, setEmail] = useState(contratista.email_sugerido ?? '')
  const [cargo, setCargo] = useState(contratista.cargo)
  const [cedula, setCedula] = useState(contratista.cedula ?? '')
  const [tel, setTel]     = useState('')
  const [dir, setDir]     = useState('')
  const [rh, setRh]       = useState('')
  const [depId, setDepId] = useState('')
  const [loading, setLoading] = useState(false)

  async function handle() {
    if (!email.trim()) { toast.error('El email es requerido'); return }
    setLoading(true)
    const res = await activarContratista(contratista.id, email, {
      cargo, cedula, telefono: tel, direccion: dir, rh, dependencia_id: depId || undefined,
    })
    if (res.error) { toast.error(res.error); setLoading(false); return }
    toast.success(`Cuenta creada para ${contratista.nombre_completo}`)
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h3 className="text-base font-bold text-gray-900 mb-1">Crear cuenta de acceso</h3>
        <div className="flex items-center gap-2 mb-5">
          <span className="font-medium text-gray-800 text-sm">{contratista.nombre_completo}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            contratista.rol === 'supervisor' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {contratista.rol}
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Correo electrónico <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cédula</label>
            <input value={cedula} onChange={e => setCedula(e.target.value)}
              placeholder="Número de identificación"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cargo</label>
              <input value={cargo} onChange={e => setCargo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">RH</label>
              <select value={rh} onChange={e => setRh(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none bg-white">
                <option value="">—</option>
                {['O+','O-','A+','A-','B+','B-','AB+','AB-'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dependencia</label>
            <select value={depId} onChange={e => setDepId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none bg-white">
              <option value="">Sin dependencia</option>
              {dependencias.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
              <input value={tel} onChange={e => setTel(e.target.value)}
                placeholder="3XX XXX XXXX"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
              <input value={dir} onChange={e => setDir(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none" />
            </div>
          </div>
        </div>

        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-4">
          Contraseña temporal: <strong>Fredonia2026*</strong> — el contratista debe cambiarla al primer ingreso.
        </p>

        <div className="flex gap-3 mt-5">
          <button onClick={handle} disabled={loading}
            className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {loading ? 'Creando...' : 'Crear cuenta'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main client ────────────────────────────────────────────────

export default function AdminUsuariosClient({
  usuarios: initialUsuarios,
  pendientes: initialPendientes,
  dependencias,
}: {
  usuarios: UsuarioAdmin[]
  pendientes: ContratistaPendiente[]
  dependencias: Dependencia[]
}) {
  const [tab, setTab]           = useState<'activos' | 'pendientes'>('activos')
  const [usuarios]              = useState(initialUsuarios)
  const [pendientes, setPendientes] = useState(initialPendientes)
  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const [activando, setActivando] = useState<ContratistaPendiente | null>(null)

  const usuariosFiltrados = usuarios.filter(u => {
    const q = busqueda.toLowerCase()
    return (!q || u.nombre_completo.toLowerCase().includes(q) || (u.cedula ?? '').toLowerCase().includes(q))
      && (!filtroRol || u.rol === filtroRol)
  })

  const pendientesFiltrados = pendientes.filter(p => {
    const q = busqueda.toLowerCase()
    return !q || p.nombre_completo.toLowerCase().includes(q) || (p.cedula ?? '').toLowerCase().includes(q)
  })

  function onActivado() {
    setActivando(null)
    // Remove the activated contractor from the local list optimistically
    if (activando) {
      setPendientes(prev => prev.filter(p => p.id !== activando.id))
    }
  }

  return (
    <div className="max-w-6xl">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {usuarios.length} activos · {pendientes.length} por activar
          </p>
        </div>
        <Link
          href="/dashboard/admin/usuarios/nuevo"
          className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          + Nuevo usuario
        </Link>
      </div>

      {/* Tabs + search */}
      <div className="bg-white rounded-2xl border p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex bg-gray-100 rounded-xl p-1 text-sm">
            <button onClick={() => setTab('activos')}
              className={`px-4 py-1.5 rounded-lg font-medium transition-colors ${tab === 'activos' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              Activos ({usuarios.length})
            </button>
            <button onClick={() => setTab('pendientes')}
              className={`px-4 py-1.5 rounded-lg font-medium transition-colors ${tab === 'pendientes' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              Por activar ({pendientes.length})
            </button>
          </div>

          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o cédula..."
            className="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none"
          />

          {tab === 'activos' && (
            <select value={filtroRol} onChange={e => setFiltroRol(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-gray-900 outline-none">
              <option value="">Todos los roles</option>
              {['admin','supervisor','contratista','asesor','gobierno','hacienda'].map(r =>
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Active users table */}
      {tab === 'activos' && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          {usuariosFiltrados.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Sin resultados.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Usuario</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Cédula</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Rol</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Cargo</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Dependencia</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">RH</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usuariosFiltrados.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar foto={u.foto_url} nombre={u.nombre_completo} />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{u.nombre_completo}</p>
                          {u.telefono && <p className="text-xs text-gray-400">{u.telefono}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{formatCedula(u.cedula)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROL_COLOR[u.rol] ?? 'bg-gray-100 text-gray-600'}`}>
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{u.cargo ?? '—'}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{u.dependencia?.nombre ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      {u.rh
                        ? <span className="text-xs font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{u.rh}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/dashboard/admin/usuarios/${u.id}`}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        Editar →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pending imports */}
      {tab === 'pendientes' && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          {pendientesFiltrados.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-sm text-gray-500">Todos los contratistas han sido activados.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Nombre</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Cédula</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Secretaría</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendientesFiltrados.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-gray-900">{p.nombre_completo}</p>
                      <p className="text-xs text-gray-400">{p.cargo}</p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{formatCedula(p.cedula)}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{p.secretaria}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setActivando(p)}
                        className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 font-medium"
                      >
                        Crear cuenta →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Activate modal */}
      {activando && (
        <ActivarModal
          contratista={activando}
          dependencias={dependencias}
          onClose={() => setActivando(null)}
          onDone={onActivado}
        />
      )}
    </div>
  )
}
