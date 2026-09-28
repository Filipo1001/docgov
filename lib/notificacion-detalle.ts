/**
 * Lectura de un mensaje de notificación para mostrarlo completo.
 *
 * POR QUÉ EXISTE ESTO. Los avisos que genera el sistema para gestores no son
 * frases: son informes. `expediente_incompleto` promedia 352 caracteres y llega
 * a 566; `revision_pendiente`, 267. Todos vienen con la misma gramática, porque
 * los arma el mismo cron (app/api/cron/recordatorios/route.ts):
 *
 *   <cuántos> <de qué>: <nº (NOMBRE)> · <nº (NOMBRE)> — <mes> y N más. <qué hacer>
 *
 * Guardados en una sola línea de texto, el panel los recortaba a dos líneas
 * —unos 90 caracteres— y lo que quedaba fuera era justo la lista de contratos y
 * la instrucción final, que es la única parte accionable. Aquí se deshace ese
 * empaquetado para que el modal pueda pintar cada contrato en su fila y destacar
 * la instrucción.
 *
 * LO QUE NO SE PUEDE RECUPERAR. El cron ya recorta la lista antes de guardarla
 * (`slice(0, 8)`, `slice(0, 10)`) y anota «y 3 más». Esos tres nunca se
 * escribieron, así que ningún lector los puede mostrar: `omitidos` los cuenta
 * para poder decirlo en voz alta en lugar de disimularlo.
 *
 * ANTE LA DUDA, TEXTO PLANO. Un mensaje que no encaje en la gramática se
 * devuelve como párrafos tal cual. Es preferible a forzar una estructura que no
 * está: los mensajes escritos por personas —las devoluciones de la secretaría,
 * con sus puntos numerados— caen por aquí y deben leerse como se escribieron.
 */

/** Una fila de la lista: el contrato, quién lo tiene y, si viene, el mes. */
export interface ItemDetalle {
  contrato: string
  nombre: string
  extra: string | null
}

/** Un tramo del mensaje: un encabezado y los contratos que enumera. */
export interface BloqueDetalle {
  encabezado: string
  /**
   * La cifra con la que abre el encabezado, aparte.
   *
   * Todos estos avisos empiezan contando: «11 van a pasar su primera cuenta
   * sin el contrato», «10 contratos tienen meses cerrados sin planilla». Esa
   * cifra es la prioridad del aviso —dice si esto es un caso aislado o medio
   * municipio— y dentro del párrafo pesaba lo mismo que el resto. Separarla
   * permite pintarla grande y que sea lo primero que se lee.
   */
  cantidad: number | null
  /** El encabezado sin la cifra, para no repetirla al lado. */
  resumen: string
  items: ItemDetalle[]
  /** Contratos que el cron contó pero no escribió («y 3 más»). */
  omitidos: number
}

export interface Detalle {
  bloques: BloqueDetalle[]
  /** Frase final sin lista: casi siempre lo que hay que hacer. */
  instruccion: string | null
  /** Párrafos del mensaje cuando no hay estructura que extraer. */
  parrafos: string[]
}

/** `186 (LAURA CRISTINA VALLEJO HENAO) — Agosto` → sus tres partes. */
const ITEM = /^(\S+)\s+\((.+?)\)(?:\s+[—-]\s+(.+))?$/

/** `<encabezado>: <lista>` con un «y N más» opcional, hasta el punto final. */
const BLOQUE = /([^.:]+):\s*([^:]+?)(?:\s+y\s+(\d+)\s+más)?\.(?=\s|$)/g

function itemsDe(lista: string): ItemDetalle[] {
  // El cron une con ' · ' o con ', '. Solo el primero es inequívoco: una coma
  // también separa nombre y apellido, así que se parte por coma únicamente
  // cuando lo que sigue empieza como un contrato.
  const crudos = lista.includes(' · ')
    ? lista.split(' · ')
    : lista.split(/,\s+(?=\S+\s+\()/)

  const items: ItemDetalle[] = []
  for (const crudo of crudos) {
    const m = ITEM.exec(crudo.trim())
    if (!m) return []          // un solo item que no encaja invalida el bloque
    items.push({ contrato: m[1], nombre: m[2], extra: m[3] ?? null })
  }
  return items
}

export function interpretar(mensaje: string | null): Detalle {
  const texto = (mensaje ?? '').trim()
  const parrafos = texto.split(/\n+/).map(p => p.trim()).filter(Boolean)
  const vacio: Detalle = { bloques: [], instruccion: null, parrafos }

  // Un mensaje con saltos de línea lo escribió una persona, no el cron.
  if (!texto || parrafos.length > 1) return vacio

  const bloques: BloqueDetalle[] = []
  let finUltimo = 0
  BLOQUE.lastIndex = 0
  for (let m = BLOQUE.exec(texto); m; m = BLOQUE.exec(texto)) {
    const items = itemsDe(m[2])
    if (!items.length) continue
    const encabezado = m[1].trim().replace(/^[·,;]\s*/, '')
    const conCifra = /^(\d+)\s+(.+)$/.exec(encabezado)
    bloques.push({
      encabezado,
      cantidad: conCifra ? Number(conCifra[1]) : null,
      resumen: conCifra ? conCifra[2] : encabezado,
      items,
      omitidos: m[3] ? Number(m[3]) : 0,
    })
    finUltimo = m.index + m[0].length
  }

  if (!bloques.length) return vacio

  const cola = texto.slice(finUltimo).trim()
  return { bloques, instruccion: cola || null, parrafos }
}
