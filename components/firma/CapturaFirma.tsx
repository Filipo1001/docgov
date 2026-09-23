'use client'

/**
 * El bloque de la firma, completo: lo que se ve, el escáner y la subida de
 * emergencia. Se usa igual en el perfil y dentro de la certificación de
 * retención, que es donde antes había un callejón sin salida —«ve a tu
 * perfil y sube tu firma»— justo en mitad del primer envío.
 *
 * Los dos caminos —escanear y subir una imagen— pesan lo mismo y cada uno
 * dice para quién es, de modo que elegir no exija pensar. Escanear va
 * primero porque de los siete pasos del camino viejo cinco ocurrían fuera de
 * la aplicación, y ahí es donde se quedaron 27 de los 120 contratistas sin
 * registrar su firma; ninguno de esos 27 ha enviado jamás un informe. Pero
 * quien ya tiene la foto en el teléfono no tiene por qué buscar un papel.
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
  soloDemo = false,
}: {
  nombre: string
  cedula?: string | null
  /** URL firmada de la firma ya registrada, o null. */
  firmaActual: string | null
  onGuardada: (url: string) => void
  /** Dentro de un modal el bloque va sin marco ni título propios. */
  compacto?: boolean
  /** No guarda en el servidor: solo enseña el resultado. Lo usa la página de
   *  prueba, que vive fuera del inicio de sesión. Se va con ella. */
  soloDemo?: boolean
}) {
  const [escaneando, setEscaneando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const archivoRef = useRef<HTMLInputElement>(null)

  async function guardar(blob: Blob) {
    if (soloDemo) {
      onGuardada(URL.createObjectURL(blob))
      setEscaneando(false)
      return
    }
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
          <div className="shrink-0 flex sm:flex-col gap-3 sm:gap-1">
            <button
              onClick={() => setEscaneando(true)}
              disabled={subiendo}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 px-1 text-left"
            >
              Volver a escanear
            </button>
            <button
              onClick={() => archivoRef.current?.click()}
              disabled={subiendo}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 px-1 text-left"
            >
              Subir otra
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">
            Tu firma se estampa en la cuenta de cobro, el informe y las actas.
            Se registra una sola vez.
          </p>

          {/* Los dos caminos, con el mismo peso visual. Cada uno dice para
              quién es, de modo que la elección no exija pensar: quien tiene la
              firma en el teléfono va al segundo, y quien no, al primero. */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => setEscaneando(true)}
              disabled={subiendo}
              className="w-full bg-[#192031] hover:bg-[#242F45] disabled:opacity-60 text-white py-3.5 px-4 rounded-2xl transition-colors flex items-center gap-3 text-left"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span className="min-w-0">
                <span className="block font-semibold text-[15px] leading-tight">
                  {subiendo ? 'Procesando…' : 'Escanear mi firma'}
                </span>
                <span className="block text-[12px] text-white/60 leading-tight mt-0.5">
                  Firma en un papel y apunta la cámara
                </span>
              </span>
            </button>

            <button
              onClick={() => archivoRef.current?.click()}
              disabled={subiendo}
              className="w-full bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60 text-gray-900 py-3.5 px-4 rounded-2xl transition-colors flex items-center gap-3 text-left"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span className="min-w-0">
                <span className="block font-semibold text-[15px] leading-tight">Subir una imagen</span>
                <span className="block text-[12px] text-gray-400 leading-tight mt-0.5">
                  Si ya tienes una foto de tu firma
                </span>
              </span>
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            Con cualquiera de los dos: no tienes que recortar nada ni quitarle
            el fondo. Te la mostramos antes de guardarla.
          </p>
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
