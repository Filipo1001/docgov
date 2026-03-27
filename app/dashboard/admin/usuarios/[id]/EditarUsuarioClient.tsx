'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { actualizarUsuario, subirFotoUsuario } from '@/app/actions/admin'
import type { UsuarioAdmin, Dependencia } from '@/services/admin'

const ROLES     = ['admin', 'supervisor', 'contratista', 'asesor', 'gobierno', 'hacienda']
const TIPOS_DOC = ['CC', 'CE', 'NIT', 'PAS']
const GRUPOS_RH = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

function Avatar({ foto, nombre, size = 'xl' }: { foto?: string; nombre: string; size?: 'xl' | 'lg' }) {
  const initials = nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const cls = size === 'xl'
    ? 'w-24 h-24 rounded-full object-cover ring-4 ring-white shadow-md'
    : 'w-16 h-16 rounded-full object-cover ring-2 ring-white shadow'
  const fallback = size === 'xl'
    ? 'w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-500 ring-4 ring-white shadow-md'
    : 'w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-gray-500 ring-2 ring-white shadow'
  if (foto) return <img src={foto} alt={nombre} className={cls} />
  return <div className={fallback}>{initials}</div>
}

export default function EditarUsuarioClient({
  usuario,
  dependencias,
}: {
  usuario: UsuarioAdmin
  dependencias: Dependencia[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fotoUrl, setFotoUrl]     = useState(usuario.foto_url)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)

  const [nombre, setNombre]       = useState(usuario.nombre_completo)
  const [cedula, setCedula]       = useState(usuario.cedula)
  const [tipoDoc, setTipoDoc]     = useState(usuario.tipo_documento ?? 'CC')
  const [rol, setRol]             = useState(usuario.rol)
  const [cargo, setCargo]         = useState(usuario.cargo ?? '')
  const [telefono, setTelefono]   = useState(usuario.telefono ?? '')
  const [direccion, setDireccion] = useState(usuario.direccion ?? '')
  const [rh, setRh]               = useState(usuario.rh ?? '')
  const [depId, setDepId]         = useState(usuario.dependencia_id ?? '')

  async function handleSave() {
    if (!nombre.trim() || !cedula.trim()) {
      toast.error('Nombre y cédula son obligatorios')
      return
    }
    setSaving(true)
    const result = await actualizarUsuario(usuario.id, {
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
    setSaving(false)
    if (result.error) toast.error(result.error)
    else toast.success('Usuario actualizado')
  }

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const result = await subirFotoUsuario(usuario.id, fd)
    setUploading(false)
    if (result.error) toast.error(result.error)
    else if (result.data) { setFotoUrl(result.data.url); toast.success('Foto actualizada') }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <Toaster richColors />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/admin/usuarios" className="hover:text-emerald-600">Usuarios</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{nombre}</span>
      </nav>

      {/* Photo card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-6">
        <div className="relative">
          <Avatar foto={fotoUrl} nombre={nombre} />
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
              <span className="text-white text-xs">…</span>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-gray-900">{nombre}</p>
          <p className="text-sm text-gray-500 capitalize">{rol}</p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50"
          >
            {uploading ? 'Subiendo…' : 'Cambiar foto'}
          </button>
          <p className="text-xs text-gray-400">JPEG, PNG, WEBP o HEIC · máx 5 MB</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={handleFotoChange}
          />
        </div>
      </div>

      {/* Personal info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={rol}
              onChange={e => setRol(e.target.value as typeof rol)}
            >
              {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
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

        <hr className="border-gray-100" />
        <h2 className="text-base font-semibold text-gray-900">Cargo y dependencia</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={cargo}
              onChange={e => setCargo(e.target.value)}
              placeholder="Ej. Contratista de prestación de servicios"
            />
          </div>

          <div className="sm:col-span-2">
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

        <hr className="border-gray-100" />
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

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/dashboard/admin/usuarios"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            Cancelar
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
