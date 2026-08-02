'use client'

/**
 * Expediente documental del contrato.
 *
 * Se presenta por CATEGORÍA y no como lista de archivos porque así es como se
 * consulta: nadie busca "documento_3.pdf", busca "la certificación bancaria".
 * Cada categoría del trámite aparece siempre, tenga documento o no, de modo
 * que el hueco sea visible — que falte el RP es justo lo que hay que ver.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import VisorPDF from '@/components/VisorPDF'
import {
  prepararUploadDocumento, registrarDocumento,
  eliminarDocumentoContrato, listarDocumentosContrato,
} from '@/app/actions/documentos-contrato'
import {
  TIPOS_DOCUMENTO,
  type DocumentoContratoDTO, type TipoDocumento,
} from '@/lib/documentos-contrato'

function pesoLegible(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export default function ExpedienteContrato({
  contratoId,
  initial,
  editable,
}: {
  contratoId: string
  initial: DocumentoContratoDTO[]
  editable: boolean
}) {
  const [docs, setDocs] = useState(initial)
  const [subiendo, setSubiendo] = useState<TipoDocumento | null>(null)
  const [visor, setVisor] = useState<{ url: string; nombre: string } | null>(null)

  const porTipo = (t: TipoDocumento) => docs.filter(d => d.tipo_documento === t)

  async function subir(tipo: TipoDocumento, file: File) {
    setSubiendo(tipo)
    try {
      const prep = await prepararUploadDocumento(contratoId, file.name, file.size, tipo)
      if (prep.error || !prep.data) { toast.error(prep.error ?? 'No se pudo preparar la subida'); return }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.timeout = 120_000
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
          ? resolve() : reject(new Error(`Error al subir (HTTP ${xhr.status})`))
        xhr.onerror = () => reject(new Error('Error de red al subir el documento'))
        xhr.ontimeout = () => reject(new Error('La subida tardó demasiado. Verifica tu conexión.'))
        xhr.open('PUT', prep.data!.signedUrl)
        xhr.setRequestHeader('Content-Type', 'application/pdf')
        xhr.send(file)
      })

      const res = await registrarDocumento(contratoId, prep.data.path, file.name, tipo)
      if (res.error) { toast.error(res.error); return }
      setDocs(await listarDocumentosContrato(contratoId))
      toast.success('Documento adjuntado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir el documento')
    } finally {
      setSubiendo(null)
    }
  }

  async function borrar(id: string) {
    const res = await eliminarDocumentoContrato(contratoId, id)
    if (res.error) { toast.error(res.error); return }
    setDocs(prev => prev.filter(d => d.id !== id))
    toast.success('Documento eliminado')
  }

  const total = docs.length
  const conDocumento = TIPOS_DOCUMENTO.filter(t => t.id !== 'otro' && porTipo(t.id).length > 0).length
  const obligatorios = TIPOS_DOCUMENTO.filter(t => t.id !== 'otro').length

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          Expediente documental
        </h3>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          conDocumento === obligatorios
            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
            : 'text-gray-500 bg-gray-50 border border-gray-200'
        }`}>
          {conDocumento} de {obligatorios}
        </span>
      </div>

      <div className="space-y-1.5">
        {TIPOS_DOCUMENTO.map(tipo => {
          const archivos = porTipo(tipo.id)
          const cargando = subiendo === tipo.id

          return (
            <div
              key={tipo.id}
              className={`rounded-xl border px-3 py-2.5 transition-colors ${
                archivos.length
                  ? 'border-gray-200 bg-white'
                  : 'border-dashed border-gray-200 bg-gray-50/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg w-6 text-center shrink-0" aria-hidden>{tipo.icono}</span>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${archivos.length ? 'text-gray-900' : 'text-gray-400'}`}>
                    {tipo.label}
                  </p>
                  {!archivos.length && (
                    <p className="text-[11px] text-gray-400">Sin adjuntar</p>
                  )}
                </div>

                {editable && (
                  <label
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors shrink-0 ${
                      cargando
                        ? 'text-gray-400 bg-gray-100 cursor-wait'
                        : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                    }`}
                  >
                    {cargando ? 'Subiendo…' : archivos.length ? '+ Añadir' : 'Adjuntar'}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={cargando}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (file) void subir(tipo.id, file)
                      }}
                    />
                  </label>
                )}
              </div>

              {archivos.length > 0 && (
                <div className="mt-2 pl-9 space-y-1">
                  {archivos.map(d => (
                    <div key={d.id} className="group flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => d.urlFirmada && setVisor({ url: d.urlFirmada, nombre: d.nombre_original })}
                        className="flex-1 min-w-0 flex items-baseline gap-2 text-left hover:underline underline-offset-2"
                      >
                        <span className="text-xs text-gray-700 truncate">{d.nombre_original}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {pesoLegible(d.bytes)}{d.paginas ? ` · ${d.paginas} p.` : ''}
                        </span>
                      </button>
                      {editable && (
                        <button
                          onClick={() => borrar(d.id)}
                          aria-label={`Eliminar ${d.nombre_original}`}
                          className="p-1 rounded text-gray-300 hover:text-red-600 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!editable && total === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          Aún no se ha adjuntado ningún documento a este contrato.
        </p>
      )}

      {visor && (
        <VisorPDF url={visor.url} nombre={visor.nombre} onClose={() => setVisor(null)} />
      )}
    </div>
  )
}
