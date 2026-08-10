'use client'

import { useState, useEffect, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import {
  actualizarMunicipio, subirFirmaMunicipio, obtenerFirmaMunicipio, eliminarFirmaMunicipio,
} from '@/app/actions/admin'
import type { MunicipioAdmin } from '@/services/admin'

export default function MunicipioClient({ municipio }: { municipio: MunicipioAdmin | null }) {
  const [saving, setSaving] = useState(false)

  const [nombre, setNombre]           = useState(municipio?.nombre ?? '')
  const [departamento, setDepartamento] = useState(municipio?.departamento ?? '')
  const [nit, setNit]                 = useState(municipio?.nit ?? '')
  const [repLegal, setRepLegal]       = useState(municipio?.representante_legal ?? '')
  const [cedulaRep, setCedulaRep]     = useState(municipio?.cedula_representante ?? '')

  // Firma del alcalde. El bucket es privado, así que la vista previa va por
  // URL firmada; nunca se pinta la URL cruda.
  const [firma, setFirma] = useState<string | null>(null)
  const [subiendoFirma, setSubiendoFirma] = useState(false)
  const firmaInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { obtenerFirmaMunicipio().then(setFirma).catch(() => {}) }, [])

  async function handleSubirFirma(file: File) {
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED.includes(file.type)) {
      toast.error('Solo se permiten imágenes JPG, PNG o WEBP')
      return
    }
    setSubiendoFirma(true)
    const fd = new FormData()
    fd.append('file', file)
    const result = await subirFirmaMunicipio(fd)
    setSubiendoFirma(false)
    if (result.error) toast.error(result.error)
    else { setFirma(result.data?.url ?? null); toast.success('Firma del alcalde actualizada') }
  }

  async function handleEliminarFirma() {
    const result = await eliminarFirmaMunicipio()
    if (result.error) toast.error(result.error)
    else { setFirma(null); toast.success('Firma eliminada') }
  }

  if (!municipio) {
    return (
      <div className="p-8 text-center text-gray-500">
        No se encontró información del municipio. Verifique la base de datos.
      </div>
    )
  }

  async function handleSave() {
    setSaving(true)
    const result = await actualizarMunicipio(municipio!.id, {
      nombre,
      departamento,
      nit,
      representante_legal: repLegal,
      cedula_representante: cedulaRep,
    })
    setSaving(false)
    if (result.error) toast.error(result.error)
    else toast.success('Datos del municipio actualizados')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <Toaster richColors />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Municipio</h1>
        <p className="text-sm text-gray-500 mt-1">
          Estos datos aparecen en los documentos PDF generados (Cuenta de Cobro, Informe de Actividades).
        </p>
      </div>

      {/* Datos generales */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Datos generales</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del municipio</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej. Fredonia"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Departamento</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={departamento}
              onChange={e => setDepartamento(e.target.value)}
              placeholder="Ej. Antioquia"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NIT</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={nit}
              onChange={e => setNit(e.target.value)}
              placeholder="Ej. 890980848-1"
            />
          </div>
        </div>
      </div>

      {/* Representante legal */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Representante legal</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del representante legal</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={repLegal}
              onChange={e => setRepLegal(e.target.value)}
              placeholder="Ej. Aldubar de Jesús Vanegas Marín"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cédula del representante</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={cedulaRep}
              onChange={e => setCedulaRep(e.target.value)}
              placeholder="Ej. 8.461.720"
            />
          </div>
        </div>

        {/* Firma del alcalde ─────────────────────────────────────
            Se estampa en el Acta de Terminación cuando el supervisor aprueba
            el último informe del contrato. */}
        <div className="pt-4 border-t border-gray-100">
          <label className="block text-sm font-medium text-gray-700">Firma del representante legal</label>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            Se estampa en el Acta de Terminación cuando el supervisor aprueba el último informe del
            contrato. Imagen con fondo transparente, preferiblemente PNG.
          </p>

          <input
            ref={firmaInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleSubirFirma(f); e.target.value = '' }}
          />

          {firma ? (
            <div className="flex items-end gap-4 flex-wrap">
              <div className="border border-gray-200 rounded-xl px-4 py-3 bg-[repeating-conic-gradient(#F3F4F6_0%_25%,#FFFFFF_0%_50%)] bg-[length:16px_16px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={firma} alt="Firma del representante legal" className="h-16 object-contain" />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => firmaInputRef.current?.click()}
                  disabled={subiendoFirma}
                  className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {subiendoFirma ? 'Subiendo…' : 'Reemplazar'}
                </button>
                <button
                  type="button"
                  onClick={handleEliminarFirma}
                  disabled={subiendoFirma}
                  className="text-sm px-4 py-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => firmaInputRef.current?.click()}
              disabled={subiendoFirma}
              className="text-sm px-4 py-2.5 rounded-lg border border-dashed border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {subiendoFirma ? 'Subiendo…' : 'Subir firma del alcalde'}
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 space-y-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Vista previa — encabezado de PDF
        </h2>
        <div className="text-center space-y-0.5 text-sm text-gray-800">
          <p className="font-bold uppercase">EL MUNICIPIO DE {nombre.toUpperCase() || '—'}</p>
          <p className="text-xs text-gray-500">NIT {nit || '—'} · {departamento || '—'}</p>
          <p className="text-xs text-gray-500 mt-1">
            Representante: {repLegal || '—'} · C.C. {cedulaRep || '—'}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
