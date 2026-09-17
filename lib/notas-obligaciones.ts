/**
 * Las notas por obligación, listas para meter en un correo.
 *
 * Vive aquí y no dentro de las server actions porque un archivo 'use server'
 * solo puede exportar funciones async, y esto lo necesitan por igual las
 * acciones del flujo de informes y el cron que persigue las devoluciones sin
 * corregir. Copiarlo habría dejado dos formas de redactar el mismo correo.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'

/**
 * Las notas por obligación de un periodo, listas para meter en un correo.
 *
 * EL ✓ DECIDE EL PAPEL DE LA NOTA, y con él a qué correo pertenece:
 *
 *   · SIN aprobar → hallazgo. Es algo que hay que corregir, así que viaja en
 *     el correo de devolución y NO se imprime en el Acta de Supervisión: no
 *     es una declaración que la supervisión quiera firmar.
 *   · Aprobada → observación. Un llamado de atención que no llega a motivo de
 *     devolución, o una constancia neutral. Va al acta —sumándose a la frase
 *     de cumplimiento, no sustituyéndola— y viaja en el correo de APROBACIÓN.
 *
 * POR QUÉ EXISTE. Ninguna de las dos salía de la pantalla. La devolución
 * viajaba con un único `motivo` de texto libre, así que la nota escrita sobre
 * la obligación 2 —donde toca, junto a las actividades que la sustentan— no
 * llegaba a la contratista, que recibía un correo genérico y tenía que
 * adivinar a qué obligación se refería. Y la observación sobre una obligación
 * aprobada no llegaba por NINGÚN canal: ni correo, ni campana, ni WhatsApp.
 * Un llamado de atención que nadie recibe no es un llamado de atención.
 *
 * Devuelve HTML ya montado para `detalle`, o `null` si no hay nada que contar
 * —en cuyo caso el correo sale como siempre.
 */
export async function notasPorObligacion(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  periodoId: string,
  contratoId: string,
  clase: 'hallazgos' | 'observaciones',
): Promise<string | null> {
  const [{ data: revisiones }, { data: obligaciones }] = await Promise.all([
    admin
      .from('obligacion_revisiones')
      .select('obligacion_id, aprobada, nota')
      .eq('periodo_id', periodoId),
    admin
      .from('obligaciones')
      .select('id, descripcion, orden')
      .eq('contrato_id', contratoId)
      .order('orden'),
  ])

  if (!revisiones?.length || !obligaciones?.length) return null

  const porId = new Map(
    (revisiones as Array<{ obligacion_id: string; aprobada: boolean; nota: string | null }>)
      .map(r => [r.obligacion_id, r]),
  )

  const quiereAprobadas = clase === 'observaciones'
  const items = (obligaciones as Array<{ id: string; descripcion: string; orden: number }>)
    .map((obl, i) => ({ obl, i, rev: porId.get(obl.id) }))
    .filter(({ rev }) => rev && rev.aprobada === quiereAprobadas && !!rev.nota?.trim())

  if (!items.length) return null

  // Escapado manual: la nota la escribe una persona y acaba dentro de un
  // documento HTML. Sin esto, un «<» en el texto rompe el correo.
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  // El hallazgo pide acción (ámbar); la observación es para que conste (azul).
  const filo = quiereAprobadas ? '#0ea5e9' : '#f59e0b'
  const tinta = quiereAprobadas ? '#075985' : '#92400e'

  const filas = items.map(({ obl, i, rev }) => `
    <div style="margin:0 0 12px 0;padding:0 0 0 12px;border-left:3px solid ${filo};">
      <p style="color:#6b7280;font-size:12px;margin:0 0 3px 0;font-weight:bold;">
        Obligación ${i + 1}
      </p>
      <p style="color:#6b7280;font-size:12px;margin:0 0 5px 0;line-height:1.5;">
        ${esc(obl.descripcion)}
      </p>
      <p style="color:${tinta};font-size:13px;margin:0;line-height:1.6;">
        ${esc(rev!.nota!.trim())}
      </p>
    </div>`).join('')

  const encabezado = quiereAprobadas
    ? (items.length === 1
        ? 'La supervisión dejó una observación sobre una de tus obligaciones:'
        : `La supervisión dejó observaciones sobre ${items.length} de tus obligaciones:`)
    : (items.length === 1
        ? 'Hay una obligación con observaciones concretas:'
        : `Hay ${items.length} obligaciones con observaciones concretas:`)

  return `
    <p style="color:#333;font-size:14px;line-height:1.6;margin:20px 0 10px 0;">
      <strong>${encabezado}</strong>
    </p>
    ${filas}`
}
