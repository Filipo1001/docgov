'use client'

/**
 * DIAGNÓSTICO TEMPORAL — retirar cuando el panel congelado quede resuelto.
 *
 * Se dibuja DENTRO del esqueleto del panel, que es el único estado donde hace
 * falta. Responde en pantalla —sin depender de registros ni de la consola del
 * usuario— las tres preguntas que quedaron sin contestar:
 *
 *   1. ¿Qué versión del código está corriendo este navegador? (varios arreglos
 *      parecían no surtir efecto; hay que descartar assets viejos en caché.)
 *   2. ¿En qué estado está la consulta del panel? Una consulta que nunca se
 *      lanza (fetchStatus 'idle') y una colgada ('fetching' eterno) se ven
 *      idénticas desde fuera y piden arreglos opuestos.
 *   3. ¿Responde la capa de auth del navegador?
 */

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase'

export default function DiagnosticoPanel({ queryKey }: { queryKey: unknown[] }) {
  const queryClient = useQueryClient()
  const [segundos, setSegundos] = useState(0)
  const [auth, setAuth] = useState('midiendo…')
  const [consulta, setConsulta] = useState('—')

  useEffect(() => {
    const t = setInterval(() => {
      setSegundos(s => s + 1)
      const q = queryClient.getQueryCache().find({ queryKey })
      setConsulta(q ? `${q.state.status}/${q.state.fetchStatus}` : 'NO EXISTE')
    }, 1000)
    return () => clearInterval(t)
  }, [queryClient, queryKey])

  useEffect(() => {
    let vivo = true
    const inicio = Date.now()
    Promise.race([
      createClient().auth.getSession().then(() => 'responde'),
      new Promise<string>(r => setTimeout(() => r('COLGADO >5s'), 5000)),
    ])
      .then(r => { if (vivo) setAuth(`${r} (${Date.now() - inicio}ms)`) })
      .catch(e => { if (vivo) setAuth(`error: ${String(e).slice(0, 40)}`) })
    return () => { vivo = false }
  }, [])

  return (
    <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 font-mono text-[11px] leading-relaxed text-amber-900">
      <div className="mb-1 font-sans text-xs font-semibold">Diagnóstico temporal</div>
      <div>versión: {process.env.NEXT_PUBLIC_COMMIT ?? '?'}</div>
      <div>consulta: {consulta}</div>
      <div>auth: {auth}</div>
      <div>en pantalla: {segundos}s · red: {typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'OFFLINE'}</div>
    </div>
  )
}
