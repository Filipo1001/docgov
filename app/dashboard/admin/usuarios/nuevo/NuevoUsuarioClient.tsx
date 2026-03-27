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
const GRUPOS_RH = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export default function NuevoUsuarioClient({ dependencias }: { dependencias: Dependencia[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [email, setEmail]         = useState('')
  const [nombre, setNombre]       = useState('')
  const [tipoDoc, setTipoDoc]     = useState('CC')
  const [cedula, setCedula]       = useState('')
  const [rol, setRol]             = useState('contratista')
  const [cargo, setCargo]         = useState('')
  const [telefono, setTelefono]   = useState('')
  const [direccion, setDireccion] = useState('')
  const [rh, setRh]               = useState('')
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
      rh,
      dependencia_id: depId || undefined,
    })
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Usuario creado. Contraseña temporal: Fredonia2026*')
      setTimeout(() => router.push('/dashboard/admin/usuarios'), 1500)
    }
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@fredonia.gov.co"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={rol}
              onChange={e => setRol(e.target.value)}
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Contraseña temporal:</span> Fredonia2026* — el usuario
            podrá cambiarla al iniciar sesión.
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Apellidos y nombres"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de documento</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={cedula}
                onChange={e => setCedula(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grupo sanguíneo (RH)</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={rh}
                onChange={e => setRh(e.target.value)}
              >
                <option value="">— Sin especificar —</option>
                {GRUPOS_RH.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Cargo y dependencia */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Cargo y dependencia</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={cargo}
              onChange={e => setCargo(e.target.value)}
              placeholder="Ej. Contratista de prestación de servicios"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dependencia</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={telefono}
                onChange={e => setTelefono(e.target.value)}
                placeholder="3XX XXX XXXX"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
