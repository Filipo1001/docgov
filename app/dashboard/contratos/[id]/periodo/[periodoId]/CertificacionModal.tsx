'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { aceptarCertificacion } from '@/app/actions/certificaciones'
import { formatCedula } from '@/lib/format'

export interface CertPrefill {
  nombre: string
  cedula: string
  anioGravable: number
  municipio: string
}

/**
 * Modal obligatorio de la Certificación de Retención en la Fuente
 * (Ley 1819/2016 · Art. 383 E.T.). El contratista jura si ha vinculado o no
 * más de un trabajador y acepta expresamente bajo gravedad de juramento.
 * Mientras no acepte, el informe no puede enviarse.
 */
export default function CertificacionModal({
  abierto,
  periodoId,
  prefill,
  faltaFirma,
  onCerrar,
  onAceptada,
}: {
  abierto: boolean
  periodoId: string
  prefill: CertPrefill | null
  faltaFirma: boolean
  onCerrar: () => void
  onAceptada: () => void
}) {
  // Respuesta jurada: false = NO (el caso mayoritario), true = SI
  const [vinculo, setVinculo] = useState(false)
  const [juramento, setJuramento] = useState(false)
  const [procesando, setProcesando] = useState(false)

  if (!abierto || !prefill) return null

  async function aceptar() {
    if (!juramento || procesando) return
    setProcesando(true)
    const result = await aceptarCertificacion(periodoId, vinculo)
    if (result.error) {
      toast.error(result.error)
      setProcesando(false)
      return
    }
    toast.success('Certificación aceptada y generada')
    onAceptada()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[92vh]">
        {/* Encabezado */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.6 2A9 9 0 11 3.4 12 9 9 0 0120.6 12z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900">Certificación de Retención en la Fuente</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Requisito previo al primer envío del año gravable {prefill.anioGravable} · Ley 1819 de 2016
              </p>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="px-6 py-4 overflow-y-auto text-sm text-gray-700 space-y-4">
          <p>
            Antes de enviar tu informe, la ley exige dejar constancia de tu situación tributaria para determinar
            cómo se te aplica la <strong>retención en la fuente</strong> sobre tus honorarios.
          </p>

          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-1.5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Fundamento legal</p>
            <p className="text-[13px] text-gray-600 leading-relaxed">
              Parágrafo 2 del artículo 383 del Estatuto Tributario, modificado por la Ley 1819 de 2016. La tarifa de
              retención depende de si has <strong>contratado o vinculado más de un trabajador</strong> asociado a tu
              actividad económica por al menos noventa (90) días, continuos o discontinuos.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">A nombre de</p>
            <div className="rounded-xl border border-gray-100 p-4 text-[13px] text-gray-700 space-y-0.5">
              <p className="font-semibold text-gray-900">{prefill.nombre}</p>
              <p>C.C. {formatCedula(prefill.cedula)} · expedida en {prefill.municipio}</p>
            </div>
          </div>

          {/* Declaración jurada — SI / NO */}
          <div>
            <p className="text-[13px] font-medium text-gray-800 mb-2">
              Declaro bajo la gravedad de juramento que, para efectos del artículo 383 del Estatuto Tributario:
            </p>
            <p className="text-[13px] text-gray-600 italic mb-3">
              “He contratado o vinculado más de un trabajador asociado a mi actividad económica por al menos noventa
              (90) días continuos o discontinuos.”
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVinculo(false)}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  !vinculo ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                NO
                <span className="block text-[11px] font-normal mt-0.5 text-gray-400">No he vinculado más de un trabajador</span>
              </button>
              <button
                type="button"
                onClick={() => setVinculo(true)}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  vinculo ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                SÍ
                <span className="block text-[11px] font-normal mt-0.5 text-gray-400">Sí he vinculado más de un trabajador</span>
              </button>
            </div>
            <p className="text-[12px] text-gray-500 mt-2">
              Me comprometo a informar en el momento en que contrate o vincule más de un trabajador.
            </p>
          </div>

          {/* Consecuencias */}
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
            <p className="text-[12px] text-amber-800 leading-relaxed">
              Esta declaración se rinde <strong>bajo la gravedad de juramento</strong>. Suministrar información falsa
              puede acarrear responsabilidad penal (falsedad en documento) y las sanciones tributarias a que haya
              lugar. Al aceptar, se generará automáticamente la certificación firmada con tus datos, quedará registrada
              con fecha, hora y evidencia de aceptación, y podrá verificarse mediante su código y código QR.
            </p>
          </div>

          {faltaFirma && (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4">
              <p className="text-[12px] text-red-700 leading-relaxed">
                No tienes una firma registrada. Ve a <strong>tu perfil</strong> y sube tu firma antes de aceptar la
                certificación.
              </p>
            </div>
          )}

          {/* Aceptación expresa */}
          <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={juramento}
              onChange={e => setJuramento(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
            />
            <span className="text-[13px] text-gray-700 leading-relaxed">
              Declaro bajo la gravedad de juramento que la información contenida en esta certificación es veraz y
              acepto íntegramente su contenido.
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
            disabled={!juramento || procesando || faltaFirma}
            className="text-sm font-semibold text-white bg-blue-600 px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {procesando ? 'Generando…' : 'Aceptar y firmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
