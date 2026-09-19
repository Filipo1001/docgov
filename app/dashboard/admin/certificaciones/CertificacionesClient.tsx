'use client'

/**
 * Reemisión de las certificaciones de retención que salieron sin firma.
 *
 * La pantalla existe para que reemitir sea una decisión humana y visible: son
 * documentos con código de verificación repartidos a contratistas reales. Se
 * explica qué se conserva y qué cambia ANTES de pulsar, y luego se confirma.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import PageHeader from '@/components/ui/PageHeader'
import { regenerarCertificaciones } from '@/app/actions/certificaciones'

export default function CertificacionesClient() {
  const [procesando, setProcesando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [resumen, setResumen] = useState<string | null>(null)
  const [problemas, setProblemas] = useState<string[]>([])

  async function reemitir() {
    setProcesando(true)
    setConfirmando(false)
    const res = await regenerarCertificaciones()
    setProcesando(false)
    if (res.error) { toast.error(res.error); return }
    setResumen(`${res.regeneradas} de ${res.revisadas} certificaciones reemitidas con la firma.`)
    setProblemas(res.problemas)
    if (res.problemas.length === 0) toast.success('Listo, todas quedaron firmadas')
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Certificaciones de retención"
        subtitle="Reemitir las cartas con la firma, y sin el lugar de expedición inventado"
      />

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="space-y-2 text-sm text-gray-600 leading-relaxed">
          <p>
            Hay <strong>dos defectos</strong> en todas las certificaciones emitidas hasta
            hoy, y esta acción corrige los dos.
          </p>
          <p>
            <strong>Salieron sin firma.</strong> La firma se guarda en un depósito privado
            y esta plantilla nunca pedía el permiso de lectura, así que el PDF salía
            completo pero con ese espacio en blanco.
          </p>
          <p>
            <strong>Afirmaban dónde se expidió la cédula.</strong> Decían «expedida en
            FREDONIA» porque se usaba el municipio del contrato como si fuera el de la
            cédula — un dato que nadie comprobó, dentro de un documento que se rinde bajo
            juramento. Al reemitir, esa frase desaparece.
          </p>
          <p>
            <strong>No se cambia una palabra de lo declarado</strong>: se conservan el
            código de verificación, la fecha de aceptación y la respuesta jurada tal como
            se guardó el día que la persona la dio.
          </p>
          <p className="text-gray-500">
            Los códigos QR ya repartidos siguen funcionando, porque el código no cambia.
          </p>
        </div>

        {!confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={procesando}
            className="rounded-xl bg-gray-900 text-white text-sm font-semibold px-4 py-2.5 hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {procesando ? 'Reemitiendo…' : 'Reemitir las certificaciones'}
          </button>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm text-amber-900">
              Se reemitirán todas las certificaciones existentes. Es seguro repetirlo:
              pasarla dos veces produce el mismo resultado.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reemitir}
                className="rounded-lg bg-amber-600 text-white text-sm font-semibold px-4 py-2 hover:bg-amber-700 transition-colors"
              >
                Sí, reemitir
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="rounded-lg border border-gray-200 text-sm font-medium px-4 py-2 text-gray-600 hover:bg-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {resumen && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-900">{resumen}</p>
            {problemas.length > 0 && (
              <ul className="space-y-1">
                {problemas.map((p, i) => (
                  <li key={i} className="text-xs text-amber-700">{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
