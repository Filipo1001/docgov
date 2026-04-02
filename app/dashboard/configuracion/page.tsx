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
            <LockedRow
              label="Cambiar contraseña"
              desc="Actualiza tus credenciales de acceso"
            />
          </div>

        </div>
      </div>
    </div>
  )
}
