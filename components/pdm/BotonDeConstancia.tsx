'use client'

/**
 * «Constancia (PDF)»: baja la constancia de UNA versión de reporte, con su código y su QR de verificación pública (migración 072).
 *
 * Se pide al servidor con `fetch` y se baja como archivo, no con un enlace: así, si algo falla (no tiene acceso, la base no
 * responde), se dice aquí mismo en vez de dejar un archivo roto en la carpeta de descargas. La primera vez que alguien la pide
 * se emite el código de esa versión; desde entonces es siempre el mismo.
 */

import { useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { T } from './tema'

type Estado = 'quieto' | 'generando' | 'error'

export default function BotonDeConstancia({ reporteId }: { reporteId: string }) {
  const [estado, setEstado] = useState<Estado>('quieto')

  async function descargar() {
    setEstado('generando')
    try {
      const r = await fetch(`/api/pdm-constancia/${reporteId}`, { credentials: 'same-origin' })
      if (!r.ok) throw new Error(String(r.status))
      const nombre = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? 'constancia.pdf'
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a')
      a.href = url; a.download = nombre
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setEstado('quieto')
    } catch {
      setEstado('error')
    }
  }

  return (
    <div className="mt-2.5">
      <button type="button" onClick={descargar} disabled={estado === 'generando'} aria-busy={estado === 'generando'} className={T.botonSecChico}>
        <Icono glifo={Iconos.dominio.verificacion} tamano="sm" />
        {estado === 'generando' ? 'Generando…' : 'Constancia (PDF)'}
      </button>
      {estado === 'error' && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-[#B42318]">No se pudo generar la constancia. Vuelve a intentarlo en unos minutos.</p>
      )}
    </div>
  )
}
