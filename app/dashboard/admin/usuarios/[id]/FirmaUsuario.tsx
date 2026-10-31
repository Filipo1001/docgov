'use client'

/**
 * La firma del usuario, en su ficha. Antes vivía en una pantalla aparte («Firmas») que listaba a todos los contratistas:
 * ahora cada firma pertenece a su perfil y se gestiona desde ahí (subir, reemplazar, eliminar). Solo la gestiona el admin.
 */

import { useRef, useState } from 'react'
import SubiendoArchivo from '@/components/ui/SubiendoArchivo'
import { Iconos } from '@/lib/iconos'
import { Toaster, toast } from 'sonner'
import { subirFirma } from '@/app/actions/periodos'
import { eliminarFirmaAdmin } from '@/app/actions/admin'
import { normalizarFirma } from '@/lib/compress'

export default function FirmaUsuario({
  usuarioId,
  nombre,
  firmaUrl: inicial,
}: {
  usuarioId: string
  nombre: string
  /** URL firmada (bucket privado) de la firma actual, o null si no tiene. */
  firmaUrl: string | null
}) {
  const [firmaUrl, setFirmaUrl] = useState<string | null>(inicial)
  const [subiendo, setSubiendo] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const primerNombre = nombre.split(' ')[0]

  async function handleFile(file: File) {
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED.includes(file.type)) {
      toast.error('Solo se permiten imágenes JPG, PNG o WEBP')
      return
    }
    setSubiendo(true)
    try {
      const blob = await normalizarFirma(file)
      const formData = new FormData()
      formData.append('file', new File([blob], 'firma.png', { type: 'image/png' }))
      const result = await subirFirma(formData, usuarioId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Firma de ${primerNombre} actualizada`)
        setFirmaUrl(result.data?.url ?? null)
      }
    } catch {
      toast.error('Error al procesar la imagen')
    } finally {
      setSubiendo(false)
    }
  }

  async function handleEliminar() {
    setEliminando(true)
    const result = await eliminarFirmaAdmin(usuarioId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Firma eliminada')
      setFirmaUrl(null)
      setConfirmEliminar(false)
    }
    setEliminando(false)
  }

  return (
    <section aria-labelledby="firma-titulo" className="bg-white rounded-2xl border border-gray-200 p-6">
      <Toaster richColors position="top-right" />
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 id="firma-titulo" className="text-sm font-semibold text-gray-900">Firma</h3>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${firmaUrl ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {firmaUrl ? '✓ Con firma' : 'Sin firma'}
        </span>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Sella los documentos del informe. Al subir una imagen el sistema quita el fondo y la ajusta a 600×200 px (JPG, PNG o WEBP).
      </p>

      <div className={`rounded-xl overflow-hidden flex items-center justify-center h-28 mb-4 ${
        firmaUrl
          ? 'bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:16px_16px]'
          : 'bg-gray-50 border border-dashed border-gray-200'
      }`}>
        {firmaUrl ? (
          <img src={firmaUrl} alt={`Firma de ${nombre}`} className="max-h-24 max-w-full object-contain p-2" />
        ) : (
          <span className="text-xs text-gray-400">Sin firma cargada</span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="flex-1 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {subiendo ? 'Procesando…' : firmaUrl ? 'Reemplazar firma' : 'Subir firma'}
        </button>

        {firmaUrl && !confirmEliminar && (
          <button
            type="button"
            onClick={() => setConfirmEliminar(true)}
            className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
          >
            Eliminar
          </button>
        )}
        {confirmEliminar && (
          <>
            <button
              type="button"
              onClick={handleEliminar}
              disabled={eliminando}
              className="px-3 py-2 text-xs font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {eliminando ? '…' : '¿Confirmar?'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmEliminar(false)}
              className="px-3 py-2 text-xs text-gray-400 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              No
            </button>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      <SubiendoArchivo
        abierto={subiendo}
        icono={Iconos.navegacion.firmas}
        etiqueta="Subiendo firma"
        detalle="No cierres esta página."
      />
    </section>
  )
}
