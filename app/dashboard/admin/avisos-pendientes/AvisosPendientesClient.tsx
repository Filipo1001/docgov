'use client'

/**
 * Reenvío de avisos de radicado que nunca salieron por correo.
 *
 * La pantalla existe para que el envío sea una decisión humana y visible: son
 * contratistas reales y un correo no se puede recoger. Primero se ve a quién
 * le falta el aviso; enviar es un segundo paso, explícito.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import PageHeader from '@/components/ui/PageHeader'
import { listarPendientes, reenviarAvisos, type AvisoPendiente } from '@/app/actions/reenvio-avisos'

export default function AvisosPendientesClient() {
  const [pendientes, setPendientes] = useState<AvisoPendiente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [resumen, setResumen] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    const res = await listarPendientes()
    if (res.error) setError(res.error)
    else { setPendientes(res.data ?? []); setError(null) }
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  async function enviar() {
    setEnviando(true)
    setConfirmando(false)
    const res = await reenviarAvisos(pendientes.map(p => p.periodoId))
    setEnviando(false)
    if (res.error) { toast.error(res.error); return }
    const { enviados = 0, omitidos = 0, fallidos = [] } = res.data ?? {}
    setResumen(
      `${enviados} aviso(s) enviado(s)` +
      (omitidos ? ` · ${omitidos} omitido(s) por estar ya marcados` : '') +
      (fallidos.length ? ` · ${fallidos.length} fallido(s)` : ''),
    )
    if (fallidos.length) toast.error(`${fallidos.length} no se pudieron enviar`)
    else toast.success(`${enviados} aviso(s) enviado(s)`)
    cargar()
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Avisos de radicado pendientes"
        subtitle="Radicaciones cuyo correo nunca salió por el límite de envío ya corregido"
      />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Antes de enviar</p>
        <p className="mt-1">
          De estos avisos no consta que el correo saliera. En cada tanda pudieron
          entregarse los primeros antes de que el límite empezara a rechazar, así
          que alguien podría recibirlo por segunda vez. Reenviar deja el registro
          marcado: ejecutarlo de nuevo no vuelve a escribirle a nadie.
        </p>
      </div>

      {cargando && <p className="text-gray-500">Consultando…</p>}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {resumen && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{resumen}</div>
      )}

      {!cargando && !error && pendientes.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          No hay avisos pendientes de reenviar.
        </div>
      )}

      {pendientes.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Contratista</th>
                  <th className="px-4 py-3">Correo</th>
                  <th className="px-4 py-3">Periodo</th>
                  <th className="px-4 py-3">Contrato</th>
                  <th className="px-4 py-3">Radicado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendientes.map(p => (
                  <tr key={p.notificacionId}>
                    <td className="px-4 py-2.5">{p.nombre}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.email}</td>
                    <td className="px-4 py-2.5">{p.mes} {p.anio}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.contrato}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.numeroRadicado ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!confirmando ? (
            <button
              onClick={() => setConfirmando(true)}
              disabled={enviando}
              className="rounded-xl bg-[#192031] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Reenviar {pendientes.length} aviso(s)
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
              <span className="text-sm">
                Se enviarán <strong>{pendientes.length}</strong> correos reales. ¿Confirmas?
              </span>
              <button
                onClick={enviar}
                disabled={enviando}
                className="rounded-xl bg-[#192031] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {enviando ? 'Enviando…' : 'Sí, enviar'}
              </button>
              <button
                onClick={() => setConfirmando(false)}
                disabled={enviando}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500">
            El envío va espaciado para respetar el límite de Resend: unos {Math.ceil(pendientes.length * 0.55)} s en total.
          </p>
        </>
      )}
    </div>
  )
}
