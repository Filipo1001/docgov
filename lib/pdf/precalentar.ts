import 'server-only'

/**
 * lib/pdf/precalentar.ts — generar el informe y la cuenta ANTES de que alguien
 * los pida.
 *
 * ── El problema ──────────────────────────────────────────────────────────
 *
 * El Informe de Actividades incrusta cada foto del periodo con `<Image>`, y
 * react-pdf las descarga una a una al renderizar. Medido en producción: la
 * mediana son 15 fotos por periodo, el percentil 90 son 43 y hay uno con 134;
 * en peso, 2 MB de mediana y hasta 26,5 MB. Generarlo cuesta segundos.
 *
 * Ese coste caía entero sobre el clic de la contratista. De los 203 periodos
 * aprobados o radicados solo 80 tenían su informe en caché, así que en el 60%
 * de los casos la primera descarga pagaba la factura completa —con un botón
 * que además no daba ninguna señal, así que se pulsaba tres veces y se
 * generaba tres veces—.
 *
 * ── La idea ──────────────────────────────────────────────────────────────
 *
 * El trabajo no desaparece, se mueve a un momento en que nadie espera: la
 * aprobación. Cuando la secretaria aprueba, el periodo entra en un estado
 * cacheable y sus documentos ya no van a cambiar, así que se generan ahí
 * mismo, después de responderle a ella. Cuando la contratista pulse, el caché
 * está caliente.
 *
 * ── Reglas de esta función ───────────────────────────────────────────────
 *
 * NUNCA lanza y nunca se espera desde la ruta de la aprobación. Precalentar es
 * una optimización: si falla, la siguiente descarga lo genera como toda la
 * vida. Lo que no puede es tumbar una aprobación ya guardada.
 *
 * Va DESPUÉS de `invalidarCachePDF`, y esto no es opcional: la invalidación
 * borra el caché del periodo, así que precalentar antes dejaría el trabajo
 * hecho para que lo borraran acto seguido.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { buildPDFData } from './data'
import { getOrGeneratePDFBuffer } from './cache'

/**
 * Deja en caché el Informe de Actividades y la Cuenta de Cobro de un periodo.
 *
 * Solo esos dos: son los que entran en el ZIP de SECOP que descarga la
 * contratista, y el informe es el caro. Las actas las genera el supervisor
 * desde su propia pantalla y pesan una fracción.
 */
export async function precalentarPDFs(periodoId: string): Promise<void> {
  try {
    const data = await buildPDFData(periodoId)
    if (!data) return

    const estado = data.periodo.estado
    // Fuera de los estados cacheables, `getOrGeneratePDFBuffer` genera pero no
    // guarda: sería trabajo tirado a la basura.
    if (!['enviado', 'revision', 'aprobado', 'radicado'].includes(estado)) return

    const admin = createAdminSupabaseClient()

    await Promise.allSettled([
      getOrGeneratePDFBuffer({
        supabase: admin,
        tipo: 'informe',
        periodoId,
        estado,
        generate: async (verif) => {
          const { generarInformeConAnexos } = await import('./anexos')
          return generarInformeConAnexos(periodoId, data, verif)
        },
      }),
      getOrGeneratePDFBuffer({
        supabase: admin,
        tipo: 'cuenta-cobro',
        periodoId,
        estado,
        generate: async (verif) => {
          const [{ renderToBuffer }, React, { CuentaDeCobroPDF }] = await Promise.all([
            import('@react-pdf/renderer'),
            import('react'),
            import('./cuenta-de-cobro'),
          ])
          return renderToBuffer(
            React.createElement(CuentaDeCobroPDF, {
              data: { ...data, verificacion: verif ?? undefined },
            }) as never,
          ) as unknown as Promise<Buffer>
        },
      }),
    ])
  } catch {
    /* precalentar es mejor-esfuerzo: la siguiente descarga lo genera */
  }
}
