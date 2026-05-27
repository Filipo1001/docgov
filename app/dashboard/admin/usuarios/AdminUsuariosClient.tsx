'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { activarContratista, eliminarUsuario } from '@/app/actions/admin'
import { formatCedula } from '@/lib/format'
import type { UsuarioAdmin, ContratistaPendiente, Dependencia } from '@/services/admin'

/** Normaliza tildes y mayúsculas para búsqueda tolerante */
function norm(s: string) {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

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
  const [depId, setDepId] = useState('')
  const [loading, setLoading] = useState(false)
  const [passwordRevelado, setPasswordRevelado] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function handle() {
    if (!email.trim()) { toast.error('El email es requerido'); return }
    setLoading(true)
    const res = await activarContratista(contratista.id, email, {
      cargo, cedula, telefono: tel, direccion: dir, dependencia_id: depId || undefined,
    })
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    setPasswordRevelado(res.data!.passwordInicial)
  }

  function copiarPassword() {
    if (!passwordRevelado) return
    navigator.clipboard.writeText(passwordRevelado).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    })
  }

  // ── Step 2: show generated password ────────────────────────────
  if (passwordRevelado) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-xl">✅</div>
            <div>
              <p className="font-semibold text-gray-900">Cuenta creada</p>
              <p className="text-sm text-gray-500">{contratista.nombre_completo}</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
              Contraseña temporal generada
            </p>
            <div className="flex items-center gap-3 bg-white border border-amber-200 rounded-lg px-3 py-2.5">
              <code className="flex-1 text-lg font-mono font-bold text-gray-900 tracking-widest select-all">
                {passwordRevelado}
              </code>
              <button
                onClick={copiarPassword}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  copiado
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {copiado ? '✓ Copiada' : 'Copiar'}
              </button>
            </div>
            <p className="text-xs text-amber-600 mt-2.5">
              Comparte esta contraseña de forma segura con el usuario. Puede cambiarla desde su perfil.
            </p>
          </div>

          <button
            onClick={onDone}
            className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    )
  }

  // ── Step 1: form ────────────────────────────────────────────────
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
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cédula</label>
            <input value={cedula} onChange={e => setCedula(e.target.value)}
              placeholder="Número de identificación"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 placeholder-gray-400" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cargo</label>
            <input value={cargo} onChange={e => setCargo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 placeholder-gray-400" />
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
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 placeholder-gray-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
              <input value={dir} onChange={e => setDir(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 placeholder-gray-400" />
            </div>
          </div>
        </div>

        <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 mt-4">
          Se generará una <strong>contraseña temporal segura</strong> que podrás copiar y compartir con el usuario.
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

// ── Delete modal ───────────────────────────────────────────────

function EliminarUsuarioModal({
  usuario,
  onClose,
  onDone,
}: {
  usuario: UsuarioAdmin
  onClose: () => void
  onDone: (id: string) => void
}) {
  const [opcion, setOpcion] = useState<'solo' | 'con_contrato' | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const [procesando, setProcesando] = useState(false)

  const contratos = usuario.contratos ?? []
  const tieneContrato = contratos.length > 0

  async function handleEliminar() {
    if (!opcion || !confirmado) return
    setProcesando(true)
    const result = await eliminarUsuario(usuario.id, opcion === 'con_contrato')
    setProcesando(false)
    if (result.error) { toast.error(result.error); return }
    toast.success('Usuario eliminado correctamente')
    onDone(usuario.id)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">

        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-lg shrink-0">🗑️</div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">Eliminar usuario</h3>
            <p className="text-sm text-gray-500 mt-0.5">{usuario.nombre_completo}</p>
          </div>
        </div>

        {/* Warning banner */}
        <div className="flex gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 mb-5">
          <span className="text-red-500 text-sm shrink-0 mt-0.5">⚠️</span>
          <p className="text-xs text-red-700 leading-relaxed">
            Esta acción es <strong>irreversible</strong>. El usuario perderá el acceso al sistema de inmediato.
          </p>
        </div>

        {/* Options */}
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
          ¿Qué deseas eliminar?
        </p>

        <div className="space-y-2.5 mb-5">

          {/* Opción 1: Solo usuario */}
          <button
            onClick={() => { setOpcion('solo'); setConfirmado(false) }}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              opcion === 'solo'
                ? 'border-gray-900 bg-gray-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
                opcion === 'solo' ? 'border-gray-900' : 'border-gray-300'
              }`}>
                {opcion === 'solo' && <div className="w-2 h-2 rounded-full bg-gray-900" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Solo eliminar usuario</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {tieneContrato
                    ? <>El contrato {contratos.map(c => <strong key={c.id}>N.° {c.numero}</strong>).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [])} permanece en el sistema sin contratista vinculado.</>
                    : 'Este usuario no tiene contrato vinculado. Solo se eliminará su cuenta.'}
                </p>
              </div>
            </div>
          </button>

          {/* Opción 2: Usuario + contrato */}
          <button
            onClick={() => { if (!tieneContrato) return; setOpcion('con_contrato'); setConfirmado(false) }}
            disabled={!tieneContrato}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              !tieneContrato
                ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                : opcion === 'con_contrato'
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 hover:border-red-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
                opcion === 'con_contrato' ? 'border-red-500' : 'border-gray-300'
              }`}>
                {opcion === 'con_contrato' && <div className="w-2 h-2 rounded-full bg-red-500" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Eliminar usuario y contrato vinculado
                </p>
                {tieneContrato ? (
                  <p className="text-xs text-red-600 mt-1 leading-relaxed">
                    Se eliminarán {contratos.map(c => <strong key={c.id}>Contrato N.° {c.numero}</strong>).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ' y ', el], [])}, incluyendo todos sus periodos, actividades y evidencias.
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    Este usuario no tiene contrato vinculado — opción no disponible.
                  </p>
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Confirmación */}
        {opcion && (
          <label className="flex items-start gap-2.5 mb-5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={e => setConfirmado(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-gray-900 shrink-0"
            />
            <span className="text-xs text-gray-600 leading-relaxed">
              Entiendo que esta acción es <strong>irreversible</strong> y confirmo que deseo continuar con la eliminación.
            </span>
          </label>
        )}

        {/* Botones */}
        <div className="flex gap-3">
          <button
            onClick={handleEliminar}
            disabled={!opcion || !confirmado || procesando}
            className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {procesando ? 'Eliminando...' : 'Confirmar eliminación'}
          </button>
          <button
            onClick={onClose}
            disabled={procesando}
            className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
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
  const [usuarios, setUsuarios] = useState(initialUsuarios)
  const [pendientes, setPendientes] = useState(initialPendientes)
  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const [activando, setActivando] = useState<ContratistaPendiente | null>(null)
  const [eliminando, setEliminando] = useState<UsuarioAdmin | null>(null)

  const usuariosFiltrados = usuarios.filter(u => {
    const q = norm(busqueda)
    return (!q || norm(u.nombre_completo).includes(q) || norm(u.cedula ?? '').includes(q))
      && (!filtroRol || u.rol === filtroRol)
  })

  const pendientesFiltrados = pendientes.filter(p => {
    const q = norm(busqueda)
    return !q || norm(p.nombre_completo).includes(q) || norm(p.cedula ?? '').includes(q)
  })

  function onActivado() {
    setActivando(null)
    if (activando) {
      setPendientes(prev => prev.filter(p => p.id !== activando.id))
    }
  }

  function onEliminado(id: string) {
    setEliminando(null)
    setUsuarios(prev => prev.filter(u => u.id !== id))
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
            className="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 placeholder-gray-400"
          />

          {tab === 'activos' && (
            <select value={filtroRol} onChange={e => setFiltroRol(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 placeholder-gray-400">
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
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/dashboard/admin/usuarios/${u.id}`}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          Editar →
                        </Link>
                        <button
                          onClick={() => setEliminando(u)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
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

      {/* Delete modal */}
      {eliminando && (
        <EliminarUsuarioModal
          usuario={eliminando}
          onClose={() => setEliminando(null)}
          onDone={onEliminado}
        />
      )}
    </div>
  )
}
