'use client'

import { useEffect, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'

type Canal = 'app' | 'email' | 'whatsapp'

interface Preferencia {
  canal: Canal
  habilitado: boolean
}

const CANALES: { canal: Canal; label: string; desc: string; icon: string }[] = [
  { canal: 'app', label: 'Notificaciones en la app', desc: 'Recibe notificaciones dentro de DocGov (campana de notificaciones)', icon: '🔔' },
  { canal: 'email', label: 'Correo electrónico', desc: 'Recibe notificaciones por email cuando haya cambios en tus informes', icon: '📧' },
  { canal: 'whatsapp', label: 'WhatsApp', desc: 'Recibe mensajes de WhatsApp con actualizaciones importantes', icon: '💬' },
]

const DEFAULTS: Record<Canal, boolean> = { app: true, email: true, whatsapp: false }

export default function ConfiguracionPage() {
  const [prefs, setPrefs] = useState<Record<Canal, boolean>>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Canal | null>(null)
  const [telefono, setTelefono] = useState('')
  const [telefonoOriginal, setTelefonoOriginal] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load preferences
      const { data } = await supabase
        .from('preferencias_notificacion')
        .select('canal, habilitado')
        .eq('usuario_id', user.id)

      if (data) {
        const map = { ...DEFAULTS }
        for (const p of data as Preferencia[]) {
          map[p.canal] = p.habilitado
        }
        setPrefs(map)
      }

      // Load phone
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('telefono')
        .eq('id', user.id)
        .single()

      if (usuario?.telefono) {
        setTelefono(usuario.telefono)
        setTelefonoOriginal(usuario.telefono)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function toggleCanal(canal: Canal) {
    setSaving(canal)
    const newValue = !prefs[canal]

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('preferencias_notificacion').upsert(
      { usuario_id: user.id, canal, habilitado: newValue, updated_at: new Date().toISOString() },
      { onConflict: 'usuario_id,canal' }
    )

    setPrefs(prev => ({ ...prev, [canal]: newValue }))
    setSaving(null)
  }

  async function guardarTelefono() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    startTransition(async () => {
      await supabase
        .from('usuarios')
        .update({ telefono: telefono.trim() || null })
        .eq('id', user.id)
      setTelefonoOriginal(telefono.trim())
    })
  }

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded-2xl" />
          <div className="h-32 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="Configuración"
        subtitle="Administra tus preferencias de notificaciones"
      />

      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Canales de notificación</h2>
        <div className="divide-y divide-gray-100">
          {CANALES.map(({ canal, label, desc, icon }) => (
            <div key={canal} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{icon}</span>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              </div>
              <button
                onClick={() => toggleCanal(canal)}
                disabled={saving === canal}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                  prefs[canal] ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-sm ${
                    prefs[canal] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Número de teléfono</h2>
        <p className="text-xs text-gray-500 mb-3">
          Necesario para recibir notificaciones por WhatsApp. Incluye el indicativo (ej: 3001234567).
        </p>
        <div className="flex gap-3">
          <input
            type="tel"
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="3001234567"
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={guardarTelefono}
            disabled={isPending || telefono.trim() === telefonoOriginal}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Card>
    </div>
  )
}
