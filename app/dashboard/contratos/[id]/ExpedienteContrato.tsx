'use client'

/**
 * Expediente documental del contrato.
 *
 * Dos secciones con propósitos distintos, y por eso se ven distintas:
 *
 * REQUERIDOS. Los seis soportes que la ley exige para legalizar el contrato
 * (CDP, RP, RUT...). Es un checklist, no una lista de archivos: cada categoría
 * aparece siempre, tenga documento o no, para que el hueco sea visible — que
 * falte el RP es justo lo que un ente de control viene a buscar. El estado
 * (adjuntado / pendiente) se comunica con un icono de estado, no con un
 * pictograma por categoría: siete iconos distintos para siete papeles no
 * transmitían de qué documento se trataba, solo decoraban.
 *
 * ADICIONALES. Todo lo demás — un otrosí, un concepto jurídico, cualquier
 * soporte que no encaje en las seis categorías. No es una lista rígida: el
 * nombre del archivo identifica el documento, así que "los tipos varían según
 * el contexto" sin que la interfaz necesite saberlo de antemano.
 */

import { useState } from 'react'
import SubiendoArchivo from '@/components/ui/SubiendoArchivo'
import { toast } from 'sonner'
import VisorPDF from '@/components/VisorPDF'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  prepararUploadDocumento, registrarDocumento,
  eliminarDocumentoContrato, listarDocumentosContrato,
} from '@/app/actions/documentos-contrato'
import {
  REQUERIDOS,
  type DocumentoContratoDTO, type TipoDocumento,
} from '@/lib/documentos-contrato'

function pesoLegible(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function BotonAdjuntar({
  cargando, tieneArchivos, onFile,
}: {
  cargando: boolean
  tieneArchivos: boolean
  onFile: (file: File) => void
}) {
  return (
    <label
      className={`text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors shrink-0 ${
        cargando
          ? 'text-gray-400 bg-gray-100 cursor-wait'
          : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
      }`}
    >
      {cargando ? 'Subiendo…' : tieneArchivos ? '+ Añadir' : 'Adjuntar'}
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={cargando}
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
    </label>
  )
}

function ListaArchivos({
  archivos, editable, onVer, onBorrar, indentado = true,
}: {
  archivos: DocumentoContratoDTO[]
  editable: boolean
  onVer: (d: DocumentoContratoDTO) => void
  onBorrar: (id: string) => void
  /** Alinea bajo el icono de estado de la fila requerida. En la sección de
      adicionales no hay fila que alinear, así que se desactiva. */
  indentado?: boolean
}) {
  return (
    <div className={`space-y-1 ${indentado ? 'mt-2 pl-9' : ''}`}>
      {archivos.map(d => (
        <div key={d.id} className="group flex items-center gap-2">
          <Icono glifo={Iconos.documentos.adjunto} tamano="sm" className="shrink-0 text-gray-300" />
          <button
            type="button"
            onClick={() => onVer(d)}
            className="flex-1 min-w-0 flex items-baseline gap-2 text-left hover:underline underline-offset-2"
          >
            <span className="text-xs text-gray-700 truncate">{d.nombre_original}</span>
            <span className="text-[10px] text-gray-400 shrink-0">
              {pesoLegible(d.bytes)}{d.paginas ? ` · ${d.paginas} p.` : ''}
            </span>
          </button>
          {editable && (
            <button
              onClick={() => onBorrar(d.id)}
              aria-label={`Eliminar ${d.nombre_original}`}
              className="p-1 rounded text-gray-300 hover:text-red-600 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
            >
              <Icono glifo={Iconos.accion.eliminar} tamano="sm" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
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
  const adicionales = porTipo('otro')

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

  const conDocumento = REQUERIDOS.filter(t => porTipo(t.id).length > 0).length

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          Expediente documental
        </h3>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          conDocumento === REQUERIDOS.length
            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
            : 'text-gray-500 bg-gray-50 border border-gray-200'
        }`}>
          {conDocumento} de {REQUERIDOS.length}
        </span>
      </div>

      {/* ── Requeridos: checklist con hueco visible ── */}
      <div className="space-y-1.5">
        {REQUERIDOS.map(tipo => {
          const archivos = porTipo(tipo.id)
          const adjuntado = archivos.length > 0
          const cargando = subiendo === tipo.id

          return (
            <div
              key={tipo.id}
              className={`rounded-xl border px-3 py-2.5 transition-colors ${
                adjuntado ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icono
                  glifo={adjuntado ? Iconos.estado.aprobado : Iconos.estado.pendiente}
                  tamano="md"
                  className={`shrink-0 ${adjuntado ? 'text-emerald-500' : 'text-gray-300'}`}
                />

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${adjuntado ? 'text-gray-900' : 'text-gray-400'}`}>
                    {tipo.label}
                  </p>
                  {!adjuntado && (
                    <p className="text-[11px] text-gray-400">Sin adjuntar</p>
                  )}
                </div>

                {editable && (
                  <BotonAdjuntar
                    cargando={cargando}
                    tieneArchivos={adjuntado}
                    onFile={file => subir(tipo.id, file)}
                  />
                )}
              </div>

              {adjuntado && (
                <ListaArchivos
                  archivos={archivos}
                  editable={editable}
                  onVer={d => d.urlFirmada && setVisor({ url: d.urlFirmada, nombre: d.nombre_original })}
                  onBorrar={borrar}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Adicionales: sin lista fija — el nombre del archivo identifica el documento ── */}
      <div className="mt-5 pt-5 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-2.5">
          <Icono glifo={Iconos.documentos.adjunto} tamano="sm" className="text-gray-300" />
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Documentos adicionales
          </p>
          {adicionales.length > 0 && (
            <span className="text-xs text-gray-400">({adicionales.length})</span>
          )}
        </div>

        {adicionales.length > 0 ? (
          <div className="rounded-xl border border-gray-200 px-3 py-2.5">
            <ListaArchivos
              archivos={adicionales}
              editable={editable}
              indentado={false}
              onVer={d => d.urlFirmada && setVisor({ url: d.urlFirmada, nombre: d.nombre_original })}
              onBorrar={borrar}
            />
          </div>
        ) : !editable ? (
          <p className="text-xs text-gray-400">Sin documentos adicionales.</p>
        ) : null}

        {editable && (
          <div className="mt-2">
            <BotonAdjuntar
              cargando={subiendo === 'otro'}
              tieneArchivos={adicionales.length > 0}
              onFile={file => subir('otro', file)}
            />
            <span className="text-[11px] text-gray-400 ml-2">
              Otrosíes, conceptos jurídicos u otro soporte que no esté arriba
            </span>
          </div>
        )}
      </div>

      {visor && (
        <VisorPDF url={visor.url} nombre={visor.nombre} onClose={() => setVisor(null)} />
      )}
      {/* Indicador de subida unificado — ver components/ui/SubiendoArchivo.tsx */}
      <SubiendoArchivo
        abierto={subiendo !== null}
        icono={Iconos.documentos.adjunto}
        etiqueta={'Subiendo documento'}
        detalle="No cierres esta página."
      />

    </div>
  )
}
