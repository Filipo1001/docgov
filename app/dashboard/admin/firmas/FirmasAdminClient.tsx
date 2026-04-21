'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { subirFirma } from '@/app/actions/periodos'
import { eliminarFirmaAdmin } from '@/app/actions/admin'
import type { ContratistaFirma } from './page'

// ─── Background removal + resize (same algorithm as perfil/page.tsx) ──────────

async function normalizarFirma(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objUrl)

      const MAX_W = 600, MAX_H = 200
      let w = img.naturalWidth, h = img.naturalHeight
      const ratio = Math.min(MAX_W / w, MAX_H / h, 1)
      w = Math.round(w * ratio)
      h = Math.round(h * ratio)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, w, h)

      const imageData = ctx.getImageData(0, 0, w, h)
      const data = imageData.data
      const PATCH = Math.min(8, Math.floor(w / 4), Math.floor(h / 4))
      const HARD = 40
      const SOFT = 80

      let rSum = 0, gSum = 0, bSum = 0, n = 0
      for (let py = 0; py < PATCH; py++) {
        for (let px = 0; px < PATCH; px++) {
          const corners = [
            (py * w + px) * 4,
            (py * w + (w - 1 - px)) * 4,
            ((h - 1 - py) * w + px) * 4,
            ((h - 1 - py) * w + (w - 1 - px)) * 4,
          ]
          for (const i of corners) {
            rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; n++
          }
        }
      }
      const bgR = rSum / n, bgG = gSum / n, bgB = bSum / n

      for (let i = 0; i < data.length; i += 4) {
        const dr = data[i] - bgR
        const dg = data[i + 1] - bgG
        const db = data[i + 2] - bgB
        const dist = Math.sqrt(dr * dr + dg * dg + db * db)
        if (dist < HARD) {
          data[i + 3] = 0
        } else if (dist < SOFT) {
          data[i + 3] = Math.round(((dist - HARD) / (SOFT - HARD)) * 255)
        }
      }
      ctx.putImageData(imageData, 0, 0)

      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('Error al procesar')) },
        'image/png', 0.95
      )
    }
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Imagen inválida')) }
    img.src = objUrl
  })
}

// ─── Card component ───────────────────────────────────────────────────────────

function FirmaCard({
  contratista,
  onUpdated,
}: {
  contratista: ContratistaFirma
  onUpdated: (id: string, newUrl: string | null) => void
}) {
  const [subiendo, setSubiendo] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const tieneFirma = !!contratista.firma_url

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
      const result = await subirFirma(formData, contratista.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Firma de ${contratista.nombre_completo.split(' ')[0]} actualizada ✓`)
        onUpdated(contratista.id, result.data?.url ?? null)
      }
    } catch {
      toast.error('Error al procesar la imagen')
    } finally {
      setSubiendo(false)
    }
  }

  async function handleEliminar() {
    setEliminando(true)
    const result = await eliminarFirmaAdmin(contratista.id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Firma eliminada')
      onUpdated(contratista.id, null)
      setConfirmEliminar(false)
    }
    setEliminando(false)
  }

  return (
    <div className={`bg-white rounded-2xl border p-4 flex flex-col gap-3 ${tieneFirma ? 'border-gray-200' : 'border-dashed border-gray-300'}`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
            {contratista.nombre_completo.split(' ').slice(0, 3).join(' ')}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Cto. {contratista.contrato_numero}-{contratista.contrato_anio}
          </p>
        </div>
        <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          tieneFirma ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {tieneFirma ? '✓ Con firma' : 'Sin firma'}
        </span>
      </div>

      {/* Signature preview */}
      <div className={`rounded-xl overflow-hidden flex items-center justify-center h-24 ${
        tieneFirma
          ? 'bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:16px_16px]'
          : 'bg-gray-50 border border-dashed border-gray-200'
      }`}>
        {tieneFirma ? (
          <img
            src={contratista.firma_url!}
            alt={`Firma de ${contratista.nombre_completo}`}
            className="max-h-20 max-w-full object-contain p-2"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-300">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span className="text-xs">Sin firma cargada</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {subiendo ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Procesando...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              {tieneFirma ? 'Reemplazar' : 'Subir firma'}
            </>
          )}
        </button>

        {tieneFirma && !confirmEliminar && (
          <button
            onClick={() => setConfirmEliminar(true)}
            className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
          >
            Eliminar
          </button>
        )}

        {confirmEliminar && (
          <button
            onClick={handleEliminar}
            disabled={eliminando}
            className="px-3 py-2 text-xs font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {eliminando ? '...' : '¿Confirmar?'}
          </button>
        )}

        {confirmEliminar && (
          <button
            onClick={() => setConfirmEliminar(false)}
            className="px-3 py-2 text-xs text-gray-400 border border-gray-200 rounded-xl hover:bg-gray-50"
          >
            No
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FirmasAdminClient({
  contratistas: initial,
}: {
  contratistas: ContratistaFirma[]
}) {
  const [contratistas, setContratistas] = useState(initial)
  const [filtro, setFiltro] = useState<'todos' | 'con' | 'sin'>('todos')

  function handleUpdated(id: string, newUrl: string | null) {
    setContratistas(prev =>
      prev.map(c => c.id === id ? { ...c, firma_url: newUrl } : c)
    )
  }

  const con  = contratistas.filter(c => !!c.firma_url).length
  const sin  = contratistas.filter(c => !c.firma_url).length

  const visibles = contratistas.filter(c =>
    filtro === 'con'  ?  !!c.firma_url :
    filtro === 'sin'  ? !c.firma_url   :
    true
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <Toaster richColors position="top-right" />

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Firmas digitales</h1>
          <p className="text-sm text-gray-500">Gestiona las firmas de los contratistas</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{contratistas.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total</p>
        </div>
        <div className="bg-green-50 rounded-2xl border border-green-100 p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{con}</p>
          <p className="text-xs text-green-600 mt-0.5">Con firma</p>
        </div>
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{sin}</p>
          <p className="text-xs text-amber-600 mt-0.5">Sin firma</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['todos', 'sin', 'con'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              filtro === f
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'todos' ? 'Todos' : f === 'con' ? `Con firma (${con})` : `Sin firma (${sin})`}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibles.map(c => (
          <FirmaCard
            key={c.id}
            contratista={c}
            onUpdated={handleUpdated}
          />
        ))}
      </div>

      {visibles.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <p className="text-sm">No hay contratistas en esta categoría</p>
        </div>
      )}

      {/* Help note */}
      <p className="text-xs text-gray-400 text-center pb-4">
        Al subir una imagen el sistema elimina el fondo automáticamente y la ajusta a 600×200 px · JPG, PNG o WEBP
      </p>
    </div>
  )
}
