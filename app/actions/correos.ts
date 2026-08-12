'use server'

/**
 * Server actions for mass email sending by asesores.
 * Scoped to the asesor's dependencia. Excludes placeholder emails.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getResendClient, RESEND_FROM } from '@/lib/resend'
import { getMesActual } from '@/lib/constants'
import { baseHtml } from '@/lib/emails/templates'
import { MARCA } from '@/lib/marca'
import type { ActionResult } from '@/lib/types'

export type FiltroCorreo = 'sin_enviar' | 'enviaron' | 'rechazados' | 'todos'

// ─── Helper: build plain HTML email ──────────────────────────

/**
 * Reutiliza el sobre compartido (logo + barra + botón + pie) en vez de la
 * copia propia que este archivo mantenía —ya había divergido en el color
 * de la barra (#1a1a1a en vez de MARCA)—. El asunto que escribe el asesor
 * hace de título de la barra.
 */
function buildEmailHtml(asunto: string, contenidoHtml: string): string {
  return baseHtml(
    asunto,
    `<div style="color:#333;font-size:14px;line-height:1.8;">${contenidoHtml}</div>`,
    MARCA,
  )
}

// ─── Main action ──────────────────────────────────────────────

export async function enviarCorreoMasivoAsesor(
  filtro: FiltroCorreo,
  asunto: string,
  mensajePlantilla: string,
): Promise<ActionResult<{ enviados: number; excluidos: number }>> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No autenticado' }

    const { data: asesor } = await supabase
      .from('usuarios')
      .select('rol, nombre_completo, dependencia_id')
      .eq('id', session.user.id)
      .single()

    if (asesor?.rol !== 'asesor') return { error: 'Solo los asesores pueden usar esta función' }
    if (!asesor.dependencia_id) return { error: 'El asesor no tiene una secretaría asignada' }
    if (!asunto.trim()) return { error: 'El asunto es obligatorio' }
    if (!mensajePlantilla.trim()) return { error: 'El mensaje es obligatorio' }

    const resend = getResendClient()
    if (!resend) return { error: 'El servicio de correo no está configurado' }

    const { mes, anio } = getMesActual()
    const hoy = new Date().toISOString().split('T')[0]

    // 1. Get all active contracts in asesor's dependencia
    const { data: contratos } = await supabase
      .from('contratos')
      .select('id, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, email)')
      .eq('dependencia_id', asesor.dependencia_id)
      .gte('fecha_fin', hoy)

    const contratoList = (contratos ?? []) as unknown as Array<{
      id: string
      contratista: { nombre_completo: string; email: string } | null
    }>

    if (contratoList.length === 0) return { data: { enviados: 0, excluidos: 0 } }

    // 2. Get period states for this month (skip for 'todos')
    const estadoPorContrato = new Map<string, string>()
    if (filtro !== 'todos') {
      const { data: periodos } = await supabase
        .from('periodos')
        .select('contrato_id, estado')
        .in('contrato_id', contratoList.map(c => c.id))
        .eq('mes', mes)
        .eq('anio', anio)
        .eq('es_historico', false)

      for (const p of (periodos ?? []) as Array<{ contrato_id: string; estado: string }>) {
        estadoPorContrato.set(p.contrato_id, p.estado)
      }
    }

    // 3. Filter by selected criteria
    const candidatos = contratoList
      .map(c => ({
        nombre: c.contratista?.nombre_completo ?? '',
        email: c.contratista?.email ?? '',
        estado: estadoPorContrato.get(c.id),
      }))
      .filter(d => {
        if (filtro === 'todos')       return true
        if (filtro === 'sin_enviar')  return !d.estado || d.estado === 'borrador'
        if (filtro === 'enviaron')    return d.estado === 'enviado'
        if (filtro === 'rechazados')  return d.estado === 'rechazado'
        return false
      })

    // 4. Deduplicate by email
    const seen = new Set<string>()
    const unicos = candidatos.filter(d => {
      if (seen.has(d.email)) return false
      seen.add(d.email)
      return true
    })

    // 5. Separate real vs placeholder emails
    const conEmail    = unicos.filter(d => d.email && !d.email.includes('@pendiente.local'))
    const sinEmail    = unicos.filter(d => !d.email || d.email.includes('@pendiente.local'))

    if (conEmail.length === 0) return { data: { enviados: 0, excluidos: sinEmail.length } }

    // 6. Send personalized emails
    await Promise.allSettled(
      conEmail.map(async d => {
        const primerNombre = d.nombre.split(' ')[0]
        const texto = mensajePlantilla.replace(/\{\{nombre\}\}/g, primerNombre)
        const html = texto.replace(/\n/g, '<br />')

        await resend.emails.send({
          from: RESEND_FROM,
          to: d.email,
          subject: asunto,
          html: buildEmailHtml(asunto, html),
        })
      })
    )

    return { data: { enviados: conEmail.length, excluidos: sinEmail.length } }

  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado al enviar correos' }
  }
}
