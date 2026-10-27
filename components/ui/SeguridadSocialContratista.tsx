'use client'

/**
 * components/ui/SeguridadSocialContratista.tsx — Lo que la contratista ve de sus documentos de seguridad social DESPUÉS de
 * enviar el informe: las mismas fichas que usa al prepararlo (`PanelDocumentos`), no la lista desplegable de antes.
 *
 * Dos modos, que decide `lib/planilla-contratista.ts` (el mismo código que el servidor):
 *
 *   · Solo lectura (lo normal con el informe enviado): se pueden ver la planilla y el soporte y leer el número, pero no
 *     cambiarlos. Dice en qué punto está la revisión (pendiente, aprobada o devuelta).
 *   · Corrección (el revisor devolvió la planilla): se muestra el motivo y las tres fichas se pueden cambiar. Los cambios no
 *     reinician la revisión; lo hace «Enviar corrección a revisión», que además cierra la ventana.
 */

import Icono from '@/components/ui/Icono'
import PanelDocumentos, { type CampoNumero, type Documento } from '@/components/ui/PanelDocumentos'
import { Iconos } from '@/lib/iconos'
import type { RevisionPlanilla } from '@/lib/planilla-contratista'

const ESTADO: Record<'pendiente' | 'aprobada' | 'rechazada', { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente de revisión', clase: 'bg-blue-50 text-blue-700' },
  aprobada: { texto: 'Aprobada', clase: 'bg-green-50 text-green-700' },
  rechazada: { texto: 'Devuelta: requiere corrección', clase: 'bg-red-50 text-red-700' },
}

export default function SeguridadSocialContratista({
  revision, motivo, enCorreccion, informeEnRevision, planilla, soporte, numero, bloqueoEnvio, enviando, onEnviarCorreccion,
}: {
  revision: RevisionPlanilla
  /** Lo que escribió quien devolvió la planilla. */
  motivo: string | null
  /** El revisor devolvió la planilla: las fichas se pueden cambiar. */
  enCorreccion: boolean
  /** El informe está enviado o en revisión (no aprobado todavía). */
  informeEnRevision: boolean
  planilla: Documento
  soporte: Documento
  numero: CampoNumero
  /** Por qué todavía no se puede enviar la corrección, o null si ya se puede. */
  bloqueoEnvio: string | null
  enviando: boolean
  onEnviarCorreccion: () => void
}) {
  const estado = revision ? ESTADO[revision] : null
  return (
    <div className={`rounded-xl border bg-white p-3 sm:p-4 ${enCorreccion ? 'border-gray-200 border-l-4 border-l-red-500' : 'border-gray-200'}`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex text-gray-500"><Icono glifo={Iconos.dominio.seguridadSocial} tamano="md" /></span>
        <p className="text-sm font-medium text-gray-900">Planilla de Seguridad Social</p>
        {estado && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${estado.clase}`}>{estado.texto}</span>}
      </div>

      {enCorreccion && (
        <div className="mb-3">
          {motivo ? (
            <>
              <p className="text-xs text-gray-500">Esto fue lo que indicó la revisión:</p>
              <blockquote className="mt-1 break-words border-l-2 border-red-200 pl-3 text-sm leading-relaxed text-gray-700">{motivo}</blockquote>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-gray-600">No se dejó un motivo escrito. Revisa la planilla, el soporte del pago y el número.</p>
          )}
        </div>
      )}

      <PanelDocumentos planilla={planilla} soporte={soporte} numero={{ ...numero, soloLectura: !enCorreccion }} />

      {enCorreccion ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-gray-500">
            {bloqueoEnvio ?? 'Cuando termines de corregir, envía la corrección: el revisor volverá a mirar los tres documentos.'}
          </p>
          <button
            type="button"
            onClick={onEnviarCorreccion}
            disabled={enviando || bloqueoEnvio !== null}
            aria-busy={enviando}
            className="w-full shrink-0 rounded-xl bg-tinta px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-tinta-clara active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 sm:w-auto"
          >
            {enviando ? 'Enviando…' : 'Enviar corrección a revisión'}
          </button>
        </div>
      ) : informeEnRevision ? (
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Ya enviaste el informe: estos documentos solo se pueden cambiar si el revisor devuelve la planilla.
        </p>
      ) : null}
    </div>
  )
}
