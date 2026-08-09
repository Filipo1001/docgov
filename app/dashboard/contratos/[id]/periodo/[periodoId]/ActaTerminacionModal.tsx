'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { aceptarActaTerminacion } from '@/app/actions/actas-terminacion'

export interface ActaPrefill {
  contrato: string
  objeto: string
  fechaTerminacion: string
  supervisor: string
  municipio: string
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** 'YYYY-MM-DD' → "30 de noviembre de 2026", sin cruzar husos horarios. */
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}

/**
 * Modal obligatorio del Acta de Terminación, previo al envío del ÚLTIMO
 * informe del contrato. Espejo del de la certificación de retención, que se
 * pide antes del primero.
 *
 * A diferencia de aquel, aquí no se pregunta nada: todos los datos ya están en
 * el sistema. Lo único que aporta el contratista es su consentimiento. Por eso
 * el cuerpo del modal es sobre todo un resumen de lo que va a firmar — es un
 * acto jurídico que lo libera de obligaciones y libera al municipio, y merece
 * leerse antes de aceptarlo.
 */
export default function ActaTerminacionModal({
  abierto,
  periodoId,
  prefill,
  faltaFirma,
  onCerrar,
  onAceptada,
}: {
  abierto: boolean
  periodoId: string
  prefill: ActaPrefill | null
  faltaFirma: boolean
  onCerrar: () => void
  onAceptada: () => void
}) {
  const [aceptado, setAceptado] = useState(false)
  const [procesando, setProcesando] = useState(false)

  if (!abierto || !prefill) return null

  async function aceptar() {
    if (!aceptado || procesando) return
    setProcesando(true)
    const result = await aceptarActaTerminacion(periodoId)
    if (result.error) {
      toast.error(result.error)
      setProcesando(false)
      return
    }
    toast.success('Acta de terminación aceptada y generada')
    onAceptada()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[92vh]">
        {/* Encabezado */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m-9 9h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900">Acta de Terminación del contrato</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Este es el último informe del contrato {prefill.contrato}
              </p>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="px-6 py-4 overflow-y-auto text-sm text-gray-700 space-y-4">
          <p>
            Con este informe se completa la ejecución de tu contrato. Antes de enviarlo debes aceptar el{' '}
            <strong>Acta de Terminación</strong>, que deja constancia de que el contrato llegó a su fin por
            vencimiento del plazo y de que las partes quedan a paz y salvo.
          </p>

          {/* Lo que se va a firmar */}
          <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 text-[13px]">
            {[
              ['Contrato', prefill.contrato],
              ['Objeto', prefill.objeto],
              ['Fecha de terminación', fechaLarga(prefill.fechaTerminacion)],
              ['Supervisor', prefill.supervisor],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta} className="flex gap-4 px-4 py-2.5">
                <span className="w-36 shrink-0 text-gray-400">{etiqueta}</span>
                <span className="flex-1 text-gray-800">{valor}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Qué estás aceptando</p>
            <p className="text-[13px] text-gray-600 leading-relaxed">
              Que el {fechaLarga(prefill.fechaTerminacion)} queda fijado como fecha de terminación del contrato, por
              haber acreditado el cumplimiento del objeto dentro del plazo, y que a partir de la suscripción del acta
              las partes <strong>se liberan mutuamente</strong> de cualquier obligación derivada del contrato.
            </p>
          </div>

          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
            <p className="text-[12px] text-amber-800 leading-relaxed">
              El acta se generará firmada con tus datos y los de tu supervisor, quedará registrada con fecha, hora y
              evidencia de aceptación, y podrá verificarse mediante su código y código QR. La firma del alcalde se
              estampa por fuera del sistema. <strong>Esta acción no se puede deshacer.</strong>
            </p>
          </div>

          {faltaFirma && (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4">
              <p className="text-[12px] text-red-700 leading-relaxed">
                No tienes una firma registrada. Ve a <strong>tu perfil</strong> y sube tu firma antes de aceptar el
                acta de terminación.
              </p>
            </div>
          )}

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={aceptado}
              onChange={e => setAceptado(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0"
            />
            <span className="text-[13px] text-gray-700 leading-relaxed">
              He leído el contenido del acta, acepto la terminación del contrato en la fecha indicada y la liberación
              recíproca de obligaciones.
            </span>
          </label>
        </div>

        {/* Acciones */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aceptar}
            disabled={!aceptado || procesando || faltaFirma}
            className="text-sm font-semibold text-white bg-emerald-600 px-5 py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {procesando ? 'Generando…' : 'Aceptar y firmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
