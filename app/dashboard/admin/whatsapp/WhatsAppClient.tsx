'use client'

import { useEffect, useState } from 'react'
import { estadoWhatsApp, probarWhatsApp, type EstadoWhatsApp } from '@/app/actions/whatsapp-diagnostico'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

const ETIQUETA_TIPO: Record<string, string> = {
  hello_world: '1. Prueba de conexión (plantilla de Meta)',
  bienvenida: 'Bienvenida — cuenta nueva',
  enviado_confirmacion: 'Informe enviado — al contratista',
  revision: 'Informe en revisión',
  aprobado: 'Informe aprobado',
  rechazado: 'Informe devuelto',
}

/** Nombre de la plantilla en Meta, para diagnosticar un 132001 de un vistazo. */
const PLANTILLA_META: Record<string, string> = {
  bienvenida: 'bienvenida_contratista',
  enviado_confirmacion: 'informe_enviado',
  revision: 'informe_en_revision',
  aprobado: 'informe_aprobado',
  rechazado: 'informe_rechazado',
}

export default function WhatsAppClient() {
  const [estado, setEstado] = useState<EstadoWhatsApp | null>(null)
  const [errorEstado, setErrorEstado] = useState<string | null>(null)
  const [telefono, setTelefono] = useState('')
  const [tipo, setTipo] = useState('hello_world')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; detalle: string } | null>(null)

  useEffect(() => {
    estadoWhatsApp()
      .then(r => {
        if ('error' in r) setErrorEstado(r.error)
        else setEstado(r)
      })
      .catch(() => setErrorEstado('No se pudo consultar el estado del canal.'))
  }, [])

  async function enviar() {
    if (enviando || !telefono.trim()) return
    setEnviando(true)
    setResultado(null)
    try {
      setResultado(await probarWhatsApp(telefono, tipo))
    } catch {
      setResultado({ ok: false, detalle: 'Error de red al invocar la prueba.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="Diagnóstico de WhatsApp"
        subtitle="Verifica que el canal esté bien configurado antes de depender de él"
      />

      {/* Mientras la consulta viaja no había NADA en pantalla: ni cargando, ni
          resultado. Un hueco en blanco no se distingue de una página rota. */}
      {!estado && !errorEstado && (
        <Card>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm text-gray-500">Consultando el estado del canal…</p>
          </div>
        </Card>
      )}

      {errorEstado && (
        <Card>
          <div className="flex items-start gap-2">
            <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="text-sm text-red-600">{errorEstado}</p>
              <p className="text-xs text-gray-400 mt-1">
                Si dice que no estás autorizado, esta pantalla solo la puede abrir un usuario con rol de administrador.
              </p>
            </div>
          </div>
        </Card>
      )}

      {estado && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Estado del entorno</h3>
          <div className="flex items-center gap-2 mb-2">
            <Icono
              glifo={estado.configurado ? Iconos.estado.aprobado : Iconos.estado.advertencia}
              tamano="sm"
              className={estado.configurado ? 'text-emerald-600' : 'text-amber-500'}
            />
            <p className="text-sm text-gray-700">
              {estado.configurado
                ? 'Credenciales de Meta presentes en este entorno.'
                : 'El canal está apagado: faltan credenciales.'}
            </p>
          </div>

          {estado.faltantes.length > 0 && (
            <div className="mt-2 rounded-xl bg-amber-50 border border-amber-100 p-3">
              <p className="text-xs text-amber-800 mb-1">Variables de entorno que faltan:</p>
              <ul className="text-xs font-mono text-amber-900 space-y-0.5">
                {estado.faltantes.map(v => <li key={v}>· {v}</li>)}
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3">
            Plantillas disponibles: {estado.tiposDisponibles.map(t => ETIQUETA_TIPO[t] ?? t).join(' · ')}
          </p>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Enviar mensaje de prueba</h3>
        <p className="text-xs text-gray-500 mb-4">
          Recorre exactamente el mismo camino que una notificación real: misma normalización
          del número, misma plantilla y mismo cliente. Si esta prueba pasa, el envío real también.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              placeholder="3XX XXX XXXX"
              inputMode="tel"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Mientras la app esté en modo desarrollo en Meta, el número debe estar en su lista de destinatarios de prueba.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plantilla</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {(estado?.tiposDisponibles ?? ['hello_world']).map(t => (
                <option key={t} value={t}>{ETIQUETA_TIPO[t] ?? t}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {tipo === 'hello_world'
                ? 'Empieza por aquí. Usa una plantilla que Meta trae aprobada de fábrica, así que comprueba el token, el número y el destinatario sin depender de las nuestras.'
                : `Requiere que la plantilla «${PLANTILLA_META[tipo] ?? tipo}» esté APROBADA en WhatsApp Manager.`}
            </p>
          </div>

          <button
            type="button"
            onClick={enviar}
            disabled={enviando || !telefono.trim()}
            className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {enviando && (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {enviando ? 'Enviando…' : 'Enviar prueba'}
          </button>
        </div>

        {resultado && (
          <div
            role="status"
            className={`mt-4 rounded-xl p-4 border ${
              resultado.ok
                ? 'bg-emerald-50 border-emerald-100'
                : 'bg-red-50 border-red-100'
            }`}
          >
            <div className="flex items-start gap-2">
              <Icono
                glifo={resultado.ok ? Iconos.estado.aprobado : Iconos.estado.rechazado}
                tamano="sm"
                className={`shrink-0 mt-0.5 ${resultado.ok ? 'text-emerald-600' : 'text-red-500'}`}
              />
              <p className={`text-xs leading-relaxed ${resultado.ok ? 'text-emerald-800' : 'text-red-700'}`}>
                {resultado.detalle}
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
