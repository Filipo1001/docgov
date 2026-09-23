'use client'

/**
 * El bloque de la firma, completo: lo que se ve, el escáner y la subida de
 * emergencia. Se usa igual en el perfil y dentro de la certificación de
 * retención, que es donde antes había un callejón sin salida —«ve a tu
 * perfil y sube tu firma»— justo en mitad del primer envío.
 *
 * El orden de las opciones es deliberado. Escanear es un botón grande;
 * subir un archivo es un enlace pequeño debajo. No porque subir esté mal,
 * sino porque de los siete pasos que tenía el camino viejo, cinco ocurrían
 * fuera de la aplicación, y ahí es donde se quedaron 27 de 120 contratistas
 * sin registrar su firma. Ninguno de esos 27 ha enviado jamás un informe.
 */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { subirFirma } from '@/app/actions/periodos'
import { desdeArchivo } from '@/lib/firma-escaner'
import EscanerFirma from './EscanerFirma'

export default function CapturaFirma({
  nombre,
  cedula,
  firmaActual,
  onGuardada,
  compacto = false,
}: {
  nombre: string
  cedula?: string | null
  /** URL firmada de la firma ya registrada, o null. */
  firmaActual: string | null
  onGuardada: (url: string) => void
  /** Dentro de un modal el bloque va sin marco ni título propios. */
  compacto?: boolean
}) {
  const [escaneando, setEscaneando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const archivoRef = useRef<HTMLInputElement>(null)

  async function guardar(blob: Blob) {
    const formData = new FormData()
    formData.append('file', new File([blob], 'firma.png', { type: 'image/png' }))
    const res = await subirFirma(formData)
    if (res.error || !res.data?.url) {
      toast.error(res.error ?? 'No se pudo guardar la firma')
      return
    }
    onGuardada(res.data.url)
    setEscaneando(false)
    toast.success('Firma registrada')
  }

  async function desdeGaleria(file: File) {
    setSubiendo(true)
    try {
      const blob = await desdeArchivo(file)
      await guardar(blob)
    } catch (e) {
      const causa = e instanceof Error ? e.message : ''
      toast.error(
        causa === 'sin-trazo'
          ? 'No encontramos una firma en esa imagen. Prueba con una foto donde se vea sobre papel claro.'
          : 'No pudimos leer esa imagen. Si es un PDF o una foto de iPhone, escanéala con la cámara aquí mismo — es más rápido.',
      )
    } finally {
      setSubiendo(false)
    }
  }

  const contenido = (
    <>
      {firmaActual ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-center min-h-[72px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={firmaActual} alt="Tu firma" className="max-h-16 object-contain" />
          </div>
          <button
            onClick={() => setEscaneando(true)}
            disabled={subiendo}
            className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 px-1"
          >
            Volver a escanear
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
          <ol className="space-y-2.5 mb-5">
            {[
              'Firma en una hoja de papel',
              'Apunta la cámara a tu firma',
            ].map((paso, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-500 text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-700">{paso}</span>
              </li>
            ))}
          </ol>

          <p className="text-xs text-gray-400 mb-4 leading-relaxed">
            No tienes que recortar nada ni buscarla en la galería. La cámara
            captura sola cuando se ve bien y te la mostramos antes de guardarla.
          </p>

          <button
            onClick={() => setEscaneando(true)}
            disabled={subiendo}
            className="w-full bg-[#192031] hover:bg-[#242F45] disabled:opacity-60 text-white font-semibold py-3.5 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {subiendo ? 'Procesando…' : 'Escanear mi firma'}
          </button>

          <button
            onClick={() => archivoRef.current?.click()}
            disabled={subiendo}
            className="w-full text-xs text-gray-400 hover:text-gray-600 mt-3 py-1 disabled:opacity-50"
          >
            Prefiero subir una imagen que ya tengo
          </button>
        </div>
      )}

      <input
        ref={archivoRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={subiendo}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void desdeGaleria(f)
          e.target.value = ''
        }}
      />

      <EscanerFirma
        abierto={escaneando}
        nombre={nombre}
        cedula={cedula}
        onCancelar={() => setEscaneando(false)}
        onSubirArchivo={() => { setEscaneando(false); archivoRef.current?.click() }}
        onConfirmar={guardar}
      />
    </>
  )

  if (compacto) return <div>{contenido}</div>

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">Firma</h2>
        {!firmaActual && (
          <span className="text-[10px] text-amber-500 shrink-0">Pendiente de registro</span>
        )}
      </div>
      {contenido}
    </div>
  )
}
