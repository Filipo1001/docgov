'use client'

/**
 * Eliminación definitiva del contrato. Solo administrador.
 *
 * Se pide escribir el número del contrato para confirmar. No es un trámite
 * burocrático: el botón vive en una pantalla donde se está corrigiendo un
 * contrato concreto, y teclear su número obliga a comprobar CUÁL se está
 * borrando en vez de pulsar "confirmar" por inercia.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { eliminarContrato, type ResumenBorrado } from '@/app/actions/contratos'

export default function EliminarContrato({
  contratoId, numero, anio, resumen,
}: {
  contratoId: string
  numero: string
  anio: number
  resumen: ResumenBorrado
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [borrando, setBorrando] = useState(false)

  async function borrar() {
    setBorrando(true)
    const res = await eliminarContrato(contratoId, texto)
    setBorrando(false)
    if (res.error) { toast.error(res.error); return }
    toast.success(`Contrato ${res.data!.numero} eliminado`)
    router.push('/dashboard/contratos')
    router.refresh()
  }

  // Sin informes presentados no hay nada que borrar salvo la configuración;
  // con ellos, la vía es cerrar por estado y así se explica.
  if (!resumen.puedeBorrarse) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
          Eliminar contrato
        </h3>
        <p className="text-xs text-gray-500">{resumen.motivo}</p>
      </div>
    )
  }

  const arrastra = [
    resumen.obligaciones && `${resumen.obligaciones} obligaciones`,
    resumen.periodos && `${resumen.periodos} periodos`,
    resumen.evidencias && `${resumen.evidencias} imágenes`,
    resumen.documentos && `${resumen.documentos} documentos`,
  ].filter(Boolean) as string[]

  return (
    <div className="bg-white rounded-2xl border border-red-200 p-6">
      <h3 className="text-sm font-medium text-red-500 uppercase tracking-wide mb-2">
        Eliminar contrato
      </h3>

      {!abierto ? (
        <>
          <p className="text-xs text-gray-500 mb-3">
            Este contrato aún no tiene informes presentados, así que puede eliminarse.
            {arrastra.length > 0 && <> Se borrarán también {arrastra.join(', ')}.</>}
            {' '}La acción no se puede deshacer.
          </p>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
          >
            Eliminar este contrato
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-600">
            Se eliminará el contrato <strong>{numero}-{anio}</strong>
            {arrastra.length > 0 && <> junto con {arrastra.join(', ')}</>}.
            Los archivos asociados se borrarán del almacenamiento. Esto no se puede deshacer.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Escribe <span className="font-mono font-semibold text-gray-700">{numero}</span> para confirmar
            </label>
            <input
              autoFocus
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder={numero}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={borrar}
              disabled={borrando || texto.trim() !== numero}
              className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              {borrando ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
            <button
              type="button"
              onClick={() => { setAbierto(false); setTexto('') }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
