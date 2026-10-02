/**
 * El identificador de un indicador: el icono de su sector (o el de su línea) sobre un cuadro suave.
 *
 * Es de presentación pura. Monocromo, en la tinta de la casa: el color queda para los estados. El icono no
 * carga el significado solo: el cuadro es una imagen con el nombre del sector como etiqueta (la lee el lector
 * de pantalla y sale como texto emergente), y donde hay sitio el nombre va escrito al lado.
 */

import Icono from '@/components/ui/Icono'
import { iconoDeLinea, iconoDeSector } from '@/lib/pdm/iconos-plan'

const TILE = {
  sm: { caja: 'h-7 w-7', icono: 'sm' as const },
  md: { caja: 'h-9 w-9', icono: 'md' as const },
}

export default function IconoSector({ sector, linea, tamano = 'sm', className = '' }: {
  /** El sector del indicador. */
  sector?: string
  /** O la línea estratégica (para los resúmenes por línea). */
  linea?: string
  tamano?: keyof typeof TILE
  className?: string
}) {
  const nombre = sector ?? linea ?? ''
  const glifo = sector !== undefined ? iconoDeSector(sector) : iconoDeLinea(linea ?? '')
  const t = TILE[tamano]
  return (
    <span
      role="img"
      aria-label={nombre}
      title={nombre}
      className={`inline-flex ${t.caja} shrink-0 items-center justify-center rounded-md bg-[#EDF0F5] text-[#192031] ${className}`}
    >
      <Icono glifo={glifo} tamano={t.icono} />
    </span>
  )
}
