/**
 * Las dos piezas con que el módulo muestra a una persona: su cara y su contrato.
 *
 * Están aparte porque las usan la lista de Responsables y la ficha de cada
 * indicador, y tienen que verse idénticas en las dos.
 */

import { avatarThumb } from '@/lib/avatar'
import { describirContrato, type ContratoResumen, type TonoContrato } from '@/lib/pdm/contrato'
import { iniciales } from '@/lib/pdm/personas'

const TAMANOS = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm' } as const

/**
 * Foto, o las iniciales si no la hay (87 de 120 contratistas la tienen).
 * `apagado` es para quien todavía no tiene usuario: gris, sin color de marca.
 */
export function Avatar({ nombre, fotoUrl, tamano = 'md', apagado = false }: {
  nombre: string
  fotoUrl?: string | null
  tamano?: keyof typeof TAMANOS
  apagado?: boolean
}) {
  const dim = TAMANOS[tamano]
  if (fotoUrl) {
    return (
      <img
        src={avatarThumb(fotoUrl) ?? fotoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${dim} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={`${dim} flex shrink-0 items-center justify-center rounded-full font-semibold leading-none ${
        apagado ? 'bg-gray-100 text-gray-500' : 'bg-teal-100 text-teal-800'
      }`}
    >
      {iniciales(nombre)}
    </span>
  )
}

const TONO: Record<TonoContrato, string> = {
  ok: 'text-gray-500',
  pronto: 'font-medium text-amber-700',
  vencido: 'font-medium text-red-700',
  neutro: 'text-gray-500',
}

/** «Contrato 224 de 2026 · vence el 31 dic 2026». El color avisa: ámbar si vence en 30 días, rojo si ya terminó. */
export function LineaContrato({ contrato, className = '' }: { contrato: ContratoResumen; className?: string }) {
  const { texto, tono } = describirContrato(contrato)
  if (texto === '') return null
  return <p className={`text-xs ${TONO[tono]} ${className}`}>{texto}</p>
}
