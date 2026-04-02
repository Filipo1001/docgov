'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUsuario } from '@/lib/user-context'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import type { Contrato } from '@/lib/types'

// ─── Display maps ──────────────────────────────────────────────

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

const ROL_STRIPE: Record<string, string> = {
  contratista: 'bg-blue-500',
  asesor:      'bg-indigo-500',
  supervisor:  'bg-emerald-500',
  admin:       'bg-amber-500',
}

// ─── Utilities ─────────────────────────────────────────────────

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso + 'T12:00:00'))
}

// ─── Micro components ──────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.1em] mb-3">
      {children}
    </p>
  )
}

/** Standard info field — shows placeholder when empty */
function Field({
  label,
  value,
  placeholder = 'No registrado',
}: {
  label: string
  value?: string | null
  placeholder?: string
}) {
  return (
    <div className="py-2.5 border-b border-gray-50 last:border-0">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">
        {label}
      </p>
      {value ? (
        <p className="text-sm text-gray-800 font-medium">{value}</p>
      ) : (
        <p className="text-sm text-gray-300 italic">{placeholder}</p>
      )}
    </div>
  )
}

/** Banking field tile — always renders, placeholder when empty */
function BankTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value?: string | null
}) {
  return (
    <div className="flex flex-col gap-2 bg-gray-50 rounded-xl border border-gray-100 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">{icon}</span>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
          {label}
        </p>
      </div>
      {value ? (
        <p className="text-sm font-semibold text-gray-800 leading-snug">{value}</p>
      ) : (
        <p className="text-sm text-gray-300 italic font-normal">No registrado</p>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse max-w-4xl mx-auto space-y-5 p-4 md:p-8">
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="h-1.5 bg-gray-100" />
        <div className="p-6 md:p-8 flex gap-6">
          <div className="w-20 h-20 rounded-full bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-2.5 pt-1">
            <div className="h-6 bg-gray-100 rounded w-56" />
            <div className="h-4 bg-gray-100 rounded w-20" />
            <div className="h-3 bg-gray-100 rounded w-40 mt-3" />
            <div className="h-3 bg-gray-100 rounded w-32" />
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 h-64" />
        <div className="bg-white rounded-2xl border border-gray-100 h-64" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 h-44" />
      <div className="bg-white rounded-2xl border border-gray-100 h-40" />
    </div>
  )
}

// ─── SVG icons ─────────────────────────────────────────────────

function IconBank() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 10h18M5 10V6l7-3 7 3v4M9 21v-5a3 3 0 016 0v5" />
    </svg>
  )
}

function IconCard() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <rect x="2" y="5" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 10h20" />
    </svg>
  )
}

function IconHash() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />
    </svg>
  )
}

// ─── Page ──────────────────────────────────────────────────────

export default function PerfilPage() {
  const { usuario } = useUsuario()

  const [dependencia,     setDependencia]     = useState<string | null>(null)
  const [contratos,       setContratos]       = useState<Contrato[]>([])
  const [supervisedCount, setSupervisedCount] = useState<number | null>(null)
  const [asesoredCount,   setAsesoredCount]   = useState<number | null>(null)
  const [memberSince,     setMemberSince]     = useState<string | null>(null)
  const [loading,         setLoading]         = useState(true)

  useEffect(() => {
    if (!usuario) return

    async function load() {
      const supabase = createClient()

      // Member since — from auth
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser?.created_at) {
        setMemberSince(
          new Intl.DateTimeFormat('es-CO', { year: 'numeric', month: 'long' }).format(
            new Date(authUser.created_at)
          )
        )
      }

      // Dependencia name
      if (usuario!.dependencia_id) {
        const { data: dep } = await supabase
          .from('dependencias')
          .select('nombre')
          .eq('id', usuario!.dependencia_id)
          .single()
        if (dep?.nombre) setDependencia(dep.nombre)
      }

      const rol = usuario!.rol

      if (rol === 'contratista') {
        const { data } = await supabase
          .from('contratos')
          .select('id, numero, objeto, valor_total, fecha_inicio, fecha_fin, banco, tipo_cuenta, numero_cuenta')
          .eq('contratista_id', usuario!.id)
          .order('created_at', { ascending: false })
        setContratos((data ?? []) as Contrato[])
      }

      if (rol === 'supervisor') {
        const { count } = await supabase
          .from('contratos')
          .select('id', { count: 'exact', head: true })
          .eq('supervisor_id', usuario!.id)
        setSupervisedCount(count ?? 0)
      }

      if (rol === 'asesor') {
        const { count } = await supabase
          .from('preaprobaciones')
          .select('id', { count: 'exact', head: true })
          .eq('asesor_id', usuario!.id)
        setAsesoredCount(count ?? 0)
      }

      setLoading(false)
    }

    load()
  }, [usuario])

  if (loading || !usuario) return <Skeleton />

  const rol         = usuario.rol
  const rolLabel    = ROL_LABEL[rol]  ?? rol
  const badgeColor  = ROL_BADGE[rol]  ?? 'gray' as const
  const stripeColor = ROL_STRIPE[rol] ?? 'bg-gray-400'

  const now             = new Date()
  const activeContratos = contratos.filter(c => new Date(c.fecha_fin) >= now)
  const lastContrato    = contratos[0] ?? null

  const tipoCuentaLabel =
    lastContrato?.tipo_cuenta === 'ahorros'   ? 'Cuenta de Ahorros' :
    lastContrato?.tipo_cuenta === 'corriente' ? 'Cuenta Corriente'  :
    lastContrato?.tipo_cuenta ?? null

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-4 md:p-8">

      {/* ── Identity Banner ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className={`h-1.5 ${stripeColor}`} />

        <div className="p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 md:gap-8">

            <div className="shrink-0">
              <Avatar
                nombre={usuario.nombre_completo}
                foto={usuario.foto_url}
                size="xl"
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5 mb-2">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight leading-tight">
                  {usuario.nombre_completo}
                </h1>
                <Badge variant={badgeColor}>{rolLabel}</Badge>
              </div>

              <div className="space-y-1">
                {usuario.cedula && (
                  <p className="text-sm text-gray-600">
                    <span className="text-gray-400">CC </span>
                    <span className="font-semibold text-gray-700">{usuario.cedula}</span>
                  </p>
                )}
                <p className="text-sm text-gray-500">{usuario.email}</p>
                {memberSince && (
                  <p className="text-xs text-gray-400 pt-0.5">
                    Miembro desde {memberSince}
                  </p>
                )}
              </div>
            </div>

            {/* Stat chip — contratista */}
            {rol === 'contratista' && contratos.length > 0 && (
              <div className="hidden sm:flex shrink-0 flex-col items-center justify-center rounded-2xl px-6 py-4 bg-blue-50 border border-blue-100 min-w-[96px]">
                <span className="text-3xl font-bold text-blue-700 leading-none">
                  {activeContratos.length}
                </span>
                <span className="text-xs text-blue-500 mt-1 text-center leading-tight">
                  {activeContratos.length === 1 ? 'contrato\nvigente' : 'contratos\nvigentes'}
                </span>
              </div>
            )}

            {/* Stat chip — supervisor */}
            {rol === 'supervisor' && supervisedCount !== null && (
              <div className="hidden sm:flex shrink-0 flex-col items-center justify-center rounded-2xl px-6 py-4 bg-emerald-50 border border-emerald-100 min-w-[96px]">
                <span className="text-3xl font-bold text-emerald-700 leading-none">
                  {supervisedCount}
                </span>
                <span className="text-xs text-emerald-600 mt-1 text-center leading-tight">
                  contratos<br />supervisados
                </span>
              </div>
            )}

            {/* Stat chip — asesor */}
            {rol === 'asesor' && asesoredCount !== null && (
              <div className="hidden sm:flex shrink-0 flex-col items-center justify-center rounded-2xl px-6 py-4 bg-indigo-50 border border-indigo-100 min-w-[96px]">
                <span className="text-3xl font-bold text-indigo-700 leading-none">
                  {asesoredCount}
                </span>
                <span className="text-xs text-indigo-600 mt-1 text-center leading-tight">
                  preaprobaciones<br />realizadas
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-column info grid ─────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5">

        {/* Personal Information */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <SectionHeading>Información personal</SectionHeading>
          <Field label="Nombre completo"    value={usuario.nombre_completo} />
          <Field label="Cédula"             value={usuario.cedula} />
          <Field label="Correo electrónico" value={usuario.email} />
          <Field label="Teléfono"           value={usuario.telefono} />
          <Field label="Dirección"          value={usuario.direccion} />
        </div>

        {/* Professional Information — role-aware */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <SectionHeading>Información profesional</SectionHeading>
          <Field label="Rol"         value={rolLabel} />
          <Field label="Cargo"       value={usuario.cargo} />
          <Field label="Dependencia" value={dependencia} />

          {/* Contratista — list of contracts */}
          {rol === 'contratista' && contratos.length > 0 && (
            <div className="mt-3 space-y-2">
              {contratos.slice(0, 3).map(c => {
                const vigente = new Date(c.fecha_fin) >= now
                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-gray-100 p-3 bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-700">
                        Contrato {c.numero}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          vigente
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {vigente ? 'Vigente' : 'Finalizado'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-snug line-clamp-2 mb-1.5">
                      {c.objeto}
                    </p>
                    <p className="text-xs text-gray-500 font-medium">
                      {COP.format(c.valor_total)}
                      <span className="text-gray-300 mx-1.5">·</span>
                      {fmtDate(c.fecha_inicio)} – {fmtDate(c.fecha_fin)}
                    </p>
                  </div>
                )
              })}

              {/* Mobile contracts chip */}
              <div className="sm:hidden flex items-center gap-3 bg-blue-50 rounded-xl px-4 py-3 border border-blue-100 mt-1">
                <span className="text-2xl font-bold text-blue-700">{activeContratos.length}</span>
                <span className="text-xs text-blue-500">
                  {activeContratos.length === 1 ? 'contrato vigente' : 'contratos vigentes'}
                </span>
              </div>
            </div>
          )}

          {/* Supervisor */}
          {rol === 'supervisor' && supervisedCount !== null && (
            <div className="mt-3 flex items-center gap-3 bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">
              <span className="text-2xl font-bold text-emerald-700">{supervisedCount}</span>
              <span className="text-xs text-emerald-600 leading-tight">
                contratos bajo<br />supervisión
              </span>
            </div>
          )}

          {/* Asesor */}
          {rol === 'asesor' && asesoredCount !== null && (
            <div className="mt-3 flex items-center gap-3 bg-indigo-50 rounded-xl px-4 py-3 border border-indigo-100">
              <span className="text-2xl font-bold text-indigo-700">{asesoredCount}</span>
              <span className="text-xs text-indigo-600 leading-tight">
                preaprobaciones<br />realizadas
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Banking Information — contratista only ───────────────── */}
      {rol === 'contratista' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">

          {/* Section header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {/* Bank icon */}
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 10h18M5 10V6l7-3 7 3v4M9 21v-5a3 3 0 016 0v5" />
                </svg>
              </div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.1em]">
                Información bancaria
              </p>
            </div>

            {/* Source reference + future edit hook */}
            <div className="flex items-center gap-2">
              {lastContrato && (
                <span className="text-[10px] text-gray-400">
                  Del contrato {lastContrato.numero}
                </span>
              )}
              <button
                disabled
                title="Edición disponible próximamente"
                className="flex items-center gap-1 text-[10px] font-medium text-gray-300 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-lg cursor-not-allowed select-none"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Editar
              </button>
            </div>
          </div>

          {/* Three tiles — always shown, placeholder when empty */}
          <div className="grid sm:grid-cols-3 gap-3">
            <BankTile
              icon={<IconBank />}
              label="Entidad bancaria"
              value={lastContrato?.banco}
            />
            <BankTile
              icon={<IconCard />}
              label="Tipo de cuenta"
              value={tipoCuentaLabel}
            />
            <BankTile
              icon={<IconHash />}
              label="Número de cuenta"
              value={lastContrato?.numero_cuenta}
            />
          </div>

          {/* Info note when data is missing */}
          {!lastContrato && (
            <p className="text-xs text-gray-400 mt-3 text-center">
              Los datos bancarios se registran al momento de crear tu contrato.
            </p>
          )}
        </div>
      )}

      {/* ── Signature ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <SectionHeading>Firma</SectionHeading>

        {usuario.firma_url ? (
          <div className="flex flex-col items-start gap-3">
            <div className="inline-block border border-gray-200 rounded-xl p-4 bg-gray-50">
              <img
                src={usuario.firma_url}
                alt="Firma del usuario"
                className="max-h-24 max-w-xs object-contain"
              />
            </div>
            <p className="text-xs text-gray-400">Firma registrada</p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 border-2 border-dashed border-gray-200 rounded-2xl p-6 bg-gray-50/50">
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center shadow-sm">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-gray-300">
                <path
                  d="M4 20 C6 13, 9 11, 11 15 C13 19, 11 22, 14 20 C17 18, 19 12, 22 16"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <line x1="3" y1="23" x2="25" y2="23" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">
                Sin firma registrada
              </p>
              <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
                La carga de firma digital estará disponible próximamente. Esta
                funcionalidad permitirá firmar documentos directamente desde el
                sistema sin necesidad de imprimirlos.
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 bg-white border border-gray-200 px-3 py-1.5 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                Próximamente
              </span>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
