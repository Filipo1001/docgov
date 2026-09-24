'use client'

/**
 * Correo masivo del administrador.
 *
 * ── EL ORDEN DE LA PANTALLA ──────────────────────────────────────────────
 *
 * A quién · Qué dice · Cómo se ve · Enviar. En ese orden y sin saltárselo:
 * la vista previa no es un extra escondido detrás de un enlace, es el paso
 * anterior al botón. Un correo a más de cien personas no se manda a ciegas, y
 * la pantalla está construida para que no se pueda.
 *
 * La lista de destinatarios se enseña ENTERA, con nombre y dirección. No un
 * número: los números no dejan ver que alguien está repetido, o que hay una
 * dirección con una errata, o que falta quien uno esperaba.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { previsualizarDestinatarios } from '@/app/actions/correo-masivo'
import {
  FILTROS, cuerpoAHtml, primerNombreDe,
  ASUNTO_PREDEFINIDO, MENSAJE_PREDEFINIDO,
  ASUNTO_RECORDATORIO, MENSAJE_RECORDATORIO,
  type FiltroMasivo, type Previsualizacion,
} from '@/lib/correo-masivo'
import { MARCA } from '@/lib/marca'
import { LogoCD } from '@/components/Logo'

/** Los dos avisos que la alcaldía manda de verdad. No es un sistema de
 *  plantillas: son borradores, se cargan y se editan encima. */
const PLANTILLAS = [
  { id: 'induccion',    label: 'Inducción virtual',      asunto: ASUNTO_PREDEFINIDO,  cuerpo: MENSAJE_PREDEFINIDO,  filtro: 'todos' as FiltroMasivo },
  { id: 'recordatorio', label: 'Recordatorio de informe', asunto: ASUNTO_RECORDATORIO, cuerpo: MENSAJE_RECORDATORIO, filtro: 'pendientes' as FiltroMasivo },
] as const

interface Parte {
  enviados: number
  fallidos: { email: string; error: string }[]
  excluidos: number
  alcanceReal: number
  candado: string | null
}

export default function CorreoMasivoClient() {
  const [filtro, setFiltro]   = useState<FiltroMasivo>('todos')
  const [asunto, setAsunto]   = useState(ASUNTO_PREDEFINIDO)
  const [mensaje, setMensaje] = useState(MENSAJE_PREDEFINIDO)
  const [previa, setPrevia]   = useState<Previsualizacion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [parte, setParte]       = useState<Parte | null>(null)
  const [verLista, setVerLista] = useState(false)

  const cargar = useCallback(async (f: FiltroMasivo) => {
    setCargando(true)
    const res = await previsualizarDestinatarios(f)
    if (res.error) toast.error(res.error)
    setPrevia(res.data ?? null)
    setCargando(false)
  }, [])

  useEffect(() => { void cargar(filtro) }, [filtro, cargar])

  const candado = previa?.candado ?? null
  const total = previa?.destinatarios.length ?? 0
  const listo = asunto.trim().length > 0 && mensaje.trim().length > 0 && total > 0

  async function enviar() {
    if (!listo || enviando) return
    const aviso = candado
      ? `El candado está puesto: esto envía UN correo, a ${candado}. ¿Continuar?`
      : `Vas a enviar este correo a ${total} personas. Esta acción no se puede deshacer. ¿Continuar?`
    if (!window.confirm(aviso)) return

    setEnviando(true)
    setParte(null)
    try {
      const res = await fetch('/api/admin/correo-masivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filtro, asunto, mensaje }),
      })
      const datos = await res.json()
      if (!res.ok) { toast.error(datos.error ?? 'No se pudo enviar'); return }
      setParte(datos as Parte)
      toast.success(`${datos.enviados} correo(s) enviado(s)`)
    } catch {
      toast.error('Se perdió la conexión durante el envío. Revisa antes de reintentar: puede haber salido una parte.')
    } finally {
      setEnviando(false)
    }
  }

  const nombreEjemplo = primerNombreDe(previa?.destinatarios[0]?.nombre_completo ?? 'Nombre')

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Correo masivo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Un aviso a todos los usuarios del sistema. Sale con el sobre de
          Contratista Digital, personalizado con el nombre de cada quien.
        </p>
      </div>

      {/* El candado, dicho en grande y sin eufemismos. */}
      {candado && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Candado de pruebas puesto</p>
          <p className="text-[13px] text-amber-800 leading-relaxed mt-1">
            Por más destinatarios que muestre la lista, el envío sale
            únicamente a <strong>{candado}</strong>. Se quita cambiando
            <code className="mx-1 px-1.5 py-0.5 bg-amber-100 rounded text-[12px]">CANDADO_DESTINO</code>
            a <code className="px-1.5 py-0.5 bg-amber-100 rounded text-[12px]">null</code> en
            <code className="ml-1 px-1.5 py-0.5 bg-amber-100 rounded text-[12px]">lib/correo-masivo.ts</code>.
          </p>
        </div>
      )}

      {/* 1 · A quién */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">1 · A quién</h2>
        <div className="grid sm:grid-cols-3 gap-2.5">
          {FILTROS.map(f => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                filtro === f.id
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="block text-sm font-semibold text-gray-900">{f.label}</span>
              <span className="block text-[11px] text-gray-500 leading-tight mt-0.5">{f.detalle}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-baseline justify-between gap-3 flex-wrap">
          <p className="text-sm text-gray-600">
            {cargando
              ? 'Contando…'
              : <><strong className="text-gray-900">{total}</strong> destinatarios
                  {previa && previa.excluidos > 0 && (
                    <span className="text-gray-400"> · {previa.excluidos} sin correo real, fuera</span>
                  )}</>}
          </p>
          {total > 0 && (
            <button
              onClick={() => setVerLista(v => !v)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {verLista ? 'Ocultar la lista' : 'Ver la lista completa'}
            </button>
          )}
        </div>

        {verLista && previa && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
            {previa.destinatarios.map(d => (
              <div key={d.email} className="px-3 py-2 flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-gray-700 truncate">{d.nombre_completo}</span>
                <span className="text-[11px] text-gray-400 shrink-0">{d.email}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2 · Qué dice */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900">2 · Qué dice</h2>
          <div className="flex gap-2">
            {PLANTILLAS.map(pl => (
              <button
                key={pl.id}
                onClick={() => { setAsunto(pl.asunto); setMensaje(pl.cuerpo); setFiltro(pl.filtro) }}
                className="text-[11px] font-medium text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-full px-3 py-1 transition-colors"
              >
                {pl.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-gray-400 -mt-2">
          Cargar un borrador reemplaza el asunto, el mensaje y el destinatario.
        </p>

        <div>
          <label htmlFor="asunto" className="block text-xs text-gray-500 mb-1">Asunto</label>
          <input
            id="asunto"
            value={asunto}
            onChange={e => setAsunto(e.target.value)}
            placeholder="Inducción virtual a Contratista Digital"
            className="w-full px-3 py-2.5 border border-gray-200 bg-gray-50 rounded-xl text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500"
          />
        </div>

        <div>
          <label htmlFor="mensaje" className="block text-xs text-gray-500 mb-1">Mensaje</label>
          <textarea
            id="mensaje"
            value={mensaje}
            onChange={e => setMensaje(e.target.value)}
            rows={9}
            placeholder={'Hola {{nombre}},\n\nMañana…'}
            className="w-full px-3 py-2.5 border border-gray-200 bg-gray-50 rounded-xl text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500 leading-relaxed"
          />
          <ul className="text-[11px] text-gray-400 mt-2 space-y-1 leading-relaxed">
            <li>
              <code className="px-1 py-0.5 bg-gray-100 rounded">{'{{nombre}}'}</code> se
              reemplaza por el nombre de pila de cada persona. Da igual cómo lo escribas.
            </li>
            <li>Una línea en blanco separa párrafos.</li>
            <li>Un párrafo que empieza por un emoji sale resaltado en un recuadro.</li>
            <li>Una línea que sea solo un enlace se convierte en botón.</li>
          </ul>
        </div>
      </section>

      {/* 3 · Cómo se ve */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">3 · Cómo se ve</h2>
        <p className="text-[11px] text-gray-400 mb-4">
          Tal como le va a llegar a {nombreEjemplo}.
        </p>

        {/* Réplica del sobre de lib/emails/templates.ts */}
        <div className="bg-[#f5f5f5] rounded-xl p-4 sm:p-6">
          <div className="max-w-[420px] mx-auto bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-white px-8 pt-7 pb-5 text-center border-b border-gray-100">
              <div className="w-[52px] h-[52px] rounded-2xl mx-auto flex items-center justify-center" style={{ background: MARCA }}>
                <LogoCD size={26} color="#fff" />
              </div>
            </div>
            <div className="px-7 py-5" style={{ background: MARCA }}>
              <p className="text-white text-[16px] font-semibold break-words">
                {asunto || 'El asunto va aquí'}
              </p>
            </div>
            <div className="px-7 py-6">
              {mensaje.trim() ? (
                <div dangerouslySetInnerHTML={{ __html: cuerpoAHtml(mensaje, nombreEjemplo) }} />
              ) : (
                <p className="text-[13px] text-gray-300 italic">El mensaje va aquí.</p>
              )}
              <div className="mt-6 text-center">
                <span className="inline-block bg-[#1a1a1a] text-white px-7 py-3 rounded-[10px] text-[13px] font-bold">
                  Abrir Contratista Digital
                </span>
              </div>
            </div>
            <div className="px-7 py-3.5 border-t border-gray-100 text-center">
              <p className="text-[11px] text-gray-400">Contratista Digital</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4 · Enviar */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">4 · Enviar</h2>

        <button
          onClick={() => void enviar()}
          disabled={!listo || enviando}
          className="w-full text-white font-semibold py-3.5 rounded-2xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#242F45]"
          style={{ backgroundColor: MARCA }}
        >
          {enviando
            ? 'Enviando…'
            : candado
              ? `Enviar la prueba a ${candado}`
              : `Enviar a ${total} personas`}
        </button>

        {!candado && total > 0 && (
          <p className="text-[11px] text-gray-400 text-center mt-3 leading-relaxed">
            Tarda alrededor de {Math.ceil((total * 0.55) / 60)} minuto(s): los correos
            salen espaciados para no chocar con el límite de envío. No cierres
            esta pestaña.
          </p>
        )}

        {parte && (
          <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-1.5">
            <p className="text-sm text-gray-900">
              <strong>{parte.enviados}</strong> correo(s) enviado(s)
              {parte.fallidos.length > 0 && <> · <strong className="text-red-600">{parte.fallidos.length}</strong> fallaron</>}
            </p>
            {parte.candado && (
              <p className="text-[12px] text-amber-700">
                Con el candado puesto. Sin él habría ido a {parte.alcanceReal} personas.
              </p>
            )}
            {parte.excluidos > 0 && (
              <p className="text-[12px] text-gray-500">
                {parte.excluidos} usuario(s) sin correo real quedaron fuera.
              </p>
            )}
            {parte.fallidos.map(f => (
              <p key={f.email} className="text-[12px] text-red-600">{f.email} — {f.error}</p>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
