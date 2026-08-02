'use client'

/**
 * Registro del estado del contrato.
 *
 * Va aparte del formulario de corrección porque no corrige un dato: deja
 * constancia de un acto administrativo. Por eso se confirma por separado y
 * exige fecha y motivo, en vez de viajar con el resto de campos al guardar.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cambiarEstadoContrato } from '@/app/actions/contratos'
import { ESTADOS_CONTRATO, metaEstado, type EstadoContrato } from '@/lib/estado-contrato'

export default function EstadoContratoPanel({
  contratoId, estadoActual, fechaEstado, motivoEstado,
}: {
  contratoId: string
  estadoActual: EstadoContrato
  fechaEstado: string | null
  motivoEstado: string | null
}) {
  const router = useRouter()
  const actual = metaEstado(estadoActual)

  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState<EstadoContrato>(estadoActual)
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const elegido = metaEstado(estado)

  async function registrar() {
    setGuardando(true)
    const res = await cambiarEstadoContrato(contratoId, estado, fecha, motivo)
    setGuardando(false)
    if (res.error) { toast.error(res.error); return }
    toast.success(`Contrato marcado como ${elegido.label.toLowerCase()}`)
    setAbierto(false)
    setMotivo('')
    router.refresh()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          Estado del contrato
        </h3>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${actual.color}`}>
          {actual.label}
        </span>
      </div>

      <p className="text-xs text-gray-500">
        {actual.ayuda}
        {fechaEstado && estadoActual !== 'vigente' && ` · ${fechaEstado}`}
      </p>
      {motivoEstado && estadoActual !== 'vigente' && (
        <p className="text-xs text-gray-500 mt-1 italic">«{motivoEstado}»</p>
      )}

      {/* El vencimiento por calendario no aparece aquí: no es un acto que
          alguien registre, se deduce de la fecha de terminación. */}

      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          Registrar cambio de estado
        </button>
      ) : (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nuevo estado</label>
              <select
                value={estado}
                onChange={e => setEstado(e.target.value as EstadoContrato)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {ESTADOS_CONTRATO.map(e => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">{elegido.ayuda}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fecha del acto</label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Motivo {estado !== 'vigente' && <span className="text-red-500">*</span>}
            </label>
            <textarea
              rows={2}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej. Acta de suspensión N.° 2 por licencia de maternidad"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={registrar}
              disabled={guardando || estado === estadoActual}
              className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              {guardando ? 'Registrando…' : 'Registrar'}
            </button>
            <button
              type="button"
              onClick={() => { setAbierto(false); setEstado(estadoActual) }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
