'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUsuario } from '@/lib/user-context'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import type { Contrato } from '@/lib/types'
import { formatCedula } from '@/lib/format'
import { subirFirma } from '@/app/actions/periodos'

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

// Top stripe color per role
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

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="py-2.5 border-b border-gray-50 last:border-0">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p className="text-sm text-gray-800 font-medium">{value}</p>
    </div>
  )
}

function BankField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">
        {label}
      </p>
      {value ? (
        <p className="text-sm text-gray-800 font-semibold">{value}</p>
      ) : (
        <p className="text-sm text-gray-300 italic">No registrado</p>
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
      <div className="bg-white rounded-2xl border border-gray-100 h-32" />
      <div className="bg-white rounded-2xl border border-gray-100 h-40" />
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────

export default function PerfilPage() {
  const { usuario } = useUsuario()

  const [dependencia,      setDependencia]      = useState<string | null>(null)
  const [contratos,        setContratos]        = useState<Contrato[]>([])
  const [supervisedCount,  setSupervisedCount]  = useState<number | null>(null)
  const [asesoredCount,    setAsesoredCount]    = useState<number | null>(null)
  const [memberSince,      setMemberSince]      = useState<string | null>(null)
  const [loading,          setLoading]          = useState(true)

  // Firma upload state — local override after successful upload
  const [firmaUrl,       setFirmaUrl]       = useState<string | null>(null)
  const [subiendoFirma,  setSubiendoFirma]  = useState(false)
  const [firmaError,     setFirmaError]     = useState<string | null>(null)
  const firmaInputRef = useRef<HTMLInputElement>(null)

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

      // Role-specific data
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

  // Normalize image client-side: resize to max 600×200, remove light background, export PNG
  async function normalizarFirma(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const objUrl = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(objUrl)

        // 1. Resize — never upscale
        const MAX_W = 600, MAX_H = 200
        let w = img.naturalWidth, h = img.naturalHeight
        const ratio = Math.min(MAX_W / w, MAX_H / h, 1)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)

        // 2. Draw onto canvas (transparent background — no fillRect)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)

        // 3. Remove light background via luminance threshold
        //    Pixels with luminance > 240 → fully transparent
        //    Pixels with luminance 200–240 → linearly fade alpha (smooth edges)
        //    Pixels with luminance < 200 → keep as-is (ink strokes)
        const imageData = ctx.getImageData(0, 0, w, h)
        const data = imageData.data
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2]
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b
          if (luminance > 240) {
            data[i + 3] = 0                                         // fully transparent
          } else if (luminance > 200) {
            data[i + 3] = Math.round(((240 - luminance) / 40) * 255) // gradual fade
          }
          // else: keep original alpha (ink stroke)
        }
        ctx.putImageData(imageData, 0, 0)

        // 4. Export as PNG (preserves transparency)
        canvas.toBlob(
          (blob) => { if (blob) resolve(blob); else reject(new Error('Error al procesar imagen')) },
          'image/png', 0.95
        )
      }
      img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Imagen inválida')) }
      img.src = objUrl
    })
  }

  async function handleSubirFirma(file: File) {
    setFirmaError(null)
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED.includes(file.type)) {
      setFirmaError('Solo se permiten imágenes JPG, PNG o WEBP')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setFirmaError('El archivo no puede superar 3 MB')
      return
    }
    setSubiendoFirma(true)
    try {
      const blob = await normalizarFirma(file)
      const formData = new FormData()
      formData.append('file', new File([blob], 'firma.png', { type: 'image/png' }))
      const result = await subirFirma(formData)
      if (result.error) {
        setFirmaError(result.error)
      } else {
        setFirmaUrl(result.data?.url ?? null)
      }
    } catch {
      setFirmaError('Error al procesar la imagen')
    } finally {
      setSubiendoFirma(false)
    }
  }

  // Effective firma URL: local override takes precedence after upload
  const firmaActual = firmaUrl ?? usuario.firma_url ?? null

  const rol          = usuario.rol
  const rolLabel     = ROL_LABEL[rol]     ?? rol
  const badgeColor   = ROL_BADGE[rol]     ?? 'gray' as const
  const stripeColor  = ROL_STRIPE[rol]    ?? 'bg-gray-400'

  const now              = new Date()
  const activeContratos  = contratos.filter(c => new Date(c.fecha_fin) >= now)
  const lastContrato     = contratos[0] ?? null
  const hasBanking       = !!(lastContrato?.banco || lastContrato?.numero_cuenta)

  const tipoCuentaLabel =
    lastContrato?.tipo_cuenta === 'ahorros'   ? 'Cuenta de Ahorros' :
    lastContrato?.tipo_cuenta === 'corriente' ? 'Cuenta Corriente'  :
    lastContrato?.tipo_cuenta ?? null

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-4 md:p-8">

      {/* ── Identity Banner ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Role-colored accent stripe */}
        <div className={`h-1.5 ${stripeColor}`} />

        <div className="p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 md:gap-8">

            {/* Avatar */}
            <div className="shrink-0">
              <Avatar
                nombre={usuario.nombre_completo}
                foto={usuario.foto_url}
                size="xl"
              />
            </div>

            {/* Identity */}
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
                    <span className="font-semibold text-gray-700">{formatCedula(usuario.cedula)}</span>
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
          <Field label="Cédula"             value={formatCedula(usuario.cedula)} />
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

          {/* Supervisor — supervised count */}
          {rol === 'supervisor' && supervisedCount !== null && (
            <div className="mt-3 flex items-center gap-3 bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">
              <span className="text-2xl font-bold text-emerald-700">{supervisedCount}</span>
              <span className="text-xs text-emerald-600 leading-tight">
                contratos bajo<br />supervisión
              </span>
            </div>
          )}

          {/* Asesor — preapproval count */}
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
      {rol === 'contratista' && lastContrato && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <SectionHeading>Información bancaria</SectionHeading>
            <span className="text-[10px] text-gray-400 shrink-0 -mt-0.5">
              Del contrato {lastContrato.numero}
            </span>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3">
              <BankField label="Entidad bancaria" value={lastContrato.banco} />
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3">
              <BankField label="Tipo de cuenta" value={tipoCuentaLabel} />
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3">
              <BankField label="Número de cuenta" value={lastContrato.numero_cuenta} />
            </div>
          </div>
        </div>
      )}

      {/* ── Signature ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionHeading>Firma</SectionHeading>
          {firmaActual && (
            <button
              onClick={() => firmaInputRef.current?.click()}
              disabled={subiendoFirma}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
            >
              {subiendoFirma ? 'Subiendo...' : 'Reemplazar'}
            </button>
          )}
        </div>

        {/* Recommendation banner — shown when no firma */}
        {!firmaActual && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
            <span className="text-base shrink-0 mt-0.5">💡</span>
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>Recomendado:</strong> Registra tu firma para completar correctamente tus informes.
              La firma se adjuntará automáticamente a los documentos generados.
            </p>
          </div>
        )}

        {firmaActual ? (
          /* Firma registrada */
          <div className="flex flex-col items-start gap-3">
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 inline-block">
              <img
                src={firmaActual}
                alt="Firma del usuario"
                className="max-h-24 max-w-xs object-contain"
              />
            </div>
            <p className="text-xs text-gray-400">
              Firma registrada — se incluirá en los documentos del sistema
            </p>
          </div>
        ) : (
          /* Upload area */
          <div
            role="button"
            tabIndex={0}
            onClick={() => !subiendoFirma && firmaInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && !subiendoFirma && firmaInputRef.current?.click()}
            className={`flex flex-col sm:flex-row items-center sm:items-start gap-5 border-2 border-dashed rounded-2xl p-6 transition-colors ${
              subiendoFirma
                ? 'border-blue-200 bg-blue-50/50 cursor-wait'
                : 'border-gray-200 bg-gray-50/50 hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer'
            }`}
          >
            {/* Icon */}
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center shadow-sm">
              {subiendoFirma ? (
                <svg className="w-6 h-6 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-gray-300">
                  <path
                    d="M4 20 C6 13, 9 11, 11 15 C13 19, 11 22, 14 20 C17 18, 19 12, 22 16"
                    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none"
                  />
                  <line x1="3" y1="23" x2="25" y2="23" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">
                {subiendoFirma ? 'Procesando firma...' : 'Subir firma'}
              </p>
              <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
                {subiendoFirma
                  ? 'Eliminando fondo y guardando...'
                  : 'JPG, PNG o WEBP · máx. 3 MB. El fondo se eliminará automáticamente y la imagen se ajustará al tamaño estándar.'}
              </p>
              {!subiendoFirma && (
                <span className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
                  Seleccionar imagen
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error message */}
        {firmaError && (
          <p className="mt-2 text-xs text-red-500">{firmaError}</p>
        )}

        {/* Single hidden file input */}
        <input
          ref={firmaInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={subiendoFirma}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleSubirFirma(file)
            e.target.value = ''
          }}
        />
      </div>

    </div>
  )
}
