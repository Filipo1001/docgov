'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { crearUsuario } from '@/app/actions/admin'
import type { Dependencia } from '@/services/admin'

const ROLES = [
  { value: 'contratista', label: 'Contratista' },
  { value: 'supervisor',  label: 'Supervisor' },
  { value: 'asesor',      label: 'Asesor jurídico' },
  { value: 'gobierno',    label: 'Gobierno' },
  { value: 'hacienda',    label: 'Hacienda' },
  { value: 'admin',       label: 'Administrador' },
]
const TIPOS_DOC = ['CC', 'CE', 'NIT', 'PAS']

export default function NuevoUsuarioClient({ dependencias }: { dependencias: Dependencia[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [passwordCreado, setPasswordCreado] = useState<string | null>(null)
  const [nombreCreado, setNombreCreado] = useState('')
  const [copiado, setCopiado] = useState(false)

  const [email, setEmail]         = useState('')
  const [nombre, setNombre]       = useState('')
  const [tipoDoc, setTipoDoc]     = useState('CC')
  const [cedula, setCedula]       = useState('')
  const [rol, setRol]             = useState('contratista')
  const [cargo, setCargo]         = useState('')
  const [telefono, setTelefono]   = useState('')
  const [direccion, setDireccion] = useState('')
  const [depId, setDepId]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !nombre.trim() || !cedula.trim()) {
      toast.error('Email, nombre y documento son obligatorios')
      return
    }
    setLoading(true)
    const result = await crearUsuario({
      email,
      nombre_completo: nombre,
      cedula,
      tipo_documento: tipoDoc,
      rol,
      cargo,
      telefono,
      direccion,
      dependencia_id: depId || undefined,
    })
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      setNombreCreado(nombre)
      setPasswordCreado(result.data!.passwordInicial)
    }
  }

  function copiarPassword() {
    if (!passwordCreado) return
    navigator.clipboard.writeText(passwordCreado).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    })
  }

  // ── Success screen: show generated password ────────────────────
  if (passwordCreado) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Toaster richColors />
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-2xl mx-auto mb-4">✅</div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Usuario creado</h2>
          <p className="text-sm text-gray-500 mb-6">{nombreCreado}</p>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 text-left">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
              Contraseña temporal generada
            </p>
            <div className="flex items-center gap-3 bg-white border border-amber-200 rounded-lg px-3 py-3">
              <code className="flex-1 text-xl font-mono font-bold text-gray-900 tracking-widest select-all">
                {passwordCreado}
              </code>
              <button
                type="button"
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
            <p className="text-xs text-amber-600 mt-3">
              Comparte esta contraseña de forma segura con el usuario. Puede cambiarla desde su perfil.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/dashboard/admin/usuarios')}
            className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Ir a usuarios →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <Toaster richColors />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/admin/usuarios" className="hover:text-emerald-600">Usuarios</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Nuevo usuario</span>
      </nav>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Acceso */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Acceso al sistema</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo electrónico <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@fredonia.gov.co"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={rol}
              onChange={e => setRol(e.target.value)}
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
            Se generará una <span className="font-semibold">contraseña temporal segura</span> que podrás copiar y compartir con el usuario.
          </div>
        </div>

        {/* Datos personales */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Información personal</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre completo <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Apellidos y nombres"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de documento</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={tipoDoc}
                onChange={e => setTipoDoc(e.target.value)}
              >
                {TIPOS_DOC.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número de documento <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={cedula}
                onChange={e => setCedula(e.target.value)}
                required
              />
            </div>

          </div>
        </div>

        {/* Cargo y dependencia */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Cargo y dependencia</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={cargo}
              onChange={e => setCargo(e.target.value)}
              placeholder="Ej. Contratista de prestación de servicios"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dependencia</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={depId}
              onChange={e => setDepId(e.target.value)}
            >
              <option value="">— Sin dependencia —</option>
              {dependencias.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
        </div>

        {/* Contacto */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Contacto</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono / Celular</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={telefono}
                onChange={e => setTelefono(e.target.value)}
                placeholder="3XX XXX XXXX"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={direccion}
                onChange={e => setDireccion(e.target.value)}
                placeholder="Calle XX # XX-XX"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/dashboard/admin/usuarios"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-60"
          >
            {loading ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </div>
  )
}
