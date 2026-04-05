'use client'

import { useEffect, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase'
import { useUsuario } from '@/lib/user-context'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'

// ─── Types ────────────────────────────────────────────────────

type Canal = 'app' | 'email' | 'whatsapp'
const DEFAULTS: Record<Canal, boolean> = { app: true, email: true, whatsapp: false }

// ─── Display maps ─────────────────────────────────────────────

const ROL_LABEL: Record<string, string> = {
  contratista: 'Contratista',
  asesor:      'Asesor Jurídico',
  supervisor:  'Secretaría',
  admin:       'Administrador',
}

const ROL_BADGE: Record<string, 'blue' | 'indigo' | 'emerald' | 'amber'> = {
  contratista: 'blue',
  asesor:      'indigo',
  supervisor:  'emerald',
  admin:       'amber',
}

const CANALES: { canal: Canal; label: string; desc: string }[] = [
  { canal: 'app',      label: 'Notificaciones en la app',  desc: 'Campana dentro de DocGov' },
  { canal: 'email',    label: 'Correo electrónico',        desc: 'Actualizaciones de tus informes' },
  { canal: 'whatsapp', label: 'WhatsApp',                  desc: 'Mensajes con cambios importantes' },
]

// ─── Small reusable pieces ────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </p>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="py-2.5 border-b border-gray-50 last:border-0">
      <p className="text-[10.5px] text-gray-400 font-medium mb-0.5 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  )
}

function LockedRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
      <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full whitespace-nowrap">
        Próximamente
      </span>
    </div>
  )
}

function CambiarPassword() {
  const [abierto, setAbierto] = useState(false)
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mostrar, setMostrar] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (nueva.length < 8) {
      alert('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (nueva !== confirmar) {
      alert('Las contraseñas no coinciden')
      return
    }
    setGuardando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: nueva })
    setGuardando(false)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    setNueva('')
    setConfirmar('')
    setAbierto(false)
    // show inline success instead of toast (no sonner dep here)
    alert('¡Contraseña actualizada correctamente!')
  }

  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">Cambiar contraseña</p>
          <p className="text-xs text-gray-400 mt-0.5">Actualiza tus credenciales de acceso</p>
        </div>
        <button
          onClick={() => { setAbierto(!abierto); setNueva(''); setConfirmar('') }}
          className="text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          {abierto ? 'Cancelar' : 'Cambiar'}
        </button>
      </div>

      {abierto && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nueva contraseña</label>
            <div className="relative">
              <input
                type={mostrar ? 'text' : 'password'}
                value={nueva}
                onChange={e => setNueva(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                className="w-full px-3 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 focus:bg-white outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setMostrar(!mostrar)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {mostrar ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar nueva contraseña</label>
            <input
              type={mostrar ? 'text' : 'password'}
              value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
              placeholder="Repite la contraseña"
              required
              minLength={8}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 focus:bg-white outline-none transition-all"
            />
          </div>
          {nueva && confirmar && nueva !== confirmar && (
            <p className="text-xs text-red-500">Las contraseñas no coinciden</p>
          )}
          <button
            type="submit"
            disabled={guardando || nueva !== confirmar || nueva.length < 8}
            className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {guardando ? 'Guardando...' : 'Actualizar contraseña'}
          </button>
        </form>
      )}
    </div>
  )
}

function Toggle({
  on,
  onToggle,
  disabled,
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50 ${
        on ? 'bg-gray-900' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function PageSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-pulse p-4 md:p-8">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 flex gap-5">
        <div className="w-20 h-20 rounded-full bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-5 bg-gray-100 rounded w-48" />
          <div className="h-3 bg-gray-100 rounded w-28" />
          <div className="h-3 bg-gray-100 rounded w-36" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 h-52" />
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 h-40" />
          <div className="bg-white rounded-2xl border border-gray-100 h-28" />
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function PerfilPage() {
  const { usuario } = useUsuario()

  const [prefs,       setPrefs]       = useState<Record<Canal, boolean>>(DEFAULTS)
  const [savingCanal, setSavingCanal] = useState<Canal | null>(null)
  const [telefono,    setTelefono]    = useState('')
  const [telOriginal, setTelOriginal] = useState('')
  const [isPending,   startTransition] = useTransition()

  const [dependencia,  setDependencia]  = useState<string | null>(null)
  const [contratos,    setContratos]    = useState<number | null>(null)
  const [memberSince,  setMemberSince]  = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    if (!usuario) return

    async function load() {
      const supabase = createClient()

      // Load notification preferences
      const { data: prefData } = await supabase
        .from('preferencias_notificacion')
        .select('canal, habilitado')
        .eq('usuario_id', usuario!.id)

      if (prefData) {
        const map = { ...DEFAULTS }
        for (const p of prefData as { canal: Canal; habilitado: boolean }[]) {
          map[p.canal] = p.habilitado
        }
        setPrefs(map)
      }

      // Phone number
      if (usuario!.telefono) {
        setTelefono(usuario!.telefono)
        setTelOriginal(usuario!.telefono)
      }

      // Member since from auth
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser?.created_at) {
        setMemberSince(
          new Intl.DateTimeFormat('es-CO', { year: 'numeric', month: 'long' }).format(
            new Date(authUser.created_at)
          )
        )
      }

      // Dependencia name for asesor / supervisor / admin
      if (usuario!.dependencia_id) {
        const { data: dep } = await supabase
          .from('dependencias')
          .select('nombre')
          .eq('id', usuario!.dependencia_id)
          .single()
        if (dep?.nombre) setDependencia(dep.nombre)
      }

      // Active contracts count for contratistas
      if (usuario!.rol === 'contratista') {
        const { count } = await supabase
          .from('contratos')
          .select('id', { count: 'exact', head: true })
          .eq('contratista_id', usuario!.id)
        setContratos(count ?? 0)
      }

      setLoading(false)
    }

    load()
  }, [usuario])

  async function toggleCanal(canal: Canal) {
    if (!usuario) return
    setSavingCanal(canal)
    const next = !prefs[canal]
    const supabase = createClient()
    await supabase.from('preferencias_notificacion').upsert(
      { usuario_id: usuario.id, canal, habilitado: next, updated_at: new Date().toISOString() },
      { onConflict: 'usuario_id,canal' }
    )
    setPrefs(prev => ({ ...prev, [canal]: next }))
    setSavingCanal(null)
  }

  async function guardarTelefono() {
    if (!usuario) return
    const supabase = createClient()
    startTransition(async () => {
      await supabase
        .from('usuarios')
        .update({ telefono: telefono.trim() || null })
        .eq('id', usuario.id)
      setTelOriginal(telefono.trim())
    })
  }

  if (loading || !usuario) return <PageSkeleton />

  const rolLabel   = ROL_LABEL[usuario.rol]  ?? usuario.rol
  const badgeColor = ROL_BADGE[usuario.rol]  ?? 'gray'
  const docLabel   = usuario.cedula ? `CC ${usuario.cedula}` : null
  const telefonoDisplay = usuario.telefono || null

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-5">

      {/* ── Hero card ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">

          {/* Avatar */}
          <Avatar
            nombre={usuario.nombre_completo}
            foto={usuario.foto_url}
            size="xl"
          />

          {/* Identity block */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start gap-2 mb-1.5">
              <h1 className="text-xl font-bold text-gray-900 leading-snug">
                {usuario.nombre_completo}
              </h1>
              <Badge variant={badgeColor}>{rolLabel}</Badge>
            </div>
            <p className="text-sm text-gray-500">{usuario.email}</p>
            {memberSince && (
              <p className="text-xs text-gray-400 mt-1.5">
                Miembro desde {memberSince}
              </p>
            )}
          </div>

          {/* Contracts chip — desktop only */}
          {usuario.rol === 'contratista' && contratos !== null && (
            <div className="hidden sm:flex shrink-0 flex-col items-center justify-center bg-blue-50 rounded-2xl px-6 py-4 border border-blue-100">
              <span className="text-3xl font-bold text-blue-700 leading-none">{contratos}</span>
              <span className="text-xs text-blue-500 mt-1">
                {contratos === 1 ? 'contrato' : 'contratos'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Two-column grid ───────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5">

        {/* ── Left: Personal information ─────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <SectionLabel>Información personal</SectionLabel>

          <InfoRow label="Nombre completo"    value={usuario.nombre_completo} />
          <InfoRow label="Documento"          value={docLabel} />
          <InfoRow label="Correo electrónico" value={usuario.email} />
          <InfoRow label="Teléfono"           value={telefonoDisplay} />
          <InfoRow label="Cargo"              value={usuario.cargo ?? null} />
          <InfoRow label="Dependencia"        value={dependencia} />
          <InfoRow label="Dirección"          value={usuario.direccion ?? null} />

          {/* Mobile: contracts chip */}
          {usuario.rol === 'contratista' && contratos !== null && (
            <div className="sm:hidden flex items-center gap-3 mt-4 bg-blue-50 rounded-xl px-4 py-3 border border-blue-100">
              <span className="text-2xl font-bold text-blue-700">{contratos}</span>
              <span className="text-xs text-blue-500">
                {contratos === 1 ? 'contrato activo' : 'contratos activos'}
              </span>
            </div>
          )}
        </div>

        {/* ── Right: Settings stack ──────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* Notifications card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SectionLabel>Notificaciones</SectionLabel>

            {CANALES.map(({ canal, label, desc }) => (
              <div
                key={canal}
                className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0"
              >
                <div className="pr-4 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
                <Toggle
                  on={prefs[canal]}
                  onToggle={() => toggleCanal(canal)}
                  disabled={savingCanal === canal}
                />
              </div>
            ))}

            {/* WhatsApp phone — only shown when WhatsApp is enabled */}
            {prefs.whatsapp && (
              <div className="mt-4 pt-4 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-2">
                  Número para WhatsApp (ej: 3001234567)
                </p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={telefono}
                    onChange={e => setTelefono(e.target.value)}
                    placeholder="3001234567"
                    className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                  <button
                    onClick={guardarTelefono}
                    disabled={isPending || telefono.trim() === telOriginal}
                    className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPending ? '...' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Account card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SectionLabel>Cuenta</SectionLabel>
            <LockedRow
              label="Foto de perfil"
              desc="Sube una imagen para personalizar tu cuenta"
            />
            <CambiarPassword />
          </div>

        </div>
      </div>
    </div>
  )
}
