'use client'

/**
 * Eliminación definitiva del contrato. Exclusiva del administrador.
 *
 * Sin restricciones por estado: se puede borrar un contrato aunque tenga
 * informes aprobados o radicados. Precisamente por eso la pantalla enumera lo
 * que se destruye antes de pedir confirmación, y destaca aparte los códigos de
 * verificación: esos códigos pueden estar impresos en documentos que ya
 * circulan fuera del sistema, y tras el borrado dejarán de resolver.
 *
 * Vive en Opciones avanzadas, en su propia pestaña, para que nunca aparezca
 * junto a las acciones del trabajo diario.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { eliminarContrato, resumenBorradoContrato, type ResumenBorrado } from '@/app/actions/contratos'

export default function EliminarContrato({
  contratoId, numero, anio,
}: {
  contratoId: string
  numero: string
  anio: number
}) {
  const router = useRouter()
  const [resumen, setResumen] = useState<ResumenBorrado | null>(null)
  const [texto, setTexto] = useState('')
  const [borrando, setBorrando] = useState(false)

  useEffect(() => {
    let vivo = true
    resumenBorradoContrato(contratoId)
      .then(r => { if (vivo) setResumen(r) })
      .catch(() => { if (vivo) setResumen(null) })
    return () => { vivo = false }
  }, [contratoId])

  async function borrar() {
    setBorrando(true)
    const res = await eliminarContrato(contratoId, texto)
    setBorrando(false)
    if (res.error) { toast.error(res.error); return }
    toast.success(`Contrato ${res.data!.numero} eliminado`)
    router.push('/dashboard/contratos')
    router.refresh()
  }

  const filas = resumen ? [
    { etiqueta: 'Obligaciones',           valor: resumen.obligaciones },
    { etiqueta: 'Periodos de pago',       valor: resumen.periodos },
    { etiqueta: 'Informes presentados',   valor: resumen.informesPresentados, grave: true },
    { etiqueta: 'Imágenes de evidencia',  valor: resumen.evidencias },
    { etiqueta: 'Documentos adjuntos',    valor: resumen.documentos },
  ] : []

  return (
    <div className="max-w-2xl">
      <div className="bg-white border border-red-200 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-red-700 mb-1">Eliminar contrato</h3>
        <p className="text-sm text-gray-600 mb-5">
          Se borrará el contrato <strong>{numero}-{anio}</strong> y todo lo que cuelga de él.
          Esta acción no se puede deshacer.
        </p>

        {resumen === null ? (
          <p className="text-sm text-gray-400 py-4">Calculando lo que se eliminaría…</p>
        ) : (
          <>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mb-4">
              {filas.map(f => (
                <div key={f.etiqueta} className="flex items-center justify-between px-4 py-2">
                  <span className={`text-sm ${f.valor > 0 && f.grave ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                    {f.etiqueta}
                  </span>
                  <span className={`text-sm tabular-nums ${
                    f.valor === 0 ? 'text-gray-300'
                      : f.grave ? 'text-red-700 font-semibold' : 'text-gray-900 font-medium'
                  }`}>
                    {f.valor}
                  </span>
                </div>
              ))}
            </div>

            {/* La consecuencia que no se ve en un contador: documentos ya
                entregados cuyo QR dejará de funcionar. */}
            {resumen.codigosVerificacion > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <p className="text-sm text-red-800">
                  <strong>{resumen.codigosVerificacion} código(s) de verificación</strong> quedarán sin
                  respaldo. Si alguno está impreso en un documento ya entregado, al escanear su QR
                  dejará de encontrarse.
                </p>
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Escribe <span className="font-mono font-semibold text-gray-700">{numero}</span> para confirmar
              </label>
              <input
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder={numero}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              />
            </div>

            <button
              type="button"
              onClick={borrar}
              disabled={borrando || texto.trim() !== numero}
              className="bg-red-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              {borrando ? 'Eliminando…' : 'Eliminar contrato definitivamente'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
