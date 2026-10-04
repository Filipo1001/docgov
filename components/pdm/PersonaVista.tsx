'use client'

/**
 * Las dos piezas con que el módulo muestra a una persona: su cara y su contrato.
 *
 * Están aparte porque las usan la lista de Responsables y la ficha de cada
 * indicador, y tienen que verse idénticas en las dos.
 */

import { useState } from 'react'
import { avatarThumb } from '@/lib/avatar'
import { describirContrato, type ContratoResumen, type TonoContrato } from '@/lib/pdm/contrato'
import { iniciales } from '@/lib/pdm/personas'

/**
 * La escala de los medios (foto, icono) del módulo: dos tamaños, y cada uno dice para qué es.
 *
 *   sm  32 px   acompaña UNA línea de texto (la barra, una persona en una lista de chips).
 *   md  36 px   acompaña DOS líneas: nombre (20 px de línea) + subtítulo (16 px) = 36 px exactos. La foto mide lo que
 *               miden las líneas que identifica, ni más (se pasaba 4 px: sobresalía por arriba y por abajo del texto) ni menos.
 *
 * Y se ALINEA ARRIBA, con el nombre (`items-start`), no al centro del bloque: una persona con cuatro líneas de datos
 * (contrato, acceso…) tenía la foto flotando a media altura y el nombre más arriba que ella, y cada fila la dejaba en un
 * sitio distinto respecto de su nombre. Ver `IconoSector`, que sigue la misma escala.
 */
const TAMANOS = { sm: 'h-8 w-8 text-xs', md: 'h-9 w-9 text-sm' } as const

/**
 * Foto, o las iniciales si no la hay (87 de 120 contratistas la tienen).
 * `apagado` es para quien todavía no tiene usuario: gris, sin color de marca.
 *
 * Nunca muestra un hueco ni el icono de «imagen rota»: las iniciales están SIEMPRE debajo, la foto se funde
 * encima cuando llega, y si falla (un archivo borrado, una red caída) simplemente no aparece y quedan las
 * iniciales. Antes la foto era lo único que se pintaba: llegaba de golpe, y si no llegaba se veía el icono roto.
 *
 * `colores` cambia solo el fondo y el texto de las iniciales (por ejemplo, para la banda de tinta de la barra).
 */
export function Avatar({ nombre, fotoUrl, tamano = 'md', apagado = false, colores, className = '' }: {
  nombre: string
  fotoUrl?: string | null
  tamano?: keyof typeof TAMANOS
  apagado?: boolean
  colores?: string
  className?: string
}) {
  const src = fotoUrl ? (avatarThumb(fotoUrl) ?? fotoUrl) : null
  // Qué dirección ya llegó o ya falló: guardar la dirección (y no un «sí/no») hace que un cambio de foto empiece de cero.
  const [llegada, setLlegada] = useState<string | null>(null)
  const [rota, setRota] = useState<string | null>(null)
  const hayFoto = src !== null && rota !== src
  const color = colores ?? (apagado ? 'bg-[#E6E9EF] text-[#556072]' : 'bg-[#E6E9EF] text-[#192031]')

  return (
    <span className={`${TAMANOS[tamano]} ${color} relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold leading-none ${className}`}>
      <span aria-hidden>{iniciales(nombre)}</span>
      {hayFoto && (
        <img
          // Una foto que ya estaba en caché puede estar completa antes de que React le ponga el oído.
          ref={el => { if (el && el.complete && el.naturalWidth > 0) setLlegada(src) }}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLlegada(src)}
          onError={() => setRota(src)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${llegada === src ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </span>
  )
}

const TONO: Record<TonoContrato, string> = {
  ok: 'text-[#667085]',
  pronto: 'font-medium text-[#8A5A12]',
  vencido: 'font-medium text-[#B42318]',
  neutro: 'text-[#667085]',
}

/** «Contrato 224 de 2026 · vence el 31 dic 2026». El color avisa: ámbar si vence en 30 días, rojo si ya terminó. */
export function LineaContrato({ contrato, className = '' }: { contrato: ContratoResumen; className?: string }) {
  const { texto, tono } = describirContrato(contrato)
  if (texto === '') return null
  // `pretty`: si la línea tiene que partirse, no deja una palabra sola («…31 dic / 2026») en la segunda.
  return <p className={`text-xs [text-wrap:pretty] ${TONO[tono]} ${className}`}>{texto}</p>
}
