/**
 * Cómo conviven, en el panel de documentos del formulario de envío, el letrero «qué es» (al pasar el cursor) y el menú
 * de los tres puntitos (ver, reemplazar, eliminar).
 *
 * El defecto que esto corrige: el menú se despliega justo donde sale el letrero, y el letrero —que se pinta en una capa
 * superior y seguía apareciendo mientras el cursor estaba sobre el menú— tapaba la última opción («Eliminar»).
 *
 * La regla, de más a menos fuerte:
 *   1. El MENÚ MANDA. Con un menú abierto no hay letrero, sea de la celda que sea: quien abrió el menú ya sabe qué es.
 *   2. Cerca de los tres puntitos tampoco. Un cursor sobre ese botón va a pulsar, no a leer.
 *   3. El resto del tiempo, el letrero de la celda sobre la que está el cursor o el foco del teclado.
 *
 * Y dos hábitos que evitan el parpadeo: el letrero espera un instante antes de salir (no aparece mientras el cursor
 * solo cruza la fila) y se va en el acto.
 */
export const RETARDO_LETRERO_MS = 350

export function letreroVisible(e: {
  /** El texto del letrero de la celda bajo el cursor o el foco, o null. */
  activo: string | null
  /** Etiqueta del documento cuyo menú está abierto, o null si no hay ninguno. */
  menuAbierto: string | null
  /** El cursor está sobre un botón de tres puntitos (o sobre su menú). */
  sobreAcciones: boolean
}): string | null {
  if (e.menuAbierto !== null) return null
  if (e.sobreAcciones) return null
  return e.activo
}
