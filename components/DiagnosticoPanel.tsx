'use client'

/**
 * DIAGNÓSTICO TEMPORAL — retirar cuando el panel congelado quede resuelto.
 *
 * Insignia flotante, siempre montada en /dashboard: sobrevive a TODOS los
 * estados de la pantalla (cargando, sin usuario, panel dibujado), porque el
 * fallo que perseguimos solo aparece tras dejar la sesión inactiva y hay que
 * poder fotografiarlo entonces, no durante la carga inicial.
 *
 * Lleva una bitácora de transiciones con marca de tiempo: en un fallo que
 * tarda horas en aparecer, importa tanto el estado final como el momento en
 * que se torció.
 */

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase'

type Props = {
  queryKey: unknown[]
  cargando: boolean
  hayUsuario: boolean
  sesionExpirada: boolean
}

const hora = () => new Date().toLocaleTimeString('es-CO', { hour12: false })

export default function DiagnosticoPanel({ queryKey, cargando, hayUsuario, sesionExpirada }: Props) {
  const queryClient = useQueryClient()
  const [abierto, setAbierto] = useState(true)
  const [consulta, setConsulta] = useState('—')
  const [auth, setAuth] = useState('—')
  const [bitacora, setBitacora] = useState<string[]>([])
  const ultimo = useRef('')

  // Estado de la consulta, en vivo + bitácora de cambios
  useEffect(() => {
    const t = setInterval(() => {
      const q = queryClient.getQueryCache().find({ queryKey })
      const estado = q ? `${q.state.status}/${q.state.fetchStatus}` : 'NO EXISTE'
      const linea = `${estado} carg:${cargando ? 'sí' : 'no'} usr:${hayUsuario ? 'sí' : 'NO'}${sesionExpirada ? ' EXPIRADA' : ''}`
      setConsulta(estado)
      if (linea !== ultimo.current) {
        ultimo.current = linea
        setBitacora(b => [...b.slice(-7), `${hora()} ${linea}`])
      }
    }, 1000)
    return () => clearInterval(t)
  }, [queryClient, queryKey, cargando, hayUsuario, sesionExpirada])

  // ¿Responde la capa de auth del navegador? Se remide al volver a la pestaña,
  // que es justo cuando se sospecha que deja de responder.
  useEffect(() => {
    const medir = () => {
      const inicio = Date.now()
      Promise.race([
        createClient().auth.getSession().then(() => 'ok'),
        new Promise<string>(r => setTimeout(() => r('COLGADO>5s'), 5000)),
      ])
        .then(r => setAuth(`${r} ${Date.now() - inicio}ms @${hora()}`))
        .catch(e => setAuth(`error ${String(e).slice(0, 30)}`))
    }
    medir()
    const alVolver = () => { if (document.visibilityState === 'visible') medir() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('pageshow', alVolver)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('pageshow', alVolver)
    }
  }, [])

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="fixed bottom-3 left-3 z-50 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-semibold text-white shadow-lg"
      >
        diag
      </button>
    )
  }

  return (
    <div className="fixed bottom-3 left-3 z-50 max-w-[19rem] rounded-xl border border-amber-300 bg-amber-50/95 p-3 font-mono text-[11px] leading-snug text-amber-900 shadow-lg backdrop-blur">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="font-sans text-xs font-semibold">Diagnóstico temporal</span>
        <button onClick={() => setAbierto(false)} className="font-sans text-xs underline">ocultar</button>
      </div>
      <div>versión: {process.env.NEXT_PUBLIC_COMMIT ?? '?'}</div>
      <div>consulta: {consulta}</div>
      <div>auth: {auth}</div>
      <div>
        red: {typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'OFFLINE'}
        {' · '}sesión: {sesionExpirada ? 'EXPIRADA' : hayUsuario ? 'ok' : 'SIN USUARIO'}
      </div>
      {bitacora.length > 0 && (
        <div className="mt-1 border-t border-amber-300 pt-1">
          {bitacora.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  )
}
