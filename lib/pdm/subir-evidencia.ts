/**
 * Sube UNA evidencia por el camino que el servidor le preparó: los videos, por partes (`subir-reanudable.ts`); todo lo demás, con
 * una sola petición (`subir.ts`). Quien llama no distingue: pide subir y recibe el avance y el fallo en las mismas palabras.
 */

import { subirArchivo } from './subir'
import { subirReanudable } from './subir-reanudable'
import type { EvidenciaPreparada } from './seguimiento-acciones'

export function subirEvidencia(
  preparada: EvidenciaPreparada, archivo: File, { alProgreso }: { alProgreso?: (fraccion: number) => void } = {},
): Promise<void> {
  return preparada.reanudable
    ? subirReanudable(preparada.reanudable, preparada.ruta, archivo, preparada.tipo, { alProgreso })
    : subirArchivo(preparada.urlSubida, archivo, preparada.tipo, { alProgreso })
}
