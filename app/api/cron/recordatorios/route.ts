/**
 * GET /api/cron/recordatorios — cron diario de alertas automáticas.
 *
 * Invocado por Vercel Cron (vercel.json) todos los días a las 12:00 UTC
 * (7:00 AM Bogotá). Evalúa sus reglas y dispara solo las que aplican hoy.
 *
 * ── Qué queda aquí y qué se fue al consolidado mensual ───────────────────
 *
 * Este cron ya no le manda recordatorios operativos a los secretarios. Lo que
 * les llega es el cierre del mes (`/api/cron/reporte-mensual`, día 6). Aquí
 * solo sobrevive lo que de verdad se puede quedar quieto y bloquear a alguien:
 * la bandeja de quien revisa (R2), el contratista que no corrige (R1, R3), el
 * expediente que impide emitir actas (R4) y un contrato a punto de vencer (R7).
 *
 * Se fueron:
 *   · R5 «cuentas aprobadas sin radicar» — ERA LA FUGA. Mandaba la misma lista
 *     a todos los supervisores sin filtrar por dependencia. Ahora vive dentro
 *     de R2, segmentada, porque quien radica es el mismo que revisa.
 *   · La rama de R4 sobre meses sin planilla — es un hueco administrativo que
 *     no cambia de un día para otro; va en el consolidado del día 6.
 *
 *  R1 — Contratistas con informe en borrador (días 22, 28 y 2):
 *       día 22: recordatorio, con el avance real de la persona y lo que falta (incluida la firma si no la tiene)
 *       día 28: urgente · día 2: venció (mes anterior)
 *       El del 24 se quitó el 2-nov-2026: salía dos días después del primero y repetía su contenido, que ahora
 *       viaja en el del 22. Se adelantó al 22 porque en agosto el 82% del trabajo se cargó entre el 24 y el 28.
 *       El aviso de VENCIDO nunca va a quien no ha enviado un informe en su vida: para esa persona sería su primer
 *       contacto con el sistema, y no puede arreglarlo. Va a su supervisor, que es quien tiene la llave.
 *  R3 — Contratista con informe DEVUELTO sin corregir (≥3 días), con las correcciones dentro.
 *
 * ── Lo que va en el resumen semanal (lunes) y no en correos sueltos ──────
 *
 * A quien gestiona (secretarios, contratación, administración) ya no le llega un correo por regla: cada una aporta una
 * SECCIÓN a un solo resumen semanal (lib/resumen-semanal.ts), y quien no tiene nada pendiente no recibe nada.
 *  · Tu bandeja (R2): lo que espera revisión y lo aprobado que sigue sin radicar, por dependencia.
 *  · Devueltos sin corregir hace más de 2 semanas (R3), a su supervisor.
 *  · Sin su primer informe (antes R1 el día 2), a su supervisor; el primer lunes entre el 2 y el 8.
 *  · Documentación pendiente (R4), a contratación y administración: contratos sin CDP, CRP o contrato firmado.
 *  · Contratos por vencer (R7), con las ventanas de 60 y 30 días de lib/vencimientos.ts.
 * Los asesores reciben la campana pero no el correo.
 *
 * Un contrato terminado anticipadamente (migración 081) deja de producir avisos por sí solo: sus periodos posteriores
 * quedan `anulado` y ninguna regla de periodos los ve, y R4 y R7 miran la fecha de fin EFECTIVA o lo excluyen. Los
 * periodos hasta su último día de ejecución siguen avisándose: son el informe con el que se cobra lo ejecutado.
 *
 * Anti-spam:
 *  - R1: guard de 20 h por (tipo, periodo) — un retry del cron no duplica
 *  - R3: máximo uno por semana y por periodo al contratista
 *  - Resumen semanal: solo los lunes, uno por persona y solo si hay algo; nunca dos en 20 h
 *
 * Auth: Vercel envía `Authorization: Bearer ${CRON_SECRET}` automáticamente
 * cuando la env var existe. Sin secret válido → 401.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { enviarNotificacion } from '@/lib/notifications'
import { notasPorObligacion } from '@/lib/notas-obligaciones'
import { cargarAmbitos, destinatariosDe } from '@/lib/alcance'
import { esLunes, rangoDeConsulta, repartirVencimientos, paraDestinatario, type ContratoPorVencer } from '@/lib/vencimientos'
import { AcumuladoSemanal, seccion, mensajeCampana, tituloCampana } from '@/lib/resumen-semanal'
import { capitalizarNombre } from '@/lib/format'
import { MESES } from '@/lib/constants'
import { contratoSuspendido } from '@/lib/estado-contrato'
import { enviarCorreo } from '@/lib/resend'
import { EMAIL_TEMPLATES } from '@/lib/emails/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** El cuerpo personal del recordatorio del día 22: el avance y lo que falta, en el orden en que se hace. */
function detalleRecordatorio(avance: string, pasos: string[]): string {
  return `${avance} Faltan pocos días para que se acabe el mes, así que este es un buen momento para ${enumerar(pasos)}.`
}

/** «a, b y c» — una lista en español, no separada por comas hasta el final. */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** Fecha actual en Bogotá (el server corre en UTC). En un ensayo se puede pedir otra (`?fecha=2026-11-09`). */
function hoyBogota(fechaPedida?: string | null): { anio: number; mesIdx: number; dia: number; iso: string } {
  const parts = fechaPedida && /^\d{4}-\d{2}-\d{2}$/.test(fechaPedida)
    ? fechaPedida
    : new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date()) // "YYYY-MM-DD"
  const [anio, mes, dia] = parts.split('-').map(Number)
  return { anio, mesIdx: mes - 1, dia, iso: parts }
}

type PeriodoBorrador = {
  id: string; mes: string; anio: number; contrato_id: string
  contrato: { numero: string; contratista_id: string | null; supervisor_id: string | null; estado: string | null } | null
}

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()

  // ── Ensayo de la semana: ?ensayo=1[&fecha=2026-11-09] ─────────
  //
  // Corre TODAS las reglas con los datos reales y, en vez de escribir una notificación o mandar un correo, anota lo que
  // habría enviado y lo devuelve. Existe porque el resumen semanal sale los lunes: descubrir un error esperando al
  // lunes cuesta una semana, y un error ahí le llega a gente real. Con `fecha` se puede pedir otro día (un lunes, por
  // ejemplo); los guards de tiempo usan el reloj real, así que un ensayo de una fecha lejana es una aproximación.
  // Sigue exigiendo el CRON_SECRET: las secciones llevan nombres de contratistas.
  const ensayoSemana = req.nextUrl.searchParams.get('ensayo') === '1'
  const { anio, mesIdx, dia, iso } = hoyBogota(ensayoSemana ? req.nextUrl.searchParams.get('fecha') : null)
  const simulados: Parameters<typeof enviarNotificacion>[0][] = []
  const enviar: typeof enviarNotificacion = ensayoSemana
    ? async (p) => { simulados.push(p) }
    : enviarNotificacion

  const resumen: Record<string, number> = { r1_recordatorios: 0, r1_primerizos: 0, r2_bandeja: 0, r3_devueltos: 0, r3_escalados: 0, r4_expediente: 0, r7_vencimientos: 0, resumen_semanal: 0 }

  // Los lunes, lo que antes eran correos sueltos a quien gestiona (bandeja, devueltos estancados, primerizos, expediente
  // y vencimientos) se junta en UN resumen por persona (lib/resumen-semanal.ts). Cada regla aporta su sección; al final
  // se manda una sola notificación. Los contadores r2/r3_escalados/r4/r7/r1_primerizos cuentan secciones aportadas.
  const lunes = esLunes(iso)
  const semana = new AcumuladoSemanal()

  // ── Ensayo: ?prueba=<correo> ─────────────────────────────────
  //
  // Manda a UNA dirección el recordatorio del día 24 tal como lo recibirían
  // dos personas reales —una sin firma registrada y otra con ella, que es la
  // única diferencia que tiene el mensaje— y se va sin tocar nada más.
  //
  // No escribe en `notificaciones`, y eso no es un detalle: el guard
  // anti-duplicado de R1 se apoya en esa tabla, así que un ensayo que dejara
  // rastro haría que el envío de verdad se saltara justo a las personas con
  // las que se probó.
  //
  // Y sale antes que las demás reglas: un ensayo no puede acabar mandándole
  // avisos reales a los secretarios.
  const prueba = ensayoSemana ? null : req.nextUrl.searchParams.get('prueba')
  if (prueba) {
    return NextResponse.json(await ensayoRecordatorio(admin, prueba, MESES[mesIdx], anio))
  }

  // ══ R1 — Informes en borrador (días 22, 24, 28 y 2) ═══════════
  //
  // El 24 se añadió porque el corte real de la alcaldía es el 25, y eso no
  // estaba en ninguna parte del código: el escalonado 22/28/2 daba por hecho
  // un cierre a fin de mes, así que entre el aviso del 22 y el del 28 caía
  // el plazo de verdad sin que el sistema dijera nada. Al medirlo, el 24 de
  // septiembre había 88 de 104 periodos en borrador.
  //
  // El corte del 25 es costumbre, no está estipulado por escrito, y por eso
  // el aviso NO afirma que mañana vence: dice que se acaba el mes y que su
  // informe no ha llegado, que es lo que sí es cierto.
  if (dia === 22 || dia === 28 || dia === 2) {
    // Día 2 → el mes VENCIDO es el anterior; días 22/28 → el mes en curso
    const esVencido = dia === 2
    const mesObjetivoIdx = esVencido ? (mesIdx === 0 ? 11 : mesIdx - 1) : mesIdx
    const anioObjetivo = esVencido && mesIdx === 0 ? anio - 1 : anio
    const mesNombre = MESES[mesObjetivoIdx]

    const tipo = esVencido
      ? 'recordatorio_vencido'
      : dia === 28 ? 'recordatorio_urgente'
      : 'recordatorio'
    let consulta = admin
      .from('periodos')
      .select('id, mes, anio, contrato_id, contrato:contratos(numero, contratista_id, supervisor_id, estado)')
      .eq('mes', mesNombre)
      .eq('anio', anioObjetivo)
      .eq('estado', 'borrador')
      .eq('es_historico', false)

    // El envío tardío habilitado solo silencia el aviso de VENCIDO, y con
    // razón: a esa persona no se le venció nada, tiene la puerta abierta.
    //
    // Antes silenciaba también los recordatorios del 22 y el 28, que es justo
    // al revés: quien tiene un plazo abierto y una fecha encima es a quien más
    // le sirve el empujón. Abrirle la puerta a alguien no puede tener como
    // efecto que el sistema deje de hablarle.
    if (esVencido) consulta = consulta.eq('habilitado_tardio', false)

    const { data: borradores } = await consulta

    // Un contrato suspendido no pide informe mientras dure la suspensión (migración 082).
    const todos = ((borradores ?? []) as unknown as PeriodoBorrador[])
      .filter(p => p.contrato?.contratista_id && !contratoSuspendido(p.contrato.estado))

    // ¿Quién ha enviado alguna vez un informe por el sistema?
    //
    // Divide a la gente en dos situaciones que no se parecen en nada: la que
    // conoce la herramienta y se retrasó, y la que nunca la ha usado.
    const conHistoria = new Set<string>()
    if (todos.length) {
      const { data: enviadosAlguna } = await admin
        .from('periodos')
        .select('contrato_id')
        .in('contrato_id', [...new Set(todos.map(p => p.contrato_id))])
        .not('fecha_envio', 'is', null)
      for (const p of enviadosAlguna ?? []) conHistoria.add(p.contrato_id as string)
    }

    // «Tu informe venció» NO puede ser el primer contacto de nadie.
    //
    // Al medir esto, de los 95 que recibirían el aviso del día 2 había 39 que
    // no habían enviado un solo informe en su vida, y 36 de ellos entraron en
    // agosto o septiembre —la tanda que no alcanzó capacitación—. Para esas
    // personas el estreno del sistema habría sido un correo rojo diciendo que
    // fracasaron en algo que nadie les enseñó, y que además no pueden arreglar:
    // su periodo está bloqueado y solo el supervisor lo abre.
    //
    // Se les saca de aquí y se avisa a quien sí tiene la llave.
    //
    // (A su supervisor se le avisa en el resumen semanal del lunes; ver «Primerizos» más abajo.)
    const candidatos = esVencido
      ? todos.filter(p => conHistoria.has(p.contrato_id))
      : todos

    // Guard anti-duplicado: mismo tipo+periodo en las últimas 20 h (retry del cron)
    const enviadas = new Set<string>()
    if (candidatos.length) {
      const hace20h = new Date(Date.now() - 20 * 3600_000).toISOString()
      const { data: yaEnviadas } = await admin
        .from('notificaciones')
        .select('periodo_id')
        .eq('tipo', tipo)
        .gte('created_at', hace20h)
        .in('periodo_id', candidatos.map(p => p.id))
      for (const n of yaEnviadas ?? []) enviadas.add(n.periodo_id as string)
    }

    // Progreso real de cada uno, para que el aviso diga algo que la persona
    // no sepa ya.
    //
    // «Recuerda enviar tu informe» es una fecha que se conoce de memoria; lo
    // que mueve a alguien es ver cuánto le falta. Dos consultas agregadas —
    // solo en los tres días que esta regla dispara— y se resuelve.
    const pendientesIds = candidatos.filter(p => !enviadas.has(p.id)).map(p => p.id)

    // Quién no tiene firma registrada.
    //
    // Solo hace falta el día 22, que es el único aviso que enumera los pasos
    // que faltan (antes era el del 24, que se quitó el 2-nov-2026 por salir
    // dos días después del primero; lo que decía pasó al del 22). Decirle «sube tu firma» a quien ya la tiene es la clase de
    // instrucción que no aplica y que enseña a no leer los correos; y
    // callársela a quien no la tiene es peor, porque es su primer muro: 27
    // de los 120 contratistas no la tienen, y ninguno de esos 27 ha logrado
    // enviar un informe nunca.
    const sinFirma = new Set<string>()
    if (dia === 22 && pendientesIds.length) {
      const contratistas = [...new Set(
        candidatos.filter(p => !enviadas.has(p.id)).map(p => p.contrato!.contratista_id!),
      )]
      const { data: usuariosSinFirma } = await admin
        .from('usuarios')
        .select('id')
        .in('id', contratistas)
        .is('firma_url', null)
      for (const u of usuariosSinFirma ?? []) sinFirma.add(u.id as string)
    }

    const actividadesPorPeriodo = new Map<string, number>()
    if (pendientesIds.length) {
      const { data: acts } = await admin
        .from('actividades')
        .select('periodo_id')
        .in('periodo_id', pendientesIds)
      for (const a of acts ?? []) {
        const k = a.periodo_id as string
        actividadesPorPeriodo.set(k, (actividadesPorPeriodo.get(k) ?? 0) + 1)
      }
    }

    await Promise.allSettled(
      candidatos.filter(p => !enviadas.has(p.id)).map(async (p) => {
        const hechas = actividadesPorPeriodo.get(p.id) ?? 0
        const titulo = esVencido
          ? `Tu informe de ${p.mes} ${p.anio} venció`
          : dia === 28
            ? `Quedan pocos días — informe de ${p.mes}`
            : `Recuerda enviar tu informe de ${p.mes}`

        // El avance va primero y en concreto: quien no ha empezado y quien ya
        // lleva media docena de actividades no están en la misma situación, y
        // hasta ahora recibían exactamente el mismo texto.
        const avance = hechas === 0
          ? 'Todavía no has registrado ninguna actividad.'
          : `Llevas ${hechas} actividad${hechas === 1 ? '' : 'es'} registrada${hechas === 1 ? '' : 's'}.`

        // El día 22 enumera lo que falta, en el orden en que se hace, y la
        // firma solo aparece para quien no la tiene.
        const pasos = [
          sinFirma.has(p.contrato!.contratista_id!) ? 'subir tu firma' : null,
          'registrar tus actividades',
          'adjuntar tu planilla de seguridad social',
          'enviarlo a revisión',
        ].filter(Boolean) as string[]

        // Lo personal viaja en `detalle`, que es lo que la plantilla del día
        // 22 pinta: el resto del payload son cadenas fijas y la plantilla no
        // ve el `mensaje`, que solo alimenta la campana dentro de la app.
        const detalle = dia === 22 ? detalleRecordatorio(avance, pasos) : undefined

        const mensaje = esVencido
          ? `El plazo para enviar tu informe de ${p.mes} ${p.anio} ya venció. Contacta a tu supervisor para habilitar el envío tardío.`
          : dia === 22
            ? `Todavía no hemos recibido tu informe de actividades de ${p.mes} ${p.anio} del contrato ${p.contrato!.numero}. ${detalle}`
            : `${avance} Aún no has enviado tu informe de ${p.mes} ${p.anio} del contrato ${p.contrato!.numero}. Ingresa a Contratista Digital para completarlo.`
        await enviar({
          destinatarioId: p.contrato!.contratista_id!,
          tipo, titulo, mensaje, detalle,
          periodoId: p.id,
          mes: p.mes, anio: p.anio,
          contrato: p.contrato!.numero,
        })
        resumen.r1_recordatorios++
      }),
    )
  }

  // ══ R2 — El estado de tu bandeja (sección del resumen semanal) ═════
  //
  // Lo que puede quedarse quieto en manos de quien revisa: lo que espera revisión y lo que ya aprobó y sigue sin
  // radicar. Antes era un correo propio cada 2 o 3 días (hasta 15 al mes por secretario, 86 en 30 días entre ocho
  // personas); ahora es una sección del resumen del lunes. Quien radica es la misma persona que revisa, y por eso van
  // juntas. El reparto sale de lib/alcance.ts: cada dependencia, su gente; ninguna consulta por rol suelta, que es
  // como se coló la lista global de septiembre (tres nombres de dos secretarías a cinco personas).
  if (lunes) {
    const ambitos = await cargarAmbitos(admin)

    const [{ data: pendientes }, { data: aprobados }] = await Promise.all([
      admin
        .from('periodos')
        .select('id, mes, anio, fecha_envio, contrato:contratos(numero, dependencia_id, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo))')
        .in('estado', ['enviado', 'revision'])
        .eq('es_historico', false),
      admin
        .from('periodos')
        .select('id, mes, anio, contrato:contratos(numero, dependencia_id, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo))')
        .eq('estado', 'aprobado')
        .eq('es_historico', false),
    ])

    type Fila = {
      id: string; mes: string; anio: number; fecha_envio?: string | null
      contrato: {
        numero: string; dependencia_id: string | null
        contratista: { nombre_completo: string } | null
      } | null
    }
    const porRevisar = ((pendientes ?? []) as unknown as Fila[]).filter(p => p.contrato?.dependencia_id)
    const porRadicar = ((aprobados ?? []) as unknown as Fila[]).filter(p => p.contrato?.dependencia_id)

    // Cuándo se aprobó cada una: `periodos.fecha_aprobacion` no es fiable, la
    // buena es la última transición → 'aprobado' del historial.
    const aprobadoEn = new Map<string, string>()
    if (porRadicar.length) {
      const { data: hist } = await admin
        .from('historial_periodos')
        .select('periodo_id, created_at')
        .eq('estado_nuevo', 'aprobado')
        .in('periodo_id', porRadicar.map(p => p.id))
        .order('created_at', { ascending: false })
      for (const h of hist ?? []) {
        if (!aprobadoEn.has(h.periodo_id as string)) aprobadoEn.set(h.periodo_id as string, h.created_at as string)
      }
    }

    const diasDesde = (iso: string | null | undefined) =>
      iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600_000))) : 0
    const quien = (p: Fila) => `${capitalizarNombre(p.contrato?.contratista?.nombre_completo) || '?'} (${p.mes})`

    for (const ambito of ambitos.values()) {
      const revisar = porRevisar.filter(p => p.contrato!.dependencia_id === ambito.dependenciaId)
      const radicar = porRadicar.filter(p => p.contrato!.dependencia_id === ambito.dependenciaId)
      if (revisar.length === 0 && radicar.length === 0) continue

      // Lo que más lleva esperando va primero: es lo que se ve si la lista se recorta.
      const filas = [
        ...revisar.map(p => ({ dias: diasDesde(p.fecha_envio), texto: `${quien(p)} · espera revisión desde hace ${diasDesde(p.fecha_envio)} d` })),
        ...radicar.map(p => ({ dias: diasDesde(aprobadoEn.get(p.id)), texto: `${quien(p)} · aprobada hace ${diasDesde(aprobadoEn.get(p.id))} d, sin radicar` })),
      ].sort((x, y) => y.dias - x.dias)

      const partes = [
        revisar.length ? `${revisar.length} informe${revisar.length === 1 ? '' : 's'} espera${revisar.length === 1 ? '' : 'n'} revisión` : '',
        radicar.length ? `${radicar.length} cuenta${radicar.length === 1 ? '' : 's'} aprobada${radicar.length === 1 ? '' : 's'} espera${radicar.length === 1 ? '' : 'n'} radicación` : '',
      ].filter(Boolean)
      const cifra = [
        revisar.length ? `${revisar.length} por revisar` : '',
        radicar.length ? `${radicar.length} por radicar` : '',
      ].filter(Boolean).join(' y ')

      const sec = seccion('bandeja', 'Tu bandeja', `${partes.join(' y ')}.`, filas.map(f => f.texto), cifra)
      for (const revisorId of destinatariosDe(ambito)) {
        semana.aportar(revisorId, sec)
        resumen.r2_bandeja++
      }
    }
  }

  // ══ R3 — Devueltos que nadie corrige ══════════════════════════
  //
  // El único punto del circuito donde algo podía quedarse quieto para siempre.
  // R1 filtra por estado `borrador`; un informe devuelto está en `rechazado`,
  // así que no entraba en ninguna regla. En producción había uno devuelto
  // desde el 28 de abril: cinco meses sin que sonara una sola alarma.
  //
  // A los 3 días se le recuerda a la contratista, con las correcciones
  // concretas dentro. A las 2 semanas deja de ser un despiste suyo y el
  // supervisor recibe la lista: puede que ni siquiera pueda corregirlo, si el
  // periodo venció y nadie le ha habilitado el envío tardío.
  {
    const { data: devueltos } = await admin
      .from('periodos')
      .select('id, mes, anio, contrato_id, contrato:contratos(numero, contratista_id, supervisor_id, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo))')
      .eq('estado', 'rechazado')
      .eq('es_historico', false)

    type Devuelto = {
      id: string; mes: string; anio: number; contrato_id: string
      contrato: {
        numero: string; contratista_id: string | null; supervisor_id: string | null
        contratista: { nombre_completo: string } | null
      } | null
    }
    const filas = ((devueltos ?? []) as unknown as Devuelto[]).filter(d => d.contrato?.contratista_id)

    if (filas.length) {
      // Cuándo se devolvió: `periodos.fecha_rechazo` está vacía en los 739
      // periodos de producción —nunca se escribió—, así que la fecha buena es
      // la del historial.
      const { data: hist } = await admin
        .from('historial_periodos')
        .select('periodo_id, created_at')
        .eq('estado_nuevo', 'rechazado')
        .in('periodo_id', filas.map(f => f.id))
        .order('created_at', { ascending: false })
      const devueltoEn = new Map<string, string>()
      for (const h of hist ?? []) {
        if (!devueltoEn.has(h.periodo_id as string)) devueltoEn.set(h.periodo_id as string, h.created_at as string)
      }

      const hace3d = Date.now() - 3 * 24 * 3600_000
      const hace14d = Date.now() - 14 * 24 * 3600_000

      // No se insiste más de una vez por semana sobre el mismo periodo.
      const hace7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
      const { data: yaAvisados } = await admin
        .from('notificaciones')
        .select('periodo_id')
        .eq('tipo', 'devuelto_sin_corregir')
        .gte('created_at', hace7d)
      const avisadosRecientes = new Set((yaAvisados ?? []).map(n => n.periodo_id as string))

      const estancados: Devuelto[] = []

      await Promise.allSettled(
        filas.map(async (d) => {
          const desde = devueltoEn.get(d.id)
          if (!desde) return
          const t = new Date(desde).getTime()
          if (t > hace3d) return                       // todavía es reciente
          if (t <= hace14d) estancados.push(d)          // para el aviso al supervisor

          if (avisadosRecientes.has(d.id)) return

          const dias = Math.floor((Date.now() - t) / (24 * 3600_000))
          const detalle = await notasPorObligacion(admin, d.id, d.contrato_id, 'hallazgos')
          const motivo = `Tu informe de ${d.mes} ${d.anio} lleva ${dias} días devuelto sin corregir.`

          await enviar({
            destinatarioId: d.contrato!.contratista_id!,
            tipo: 'devuelto_sin_corregir',
            titulo: `Informe de ${d.mes} pendiente de corregir`,
            mensaje: motivo,
            periodoId: d.id,
            mes: d.mes,
            anio: d.anio,
            contrato: d.contrato!.numero,
            motivo,
            detalle: detalle ?? undefined,
          })
          resumen.r3_devueltos++
        }),
      )

      // Escalado: pasa al resumen semanal del lunes, una sección por supervisor con todo lo suyo.
      if (lunes && estancados.length) {
        const porSupervisor = new Map<string, Devuelto[]>()
        for (const d of estancados) {
          const sup = d.contrato!.supervisor_id
          if (!sup) continue
          porSupervisor.set(sup, [...(porSupervisor.get(sup) ?? []), d])
        }

        for (const [sup, lista] of porSupervisor) {
          const nombres = lista.map(d => `${capitalizarNombre(d.contrato?.contratista?.nombre_completo) || '?'} (${d.mes})`)
          semana.aportar(sup, seccion(
            'devueltos',
            'Devueltos sin corregir',
            `${lista.length} informe${lista.length === 1 ? ' lleva' : 's llevan'} más de dos semanas devuelto${lista.length === 1 ? '' : 's'} sin corregir. Puede que no puedan hacerlo si el periodo ya venció y nadie les ha habilitado el envío tardío.`,
            nombres,
            `${lista.length} devuelto${lista.length === 1 ? '' : 's'} sin corregir`,
          ))
          resumen.r3_escalados++
        }
      }
    }
  }

  // ══ R4 — Expediente incompleto antes de emitir actas ══════════
  //
  // La única alerta que PREVIENE en vez de perseguir. El acta de supervisión
  // imprime una fila por periodo con su número de planilla, y donde no hay
  // número imprime «—». Cuando alguien lo nota ya es tarde: por la regla 3 del
  // proyecto un documento emitido no se reescribe. Al escribir esto había 4
  // contratos con actas ya emitidas arrastrando un hueco dentro.
  //
  // Se reparte por quien PUEDE arreglarlo, que no es la misma persona:
  //   · Contratación: CDP, CRP y el contrato firmado del expediente.
  //   · Supervisor: los meses sin planilla — solo él habilita el envío tardío
  //     que permite subirla, así que avisar a otro no sirve de nada.
  //
  // Semanal, no diaria: son huecos administrativos que no cambian de un día
  // para otro, y repetirlos cada mañana es la forma más rápida de que dejen
  // de leerse. Desde el 2-nov-2026 es una sección del resumen del lunes, no un
  // correo propio.
  if (lunes) {
    const { data: vigentesRaw } = await admin
      .from('contratos')
      .select('id, numero, cdp, crp, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)')
      .eq('activo', true)
      .gte('fecha_fin_efectiva', iso)

    type Vig = {
      id: string; numero: string; cdp: string | null; crp: string | null
      contratista: { nombre_completo: string } | null
    }
    const vigentes = ((vigentesRaw ?? []) as unknown as Vig[])

    if (vigentes.length) {
      const ids = vigentes.map(c => c.id)
      const [{ data: adjuntos }, { data: periodosVig }] = await Promise.all([
        admin.from('documentos_adjuntos')
          .select('entidad_id')
          .eq('entidad_tipo', 'contrato')
          .is('eliminado_at', null)
          .in('entidad_id', ids),
        admin.from('periodos')
          .select('contrato_id, fecha_envio')
          .in('contrato_id', ids)
          .eq('es_historico', false),
      ])

      const conAdjunto = new Set((adjuntos ?? []).map(a => a.entidad_id as string))
      const cursados = new Set(
        ((periodosVig ?? []) as { contrato_id: string; fecha_envio: string | null }[])
          .filter(p => p.fecha_envio).map(p => p.contrato_id),
      )

      // ── Contratación + admin: presupuesto y contrato firmado ──
      const faltaCdpCrp = vigentes.filter(c => !(c.cdp ?? '').trim() || !(c.crp ?? '').trim())
      // El contrato firmado solo se exige a quien va a pasar su PRIMERA cuenta:
      // la ley pide que la primera vaya acompañada del contrato completo.
      const faltaContrato = vigentes.filter(c => !cursados.has(c.id) && !conAdjunto.has(c.id))

      if (faltaCdpCrp.length || faltaContrato.length) {
        const linea = (c: Vig) => `${c.numero} (${capitalizarNombre(c.contratista?.nombre_completo) || '?'})`
        const items = [
          ...faltaCdpCrp.map(c => `${linea(c)} · sin CDP o CRP`),
          ...faltaContrato.map(c => `${linea(c)} · pasará su primera cuenta sin el contrato en el expediente`),
        ]
        const intro = [
          faltaCdpCrp.length ? `${faltaCdpCrp.length} contrato${faltaCdpCrp.length === 1 ? '' : 's'} sin CDP o CRP` : '',
          faltaContrato.length ? `${faltaContrato.length} van a pasar su primera cuenta sin el contrato firmado en el expediente` : '',
        ].filter(Boolean).join('; ')
        const sec = seccion(
          'expediente',
          'Documentación pendiente',
          `${intro}. Conviene resolverlo antes de que se emitan las actas: un documento emitido no se reescribe.`,
          items,
          `${faltaCdpCrp.length + faltaContrato.length} con documentación pendiente`,
        )

        const { data: gestores } = await admin
          .from('usuarios').select('id').in('rol', ['contratacion', 'admin']).eq('activo', true)
        for (const u of gestores ?? []) {
          semana.aportar(u.id as string, sec)
          resumen.r4_expediente++
        }
      }
    }
  }

  // ══ R7 — Contratos por vencer (sección del resumen semanal) ═════
  //
  // Antes salía un correo por contrato el día exacto de -60 y -30. Casi todos terminan a fin de año (36 el 31-dic, 31 el
  // 30-dic, 18 el 30-nov), así que el 31-oct y el 1-nov cada administrador recibió 85 correos iguales; en 30 días, 96 a
  // administración, 96 a contratación y 96 entre los cinco secretarios, cada uno con su aviso en la campana. Ahora, los
  // lunes, lo que entró en la ventana de 60 o de 30 días (lib/vencimientos.ts) viaja como una sección del resumen semanal (lib/resumen-semanal.ts):
  // un solo correo por persona. Quien gestiona (administración, contratación) ve todos; un secretario, los suyos.
  if (lunes) {
    const rango = rangoDeConsulta(iso)
    const { data: porVencer } = await admin
      .from('contratos')
      .select('numero, fecha_fin, supervisor_id, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)')
      .gte('fecha_fin', rango.desde)
      .lte('fecha_fin', rango.hasta)
      // A un contrato terminado antes no hay prórroga que tramitarle: «vence en 30 días, tramita el otrosí» sería falso.
      .is('fecha_terminacion', null)

    type ContratoVence = {
      numero: string; fecha_fin: string; supervisor_id: string | null
      contratista: { nombre_completo: string } | null
    }
    const contratos: ContratoPorVencer[] = ((porVencer ?? []) as unknown as ContratoVence[]).map(c => ({
      numero: c.numero,
      contratista: capitalizarNombre(c.contratista?.nombre_completo) || '—',
      fechaFin: c.fecha_fin,
      supervisorId: c.supervisor_id,
    }))

    if (contratos.length) {
      // Lo que el sistema anterior ya avisó con su correo por contrato («Contrato 017 vence en 60 días»): no se repite.
      // Solo pesa en la transición, y deja de importar cuando esos avisos salen de los últimos 80 días.
      const hace80d = new Date(Date.now() - 80 * 24 * 3600_000).toISOString()
      const { data: previos } = await admin
        .from('notificaciones').select('titulo').eq('tipo', 'contrato_vencimiento').gte('created_at', hace80d)
      const yaAvisados = new Set<string>()
      for (const n of previos ?? []) {
        const m = /^Contrato (.+) vence en (\d+) días$/.exec(String(n.titulo))
        if (m) yaAvisados.add(`${m[1]}|${m[2]}`)
      }

      const { data: personas } = await admin
        .from('usuarios').select('id, rol').in('rol', ['admin', 'contratacion', 'supervisor']).eq('activo', true)

      for (const u of personas ?? []) {
        const veTodos = u.rol === 'admin' || u.rol === 'contratacion'
        const suyos = paraDestinatario(contratos, u.id as string, veTodos)
        const datos = repartirVencimientos(suyos, iso, yaAvisados)
        if (datos.en30.length + datos.en60.length === 0) continue
        semana.aportarVencimientos(u.id as string, datos)
        resumen.r7_vencimientos++
      }
    }
  }

  // ══ Primerizos — contratistas sin su primer informe (sección del resumen, primer lunes del mes) ═════
  //
  // Antes era un correo propio al supervisor el día 2. «Tu informe venció» no puede ser el primer contacto de nadie:
  // de los 95 que lo recibirían había 39 que nunca habían enviado un informe, y para ellos el periodo vencido está
  // bloqueado y solo su supervisor lo abre (`habilitado_tardio`). Por eso se avisa a quien tiene la llave. Ahora va como
  // sección del resumen del primer lunes entre el día 2 y el 8, que es una vez al mes como antes.
  if (lunes && dia >= 2 && dia <= 8) {
    const mesPrevioIdx = mesIdx === 0 ? 11 : mesIdx - 1
    const anioPrevio = mesIdx === 0 ? anio - 1 : anio
    const mesPrevio = MESES[mesPrevioIdx]
    const { data: vencidos } = await admin
      .from('periodos')
      .select('id, mes, anio, contrato_id, contrato:contratos(numero, contratista_id, supervisor_id, estado, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo))')
      .eq('mes', mesPrevio)
      .eq('anio', anioPrevio)
      .eq('estado', 'borrador')
      .eq('es_historico', false)
      // A quien ya tiene la puerta abierta no hay nada que pedirle al supervisor.
      .eq('habilitado_tardio', false)

    type Vencido = {
      id: string; mes: string; anio: number; contrato_id: string
      contrato: { numero: string; contratista_id: string | null; supervisor_id: string | null; estado: string | null; contratista: { nombre_completo: string } | null } | null
    }
    const candidatos = ((vencidos ?? []) as unknown as Vencido[])
      .filter(p => p.contrato?.contratista_id && p.contrato.supervisor_id && !contratoSuspendido(p.contrato.estado))

    if (candidatos.length) {
      const { data: enviadosAlguna } = await admin
        .from('periodos').select('contrato_id')
        .in('contrato_id', [...new Set(candidatos.map(p => p.contrato_id))])
        .not('fecha_envio', 'is', null)
      const conHistoria = new Set((enviadosAlguna ?? []).map(p => p.contrato_id as string))
      const primerizos = candidatos.filter(p => !conHistoria.has(p.contrato_id))

      const porSupervisor = new Map<string, Vencido[]>()
      for (const p of primerizos) {
        const sup = p.contrato!.supervisor_id!
        porSupervisor.set(sup, [...(porSupervisor.get(sup) ?? []), p])
      }
      for (const [sup, lista] of porSupervisor) {
        semana.aportar(sup, seccion(
          'primerizos',
          'Sin su primer informe',
          `${lista.length} persona${lista.length === 1 ? ' a tu cargo no ha enviado' : 's a tu cargo no han enviado'} todavía su primer informe por Contratista Digital, y el periodo de ${mesPrevio} ya se cerró. Solo tú puedes habilitarles el envío tardío; conviene acompañarlo de una explicación de cómo se usa.`,
          lista.map(p => `${capitalizarNombre(p.contrato?.contratista?.nombre_completo) || '?'} (contrato ${p.contrato!.numero})`),
          `${lista.length} sin su primer informe`,
        ))
        resumen.r1_primerizos++
      }
    }
  }

  // ══ El resumen semanal: UN correo por persona ═════════════════
  //
  // Cada regla de arriba aportó su sección a quien le toca; aquí sale una sola notificación por persona, y solo a quien
  // aportó algo. Nunca dos en 20 h al mismo destinatario: un reintento del cron no duplica. Los asesores reciben la
  // campana pero no el correo (lib/notifications.ts: ROLES_SOLO_CAMPANA).
  if (lunes && semana.personas().length) {
    const { data: recientes } = await admin
      .from('notificaciones').select('usuario_id').eq('tipo', 'resumen_semanal')
      .gte('created_at', new Date(Date.now() - 20 * 3600_000).toISOString())
    const yaEsteLunes = new Set((recientes ?? []).map(n => n.usuario_id as string))

    await Promise.allSettled(
      semana.personas().filter(id => !yaEsteLunes.has(id)).map(async (id) => {
        const datos = semana.datosDe(id)
        if (!datos) return
        await enviar({
          destinatarioId: id,
          tipo: 'resumen_semanal',
          titulo: tituloCampana(datos),
          mensaje: mensajeCampana(datos),
          datos,
        })
        resumen.resumen_semanal++
      }),
    )
  }

  if (ensayoSemana) {
    const ids = [...new Set(simulados.map(p => p.destinatarioId))]
    const { data: quienes } = ids.length
      ? await admin.from('usuarios').select('id, rol, nombre_completo, email').in('id', ids)
      : { data: [] as { id: string; rol: string; nombre_completo: string; email: string }[] }
    const porId = new Map((quienes ?? []).map(u => [u.id as string, u]))
    return NextResponse.json({
      ensayo: true, fecha: iso, dia, esLunes: lunes, ...resumen,
      nota: 'no se escribió ninguna notificación ni se envió ningún correo',
      enviaria: simulados.map(p => {
        const u = porId.get(p.destinatarioId)
        const d = p.datos as { asunto?: string; secciones?: { clave: string }[]; vencimientos?: { en30: unknown[]; en60: unknown[] } | null } | undefined
        return {
          tipo: p.tipo, rol: u?.rol, para: u?.nombre_completo, correo: p.sinCorreo ? '(solo campana)' : u?.rol === 'asesor' ? '(solo campana: asesor)' : 'sí',
          titulo: p.titulo, asunto: d?.asunto,
          secciones: d?.secciones?.map(x => x.clave), vencimientos: d?.vencimientos ? d.vencimientos.en30.length + d.vencimientos.en60.length : undefined,
        }
      }),
    })
  }

  return NextResponse.json({ ok: true, fecha: iso, dia, ...resumen })
}

/**
 * El recordatorio del día 24, renderizado con datos reales y enviado a una
 * sola dirección. Devuelve a quién imitó, para poder comprobar que las dos
 * variantes —con y sin el paso de la firma— salen como deben.
 */
async function ensayoRecordatorio(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  destino: string,
  mes: string,
  anio: number,
) {
  const { data: borradores } = await admin
    .from('periodos')
    .select('id, mes, anio, contrato_id, contrato:contratos(numero, contratista_id, supervisor_id)')
    .eq('mes', mes)
    .eq('anio', anio)
    .eq('estado', 'borrador')
    .eq('es_historico', false)

  const todos = ((borradores ?? []) as unknown as PeriodoBorrador[])
    .filter(p => p.contrato?.contratista_id)
  if (!todos.length) return { ensayo: true, destino, enviados: 0, nota: 'no hay periodos en borrador este mes' }

  const { data: personas } = await admin
    .from('usuarios')
    .select('id, nombre_completo, firma_url')
    .in('id', [...new Set(todos.map(p => p.contrato!.contratista_id!))])
  const porId = new Map((personas ?? []).map(u => [u.id as string, u as { nombre_completo: string; firma_url: string | null }]))

  // Una de cada variante: la diferencia entre los dos mensajes es el paso de
  // la firma, y verlos juntos es lo que permite juzgarla.
  const sinFirma = todos.find(p => porId.get(p.contrato!.contratista_id!)?.firma_url == null)
  const conFirma = todos.find(p => porId.get(p.contrato!.contratista_id!)?.firma_url != null)
  const muestras = [sinFirma, conFirma].filter(Boolean) as PeriodoBorrador[]

  const { data: acts } = await admin
    .from('actividades')
    .select('periodo_id')
    .in('periodo_id', muestras.map(p => p.id))
  const cuenta = new Map<string, number>()
  for (const a of acts ?? []) {
    const k = a.periodo_id as string
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }

  const plantilla = EMAIL_TEMPLATES['recordatorio']
  const enviados: { imitando: string; conPasoDeFirma: boolean; ok: boolean }[] = []

  for (const p of muestras) {
    const persona = porId.get(p.contrato!.contratista_id!)!
    const hechas = cuenta.get(p.id) ?? 0
    const avance = hechas === 0
      ? 'Todavía no has registrado ninguna actividad.'
      : `Llevas ${hechas} actividad${hechas === 1 ? '' : 'es'} registrada${hechas === 1 ? '' : 's'}.`
    const pasos = [
      persona.firma_url == null ? 'subir tu firma' : null,
      'registrar tus actividades',
      'adjuntar tu planilla de seguridad social',
      'enviarlo a revisión',
    ].filter(Boolean) as string[]

    const { subject, html } = plantilla({
      nombreDestinatario: (persona.nombre_completo ?? '').split(' ')[0] ?? 'Contratista',
      mes: p.mes,
      anio: p.anio,
      contrato: p.contrato!.numero,
      detalle: detalleRecordatorio(avance, pasos),
    })

    const res = await enviarCorreo({ to: destino, subject: `[ENSAYO] ${subject}`, html })
    enviados.push({
      imitando: persona.nombre_completo,
      conPasoDeFirma: persona.firma_url == null,
      ok: res.ok,
    })
  }

  return {
    ensayo: true,
    destino,
    enviados,
    nota: 'no se escribió ninguna notificación: el envío real sigue intacto',
    alcanceReal: todos.length,
  }
}
