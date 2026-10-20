'use client'

/**
 * «Constancia (PDF)» y «Paquete (ZIP)»: bajan, de UNA versión de reporte, su constancia con el código y el QR de verificación
 * pública (migración 072) y el paquete completo —constancia, archivos originales y listado de huellas—.
 *
 * Se piden al servidor con `fetch` y se bajan como archivo, no con un enlace: así, si algo falla (no tiene acceso, la base no
 * responde, los archivos pesan demasiado) se dice aquí mismo en vez de dejar un archivo roto en la carpeta de descargas. La primera
 * vez que alguien pide la constancia de una versión se emite su código; desde entonces es siempre el mismo.
 *
 * Si al empaquetar un archivo NO coincide con la huella que se registró al subirlo, el paquete baja igual (marcado en su LEEME)
 * y aquí se avisa con todas las letras: es lo más importante que puede decir este botón.
 */

import { useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import type { LucideIcon } from '@/lib/iconos'
import { T } from './tema'

type Estado = 'quieto' | 'generando' | 'error'

function useDescarga(url: string, respaldo: string) {
  const [estado, setEstado] = useState<Estado>('quieto')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [alerta, setAlerta] = useState<string | null>(null)

  async function descargar() {
    setEstado('generando'); setMensaje(null); setAlerta(null)
    try {
      const r = await fetch(url, { credentials: 'same-origin' })
      if (!r.ok) {
        // 413 y 502 traen su frase (pesa demasiado; no se pudo leer un archivo); el resto, la de siempre.
        const frase = r.status === 413 || r.status === 502 ? (await r.text()).slice(0, 300) : ''
        throw new Error(frase)
      }
      const nombre = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? respaldo
      const discrepancias = Number(r.headers.get('X-Paquete-Discrepancias') ?? 0)
      const href = URL.createObjectURL(await r.blob())
      const a = document.createElement('a')
      a.href = href; a.download = nombre
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(href), 10_000)
      setEstado('quieto')
      if (discrepancias > 0) {
        setAlerta(`Atención: ${discrepancias === 1 ? 'un archivo NO coincide' : `${discrepancias} archivos NO coinciden`} con la huella que se registró al subirse. El paquete bajó, pero no lo uses como prueba sin avisar al administrador (el LEEME lo explica).`)
      }
    } catch (e) {
      setEstado('error')
      setMensaje(e instanceof Error && e.message ? e.message : null)
    }
  }
  return { estado, mensaje, alerta, descargar }
}

function Boton({ etiqueta, icono, estado, onClick }: { etiqueta: string; icono: LucideIcon; estado: Estado; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={estado === 'generando'} aria-busy={estado === 'generando'} className={T.botonSecChico}>
      <Icono glifo={icono} tamano="sm" />
      {estado === 'generando' ? 'Generando…' : etiqueta}
    </button>
  )
}

export default function BotonDeConstancia({ reporteId }: { reporteId: string }) {
  const constancia = useDescarga(`/api/pdm-constancia/${reporteId}`, 'constancia.pdf')
  const paquete = useDescarga(`/api/pdm-constancia/${reporteId}/paquete`, 'paquete.zip')
  const falla = (e: { estado: Estado; mensaje: string | null }, que: string) =>
    e.estado === 'error' && (
      <p role="alert" className="mt-1.5 text-xs font-medium text-[#B42318]">{e.mensaje ?? `No se pudo generar ${que}. Vuelve a intentarlo en unos minutos.`}</p>
    )
  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Boton etiqueta="Constancia (PDF)" icono={Iconos.dominio.verificacion} estado={constancia.estado} onClick={constancia.descargar} />
        <Boton etiqueta="Paquete (ZIP)" icono={Iconos.documentos.paquete} estado={paquete.estado} onClick={paquete.descargar} />
      </div>
      {falla(constancia, 'la constancia')}
      {falla(paquete, 'el paquete')}
      {paquete.alerta && <p role="alert" className="mt-1.5 text-xs font-semibold leading-snug text-[#912018]">{paquete.alerta}</p>}
    </div>
  )
}
