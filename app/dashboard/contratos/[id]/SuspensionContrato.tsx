'use client'

/**
 * Suspensión de la ejecución del contrato, en su ficha (migración 082).
 *
 * Un contrato suspendido sigue vigente: no pide informes mientras dure la suspensión. Quien gestiona (admin, contratación
 * y el supervisor del contrato) la registra con fecha, motivo y acta, y la reinicia con la fecha del acta de reinicio.
 * Si el plazo debe extenderse por los días suspendidos, eso se registra aparte como prórroga (otrosí).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { registrarSuspension, reiniciarSuspension, type SuspensionAbierta } from '@/app/actions/suspension-contrato'
import { fechaLarga } from '@/lib/terminacion-contrato'

const CAMPO = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60'
const ETIQUETA = 'block text-xs font-medium text-gray-500 mb-1'

export default function SuspensionContrato({
  contrato,
  suspension,
  puedeGestionar,
}: {
  contrato: { id: string; estado: string; fecha_inicio: string; fecha_fin_efectiva: string }
  suspension: SuspensionAbierta | null
  puedeGestionar: boolean
}) {
  if (suspension) return <Suspendido contratoId={contrato.id} suspension={suspension} puedeGestionar={puedeGestionar} />
  if (!puedeGestionar || contrato.estado !== 'vigente') return null
  return <Suspender contrato={contrato} />
}

function Suspendido({
  contratoId, suspension: s, puedeGestionar,
}: { contratoId: string; suspension: SuspensionAbierta; puedeGestionar: boolean }) {
  const router = useRouter()
  const [reiniciando, setReiniciando] = useState(false)
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [acto, setActo] = useState('')
  const [fechaActo, setFechaActo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function reiniciar() {
    setEnviando(true)
    const res = await reiniciarSuspension({ contratoId, fecha, numeroActo: acto, fechaActo: fechaActo || null })
    setEnviando(false)
    if (res.error) { toast.error(res.error); return }
    toast.success(`Contrato reiniciado tras ${res.data?.diasSuspendido ?? 0} días suspendido`)
    setReiniciando(false)
    router.refresh()
  }

  return (
    <section aria-labelledby="suspension-titulo" className="bg-white rounded-2xl border border-amber-200 p-6 mb-6">
      <h3 id="suspension-titulo" className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Suspendido</h3>
      <p className="text-sm text-gray-800">Desde el {fechaLarga(s.fechaInicio)}: {s.motivo}</p>
      <p className="text-xs text-gray-500 mt-1">
        {s.numeroActo || s.fechaActo
          ? `Acta ${s.numeroActo ? `N.º ${s.numeroActo}` : ''}${s.fechaActo ? ` del ${fechaLarga(s.fechaActo)}` : ''}. `
          : ''}
        Mientras dure la suspensión no se piden informes.
      </p>

      {puedeGestionar && !reiniciando && (
        <button type="button" onClick={() => setReiniciando(true)} className="mt-4 text-sm font-medium text-gray-500 hover:text-gray-800 underline decoration-gray-300 underline-offset-2">
          Reiniciar el contrato
        </button>
      )}

      {puedeGestionar && reiniciando && (
        <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="reinicio-fecha" className={ETIQUETA}>Fecha de reinicio <span className="text-red-500">*</span></label>
              <input id="reinicio-fecha" type="date" value={fecha} min={s.fechaInicio} onChange={e => setFecha(e.target.value)} className={CAMPO} />
            </div>
            <div>
              <label htmlFor="reinicio-acto" className={ETIQUETA}>N.º del acta de reinicio</label>
              <input id="reinicio-acto" type="text" value={acto} onChange={e => setActo(e.target.value)} placeholder="Opcional" className={CAMPO} />
            </div>
            <div>
              <label htmlFor="reinicio-fecha-acto" className={ETIQUETA}>Fecha del acta</label>
              <input id="reinicio-fecha-acto" type="date" value={fechaActo} onChange={e => setFechaActo(e.target.value)} className={CAMPO} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={reiniciar} disabled={enviando || !fecha} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors">
              {enviando ? 'Reiniciando…' : 'Registrar reinicio'}
            </button>
            <button type="button" onClick={() => setReiniciando(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          </div>
        </div>
      )}
    </section>
  )
}

function Suspender({ contrato }: { contrato: { id: string; fecha_inicio: string; fecha_fin_efectiva: string } }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [acto, setActo] = useState('')
  const [fechaActo, setFechaActo] = useState('')
  const [enviando, setEnviando] = useState(false)

  function cerrar() {
    setAbierto(false); setFecha(''); setMotivo(''); setActo(''); setFechaActo('')
  }

  async function registrar() {
    setEnviando(true)
    const res = await registrarSuspension({ contratoId: contrato.id, fecha, motivo, numeroActo: acto, fechaActo: fechaActo || null })
    setEnviando(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Suspensión registrada. No se pedirán informes mientras dure.')
    cerrar()
    router.refresh()
  }

  if (!abierto) {
    return (
      <div className="mb-6 flex justify-end">
        <button type="button" onClick={() => setAbierto(true)} className="text-sm font-medium text-gray-500 hover:text-gray-800 underline decoration-gray-300 underline-offset-2">
          Suspender la ejecución
        </button>
      </div>
    )
  }

  return (
    <section aria-labelledby="suspender-titulo" className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <h3 id="suspender-titulo" className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-1">Suspender la ejecución</h3>
      <p className="text-xs text-gray-500 mb-4 max-w-2xl">
        El contrato sigue vigente, pero no se piden informes hasta que se reinicie. Si el plazo debe extenderse por los días
        suspendidos, eso se registra después como prórroga.
      </p>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="suspension-fecha" className={ETIQUETA}>Fecha de la suspensión <span className="text-red-500">*</span></label>
            <input id="suspension-fecha" type="date" value={fecha} min={contrato.fecha_inicio} max={contrato.fecha_fin_efectiva} onChange={e => setFecha(e.target.value)} className={CAMPO} />
          </div>
          <div>
            <label htmlFor="suspension-acto" className={ETIQUETA}>N.º del acta</label>
            <input id="suspension-acto" type="text" value={acto} onChange={e => setActo(e.target.value)} placeholder="Opcional" className={CAMPO} />
          </div>
          <div>
            <label htmlFor="suspension-fecha-acto" className={ETIQUETA}>Fecha del acta</label>
            <input id="suspension-fecha-acto" type="date" value={fechaActo} onChange={e => setFechaActo(e.target.value)} className={CAMPO} />
          </div>
        </div>
        <div>
          <label htmlFor="suspension-motivo" className={ETIQUETA}>Motivo <span className="text-red-500">*</span></label>
          <textarea id="suspension-motivo" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Licencia de maternidad de la contratista" className={`${CAMPO} resize-none`} />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button type="button" onClick={registrar} disabled={enviando || !fecha || !motivo.trim()} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors">
            {enviando ? 'Registrando…' : 'Registrar suspensión'}
          </button>
          <button type="button" onClick={cerrar} className="text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
        </div>
      </div>
    </section>
  )
}
