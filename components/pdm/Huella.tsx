'use client'

/**
 * La huella (SHA-256) de una evidencia, dicha en una línea: «SHA-256 a3f9c2e1…81b4d6f0 · Copiar».
 *
 * Qué es, en una frase para quien la lea: identifica el contenido exacto del archivo; si cambia un solo bit, cambia. La
 * calcula el servidor al subirlo (migración 070). Para comprobarla, quien tiene el archivo calcula la suya y la compara con
 * la completa (se copia con el botón).
 *
 * Sin huella (no se pudo calcular) se dice, no se esconde: quien audita tiene que saber qué archivos no la tienen.
 *
 * No mueve nada al copiar: el botón conserva su ancho y el cambio de texto se anuncia a lectores de pantalla.
 */

import { useEffect, useRef, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { huellaCorta } from '@/lib/pdm/huella'
import { fechaHoraBogota } from '@/lib/pdm/historial'

/** Cuánto dura el «Copiada» antes de volver a «Copiar». */
const MS_COPIADA = 1800

/**
 * Copia un texto al portapapeles. Primero la vía moderna; si el navegador la niega (sin permiso, página sin foco, un
 * navegador que no la ofrece), el respaldo clásico con un campo escondido. Devuelve si se logró.
 */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // sigue con el respaldo
  }
  const campo = document.createElement('textarea')
  campo.value = texto
  campo.setAttribute('readonly', '')
  campo.setAttribute('aria-hidden', 'true')
  campo.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(campo)
  try {
    campo.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    campo.remove()
  }
}

export default function Huella({ sha256, calculadaEn, className = '' }: {
  sha256: string | null
  calculadaEn: string | null
  className?: string
}) {
  const [copiada, setCopiada] = useState(false)
  const [fallo, setFallo] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])

  if (!sha256) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-[#667085] ${className}`} title="No se pudo calcular la huella de este archivo cuando se subió.">
        <Icono glifo={Iconos.documentos.huella} tamano="sm" className="shrink-0" />
        Sin huella
      </span>
    )
  }

  async function copiar() {
    if (!sha256) return
    const logrado = await copiarTexto(sha256)
    // Si no se pudo, se dice; la huella completa sigue a la vista en el título de la línea.
    setFallo(!logrado)
    setCopiada(logrado)
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => { setCopiada(false); setFallo(false) }, MS_COPIADA)
  }

  const cuando = calculadaEn ? fechaHoraBogota(calculadaEn) : null
  return (
    <span className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#556072] ${className}`}>
      <span className="inline-flex items-center gap-1.5" title={`SHA-256 completa: ${sha256}${cuando ? ` · calculada por el servidor el ${cuando}` : ''}`}>
        <Icono glifo={Iconos.documentos.huella} tamano="sm" className="shrink-0 text-[#667085]" />
        <span>SHA-256</span>
        <code className="font-mono text-[11px] tabular-nums text-[#2D3648]">{huellaCorta(sha256)}</code>
      </span>
      <button
        type="button"
        onClick={copiar}
        className="inline-flex min-w-[6.25rem] items-center gap-1 rounded px-1 py-0.5 font-medium text-[#2D3648] underline decoration-[#C5CBD6] underline-offset-2 transition-colors hover:text-[#192031] hover:decoration-[#192031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031]"
      >
        <Icono glifo={copiada ? Iconos.estado.ok : Iconos.accion.copiar} tamano="sm" className="shrink-0" />
        <span aria-live="polite">{fallo ? 'No se pudo' : copiada ? 'Copiada' : 'Copiar'}</span>
      </button>
    </span>
  )
}
