'use client'

/**
 * Anexos PDF del periodo.
 *
 * Se suben con el mismo patrón que las evidencias: URL prefirmada + PUT directo
 * del navegador a Storage, evitando el límite de tiempo de las funciones.
 *
 * La "previsualización" abre el PDF en una pestaña nueva con el visor nativo
 * del dispositivo, en lugar de incrustarlo. Motivo: los navegadores móviles
 * —Safari de iPhone en particular— no renderizan PDFs incrustados de forma
 * confiable, y los usuarios de esta pantalla trabajan desde el celular. Además,
 * las URLs firmadas viven en el dominio de Supabase, así que el PDF se abre
 * aislado del origen de la aplicación.
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  prepararUploadAdjunto, registrarAdjunto, eliminarAdjunto, listarAdjuntos,
  type AdjuntoDTO,
} from '@/app/actions/adjuntos'

const MAX_MB = 15

function pesoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AdjuntosPeriodo({
  periodoId,
  puedeEditar,
}: {
  periodoId: string
  /** El periodo está en un estado editable y el usuario es el contratista dueño. */
  puedeEditar: boolean
}) {
  const [adjuntos, setAdjuntos] = useState<AdjuntoDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [eliminando, setEliminando] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const lista = await listarAdjuntos(periodoId)
    setAdjuntos(lista)
    setCargando(false)
  }, [periodoId])

  useEffect(() => { void recargar() }, [recargar])

  async function handleSubir(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Solo se permiten archivos PDF')
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`El archivo supera el máximo de ${MAX_MB} MB`)
      return
    }

    setSubiendo(true)
    setProgreso(0)
    try {
      const prep = await prepararUploadAdjunto(periodoId, file.name, file.size)
      if (prep.error || !prep.data) {
        toast.error(prep.error ?? 'No se pudo preparar la subida')
        return
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.timeout = 120_000
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgreso(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
          ? resolve()
          : reject(new Error(`Error al subir (HTTP ${xhr.status})`))
        xhr.onerror = () => reject(new Error('Error de red al subir el archivo'))
        xhr.ontimeout = () => reject(new Error('La subida tardó demasiado. Verifica tu conexión.'))
        xhr.open('PUT', prep.data!.signedUrl)
        xhr.setRequestHeader('Content-Type', 'application/pdf')
        xhr.send(file)
      })

      // El servidor descarga el archivo y verifica su contenido REAL aquí:
      // firma binaria, que no esté cifrado y que sea legible.
      const res = await registrarAdjunto(periodoId, prep.data.path, file.name)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`Anexo agregado: ${file.name}`)
      await recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir el anexo')
    } finally {
      setSubiendo(false)
      setProgreso(0)
    }
  }

  async function handleEliminar(id: string, nombre: string) {
    setEliminando(id)
    const res = await eliminarAdjunto(periodoId, id)
    if (res.error) toast.error(res.error)
    else {
      toast.success(`Anexo eliminado: ${nombre}`)
      await recargar()
    }
    setEliminando(null)
  }

  // Sin anexos y sin permiso de edición → no ocupar espacio en la pantalla.
  if (!puedeEditar && !cargando && adjuntos.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-semibold text-gray-900">Anexos del informe</h2>
        {adjuntos.length > 0 && (
          <span className="text-xs text-gray-400">
            {adjuntos.length} {adjuntos.length === 1 ? 'documento' : 'documentos'}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Documentos PDF que se anexarán al final del Informe de Actividades, en este orden.
      </p>

      {cargando ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {adjuntos.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200"
            >
              <span className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-red-600">PDF</span>
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  <span className="text-gray-400 font-normal">Anexo {a.orden} · </span>
                  {a.nombre_original}
                </p>
                <p className="text-xs text-gray-400">
                  {a.paginas ? `${a.paginas} ${a.paginas === 1 ? 'página' : 'páginas'} · ` : ''}
                  {pesoLegible(Number(a.bytes))}
                </p>
              </div>

              {a.urlFirmada && (
                <a
                  href={a.urlFirmada}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver documento"
                  className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </a>
              )}

              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => handleEliminar(a.id, a.nombre_original)}
                  disabled={eliminando === a.id}
                  title="Eliminar anexo"
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 disabled:opacity-40"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {adjuntos.length === 0 && !puedeEditar && (
            <p className="text-xs text-gray-400 py-2">Este informe no tiene anexos.</p>
          )}

          {puedeEditar && (
            <label
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed transition-colors ${
                subiendo
                  ? 'border-blue-300 bg-blue-50 cursor-wait'
                  : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer'
              }`}
            >
              {subiendo ? (
                <span className="text-sm text-blue-700 font-medium">Subiendo… {progreso}%</span>
              ) : (
                <>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm text-gray-600 font-medium">Agregar anexo PDF</span>
                  <span className="text-xs text-gray-400">· máx. {MAX_MB} MB</span>
                </>
              )}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={subiendo}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleSubir(f)
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  )
}
