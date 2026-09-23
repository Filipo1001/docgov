'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { aceptarCertificacion } from '@/app/actions/certificaciones'
import { formatCedula } from '@/lib/format'
import CapturaFirma from '@/components/firma/CapturaFirma'

/** ISO → "29 de julio de 2026", en hora de Colombia. */
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota',
  })
}

export interface CertPrefill {
  nombre: string
  cedula: string
  anioGravable: number
  municipio: string
  /** Lo que ya juró este año gravable en otro contrato, si lo hizo. */
  respuestaPrevia: { vinculoMasTrabajador: boolean; fecha: string; contrato: string } | null
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
  // Respuesta jurada. `null` = todavía no ha contestado.
  //
  // Antes arrancaba en `false`, o sea con el NO ya marcado, y eso permitía
  // firmar el documento sin haber mirado la pregunta. Ahora hay que elegir:
  // mientras no lo haga, el botón de aceptar no se activa. Vale para los dos
  // lados — ni un NO por inercia ni un SÍ por descuido.
  //
  // La excepción es quien ya juró este año en otro contrato: se abre con su
  // misma respuesta marcada, porque la declaración es sobre su situación en
  // el año gravable y no sobre el contrato. Volver a preguntarle lo mismo
  // sería no haber escuchado la primera vez.
  // La firma puede resolverse sin cerrar el modal, así que `faltaFirma` —que
  // llega del servidor al abrirlo— deja de ser la verdad en cuanto se registra.
  const [firmaResuelta, setFirmaResuelta] = useState(false)
  const bloqueadoPorFirma = faltaFirma && !firmaResuelta

  const [vinculo, setVinculo] = useState<boolean | null>(
    prefill?.respuestaPrevia?.vinculoMasTrabajador ?? null,
  )
  const [juramento, setJuramento] = useState(false)
  const [procesando, setProcesando] = useState(false)

  if (!abierto || !prefill) return null

  async function aceptar() {
    if (!juramento || procesando || vinculo === null) return
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
              <p>C.C. {formatCedula(prefill.cedula)}</p>
            </div>
          </div>

          {/* Ya lo juró este año: se le recuerda en vez de volver a preguntar */}
          {prefill.respuestaPrevia && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="text-[13px] text-sky-900">
                Ya hiciste esta declaración el{' '}
                <strong>{fechaCorta(prefill.respuestaPrevia.fecha)}</strong>
                {prefill.respuestaPrevia.contrato && <> para el contrato <strong>{prefill.respuestaPrevia.contrato}</strong></>}.
                Tu respuesta viene marcada abajo; confírmala para que quede también en este contrato.
              </p>
            </div>
          )}

          {/* Declaración jurada — SI / NO */}
          {/*
            La pregunta va DOS veces: primero en castellano llano, después el
            texto legal literal.

            El literal —«He contratado o vinculado más de un trabajador…»— se
            lee al revés con una facilidad peligrosa: «he contratado» se
            confunde con «he sido contratado», y quien firma esto es
            justamente una persona contratada por la alcaldía. Leída rápido,
            la respuesta parece que es SÍ. Y un SÍ falso cambia la tarifa de
            retención que Hacienda le aplica, sobre un documento que se rinde
            bajo juramento.

            La pregunta llana no sustituye al texto legal, que es el que se
            jura y va impreso en la carta: lo precede, para que cuando se lea
            ya se sepa de qué trata.
          */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tu declaración</p>

            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-[15px] font-semibold text-gray-900 leading-snug">
                ¿Tienes personas empleadas por ti?
              </p>
              <p className="text-[13px] text-gray-600 leading-relaxed mt-1.5">
                No se trata de tu contrato con la alcaldía. La pregunta es si <strong>tú</strong> eres
                empleador: si has tenido <strong>dos o más personas trabajando para ti</strong>, en tu
                propia actividad, durante noventa días o más de este año.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setVinculo(false)}
                  aria-pressed={vinculo === false}
                  className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                    vinculo === false
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className={`block text-sm font-bold ${vinculo === false ? 'text-blue-700' : 'text-gray-700'}`}>NO</span>
                  <span className="block text-[12px] text-gray-500 mt-0.5 leading-snug">
                    Trabajo por mi cuenta. Nadie está empleado por mí.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setVinculo(true)}
                  aria-pressed={vinculo === true}
                  className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                    vinculo === true
                      ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-100'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className={`block text-sm font-bold ${vinculo === true ? 'text-amber-700' : 'text-gray-700'}`}>SÍ</span>
                  <span className="block text-[12px] text-gray-500 mt-0.5 leading-snug">
                    Tengo dos o más personas empleadas por mí.
                  </span>
                </button>
              </div>

              {/*
                El SÍ se confirma aparte. No para disuadir a quien de verdad
                tiene empleados —su SÍ es tan legítimo como el NO y sale igual
                de firmado—, sino porque es la respuesta a la que se llega por
                error de lectura. La frase de abajo es la que devuelve al sitio
                a quien se equivocó, y no dice nada a quien no.
              */}
              {vinculo === true && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[13px] text-amber-900 leading-relaxed">
                    Estás declarando que <strong>tú eres empleador</strong> de dos o más personas.
                    Con esta respuesta la alcaldía te aplica una retención distinta.
                  </p>
                  <p className="text-[13px] text-amber-900 leading-relaxed mt-2">
                    Si lo que quisiste decir es que <strong>la alcaldía te contrató a ti</strong>,
                    la respuesta es <strong>NO</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setVinculo(false)}
                    className="mt-2.5 text-[13px] font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900"
                  >
                    Me equivoqué, cambiar a NO
                  </button>
                </div>
              )}

              {vinculo === null && (
                <p className="text-[12px] text-gray-400 mt-3">
                  Elige una de las dos para poder continuar.
                </p>
              )}
            </div>

            {/* El texto que se jura y que va impreso en la carta, literal. */}
            <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Lo que dirá el documento
              </p>
              <p className="text-[13px] text-gray-600 leading-relaxed">
                Declaro bajo la gravedad de juramento que, para efectos del artículo 383 del Estatuto
                Tributario: <span className="italic">“He contratado o vinculado más de un trabajador
                asociado a mi actividad económica por al menos noventa (90) días continuos o
                discontinuos.”</span>{' '}
                {vinculo !== null && (
                  <strong className={vinculo ? 'text-amber-700' : 'text-blue-700'}>
                    {vinculo ? 'SÍ' : 'NO'}
                  </strong>
                )}
              </p>
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

          {/* La firma se resuelve AQUÍ, no en otra pantalla.
              Antes este recuadro decía «ve a tu perfil y sube tu firma» y
              dejaba el botón muerto: un callejón sin salida en mitad del
              primer envío, con el informe ya escrito. De los 120
              contratistas, 27 no tienen firma — y ninguno de esos 27 ha
              llegado a enviar un informe nunca. */}
          {bloqueadoPorFirma && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-[12px] text-amber-800 leading-relaxed mb-3">
                Falta tu firma. Es la que se estampa en esta certificación y en
                el resto de tus documentos. Se resuelve aquí mismo, sin salir
                de esta pantalla.
              </p>
              <CapturaFirma
                nombre={prefill.nombre}
                cedula={prefill.cedula}
                firmaActual={null}
                onGuardada={() => setFirmaResuelta(true)}
                compacto
              />
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
            disabled={!juramento || procesando || bloqueadoPorFirma || vinculo === null}
            className="text-sm font-semibold text-white bg-blue-600 px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {procesando ? 'Generando…' : 'Aceptar y firmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
