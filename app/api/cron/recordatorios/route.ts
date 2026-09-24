/**
 * GET /api/cron/recordatorios — cron diario de alertas automáticas.
 *
 * Invocado por Vercel Cron (vercel.json) todos los días a las 12:00 UTC
 * (7:00 AM Bogotá). Evalúa cinco reglas y dispara solo las que aplican hoy.
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
 *  R1 — Contratistas con informe en borrador (escalonado por día del mes,
 *       22 · 24 · 28 · 2; el 24 es la víspera del corte real del 25):
 *       día 22: recordatorio suave · día 28: urgente · día 2: venció (mes anterior)
 *       El suave estaba el 25 y se adelantó al 22: en agosto el 82% del
 *       trabajo se cargó entre el 24 y el 28, así que avisar el 25 llegaba
 *       cuando la avalancha ya había empezado. Los tres llevan el avance real
 *       de la persona, no solo la fecha — que la fecha ya se la saben.
 *       El aviso de VENCIDO nunca va a quien no ha enviado un informe en su
 *       vida: para esa persona sería su primer contacto con el sistema, y no
 *       puede arreglarlo. Va a su supervisor, que es quien tiene la llave.
 *  R2 — Supervisor + asesores DE SU DEPENDENCIA: el estado de su bandeja —
 *       lo que espera revisión y lo que ya aprobaron y sigue sin radicar
 *  R3 — Contratista con informe DEVUELTO sin corregir (≥3 días), con las
 *       correcciones dentro; a las 2 semanas escala al supervisor
 *  R4 — Contratación/admin: contratos sin CDP, CRP o contrato firmado
 *  R7 — Admin + supervisor del contrato: contratos que vencen en 60 o 30 días
 *
 * Anti-spam:
 *  - R1: guard de 20 h por (tipo, periodo) — un retry del cron no duplica
 *  - R1: el aviso al supervisor sobre primerizos, 20 h (la regla corre 1 vez/mes)
 *  - R2: solo si llegó algo en 24 h o algo lleva ≥5 días; máximo 1 cada 3 días
 *        (el guard se evalúa por persona, no por dependencia)
 *  - R3: máximo uno por semana y por periodo; el escalado, uno por semana
 *  - R4: semanal por destinatario — son huecos que no cambian a diario
 *  - R7: dedup natural (solo dispara el día exacto de -60/-30)
 *
 * Auth: Vercel envía `Authorization: Bearer ${CRON_SECRET}` automáticamente
 * cuando la env var existe. Sin secret válido → 401.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { enviarNotificacion } from '@/lib/notifications'
import { notasPorObligacion } from '@/lib/notas-obligaciones'
import { cargarAmbitos, destinatariosDe } from '@/lib/alcance'
import { MESES } from '@/lib/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** «a, b y c» — una lista en español, no separada por comas hasta el final. */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** Fecha actual en Bogotá (el server corre en UTC). */
function hoyBogota(): { anio: number; mesIdx: number; dia: number; iso: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()) // "YYYY-MM-DD"
  const [anio, mes, dia] = parts.split('-').map(Number)
  return { anio, mesIdx: mes - 1, dia, iso: parts }
}

/** ISO date (YYYY-MM-DD) a N días de hoy Bogotá. */
function fechaMasDias(isoHoy: string, dias: number): string {
  const d = new Date(isoHoy + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

type PeriodoBorrador = {
  id: string; mes: string; anio: number; contrato_id: string
  contrato: { numero: string; contratista_id: string | null; supervisor_id: string | null } | null
}

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const { anio, mesIdx, dia, iso } = hoyBogota()
  const resumen: Record<string, number> = { r1_recordatorios: 0, r1_primerizos: 0, r2_bandeja: 0, r3_devueltos: 0, r3_escalados: 0, r4_expediente: 0, r7_vencimientos: 0 }

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
  if (dia === 22 || dia === 24 || dia === 28 || dia === 2) {
    // Día 2 → el mes VENCIDO es el anterior; días 22/28 → el mes en curso
    const esVencido = dia === 2
    const mesObjetivoIdx = esVencido ? (mesIdx === 0 ? 11 : mesIdx - 1) : mesIdx
    const anioObjetivo = esVencido && mesIdx === 0 ? anio - 1 : anio
    const mesNombre = MESES[mesObjetivoIdx]

    const tipo = esVencido
      ? 'recordatorio_vencido'
      : dia === 28 ? 'recordatorio_urgente'
      : dia === 24 ? 'recordatorio_semana_final'
      : 'recordatorio'
    let consulta = admin
      .from('periodos')
      .select('id, mes, anio, contrato_id, contrato:contratos(numero, contratista_id, supervisor_id)')
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

    const todos = ((borradores ?? []) as unknown as PeriodoBorrador[])
      .filter(p => p.contrato?.contratista_id)

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
    const primerizos = esVencido ? todos.filter(p => !conHistoria.has(p.contrato_id)) : []
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
    // Solo hace falta el día 24, que es el único aviso que enumera los pasos
    // que faltan. Decirle «sube tu firma» a quien ya la tiene es la clase de
    // instrucción que no aplica y que enseña a no leer los correos; y
    // callársela a quien no la tiene es peor, porque es su primer muro: 27
    // de los 120 contratistas no la tienen, y ninguno de esos 27 ha logrado
    // enviar un informe nunca.
    const sinFirma = new Set<string>()
    if (dia === 24 && pendientesIds.length) {
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
            : dia === 24
              ? `Última semana para enviar tu informe de ${p.mes}`
              : `Recuerda enviar tu informe de ${p.mes}`

        // El avance va primero y en concreto: quien no ha empezado y quien ya
        // lleva media docena de actividades no están en la misma situación, y
        // hasta ahora recibían exactamente el mismo texto.
        const avance = hechas === 0
          ? 'Todavía no has registrado ninguna actividad.'
          : `Llevas ${hechas} actividad${hechas === 1 ? '' : 'es'} registrada${hechas === 1 ? '' : 's'}.`

        // El día 24 enumera lo que falta, en el orden en que se hace, y la
        // firma solo aparece para quien no la tiene.
        const pasos = [
          sinFirma.has(p.contrato!.contratista_id!) ? 'subir tu firma' : null,
          'registrar tus actividades',
          'adjuntar tu planilla de seguridad social',
          'enviarlo a revisión',
        ].filter(Boolean) as string[]

        const mensaje = esVencido
          ? `El plazo para enviar tu informe de ${p.mes} ${p.anio} ya venció. Contacta a tu supervisor para habilitar el envío tardío.`
          : dia === 24
            ? `Todavía no hemos recibido tu informe de actividades de ${p.mes} ${p.anio} del contrato ${p.contrato!.numero}. ${avance} Ya estamos en la última semana del mes, así que este es un buen momento para ${enumerar(pasos)}.`
            : `${avance} Aún no has enviado tu informe de ${p.mes} ${p.anio} del contrato ${p.contrato!.numero}. Ingresa a Contratista Digital para completarlo.`
        await enviarNotificacion({
          destinatarioId: p.contrato!.contratista_id!,
          tipo, titulo, mensaje,
          periodoId: p.id,
          mes: p.mes, anio: p.anio,
          contrato: p.contrato!.numero,
        })
        resumen.r1_recordatorios++
      }),
    )

    // Los primerizos: en vez de regañarlos, se avisa a su supervisor.
    //
    // Es el único mensaje del sistema que va sobre alguien y no a alguien, y
    // va donde está la capacidad de resolverlo: el periodo vencido está
    // bloqueado y `habilitado_tardio` solo lo levanta el supervisor. Pedirle
    // a la contratista que envíe algo que la pantalla no la deja enviar es
    // mandarla contra una puerta cerrada.
    if (primerizos.length) {
      const porSupervisor = new Map<string, PeriodoBorrador[]>()
      for (const p of primerizos) {
        const sup = p.contrato?.supervisor_id
        if (!sup) continue
        porSupervisor.set(sup, [...(porSupervisor.get(sup) ?? []), p])
      }

      // Una vez al mes basta: esta regla solo corre el día 2.
      const { data: yaSup } = await admin
        .from('notificaciones')
        .select('usuario_id')
        .eq('tipo', 'primer_informe_pendiente')
        .gte('created_at', new Date(Date.now() - 20 * 3600_000).toISOString())
      const supYaAvisados = new Set((yaSup ?? []).map(n => n.usuario_id as string))

      const { data: nombres } = await admin
        .from('contratos')
        .select('id, numero, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)')
        .in('id', primerizos.map(p => p.contrato_id))
      const etiqueta = new Map<string, string>()
      for (const c of (nombres ?? []) as any[]) {
        etiqueta.set(c.id as string, `${c.contratista?.nombre_completo ?? '?'} (contrato ${c.numero})`)
      }

      await Promise.allSettled(
        [...porSupervisor.entries()]
          .filter(([sup]) => !supYaAvisados.has(sup))
          .map(async ([sup, lista]) => {
            const quienes = lista.map(p => etiqueta.get(p.contrato_id) ?? '?')
            const detalle = `${lista.length} persona${lista.length === 1 ? '' : 's'} a tu cargo no ha${lista.length === 1 ? '' : 'n'} enviado todavía su primer informe por Contratista Digital, y el periodo de ${mesNombre} ya se les cerró: ${quienes.slice(0, 10).join(' · ')}${quienes.length > 10 ? ` · y ${quienes.length - 10} más` : ''}.`
            await enviarNotificacion({
              destinatarioId: sup,
              tipo: 'primer_informe_pendiente',
              titulo: `${lista.length} contratista(s) sin su primer informe`,
              mensaje: detalle,
              mes: mesNombre,
              anio: anioObjetivo,
              detalle,
            })
            resumen.r1_primerizos++
          }),
      )
    }
  }

  // ══ R2 — El estado de tu bandeja (resumen diario, por dependencia) ═════
  //
  // Un solo correo a quien revisa, con las dos cosas que pueden quedarse
  // quietas en sus manos: lo que espera revisión y lo que ya aprobó y sigue
  // sin radicar.
  //
  // ── Por qué las dos cosas van juntas ──────────────────────────────────
  //
  // Eran dos reglas. La de radicación (R5) mandaba la MISMA lista a todos los
  // supervisores y al admin: el 17 de septiembre salieron tres nombres —dos de
  // Gobierno y uno de Hacienda— a cinco personas, y para Desarrollo Territorial
  // y Bienestar Social el contenido era íntegramente ajeno, cero de tres.
  //
  // No bastaba con filtrarla: en 209 radicaciones hechas por alguien que no es
  // el admin, las 209 las hizo el supervisor de esa misma dependencia. O sea
  // que quien radica es exactamente la misma persona a la que esta regla ya
  // escribía. Dos correos al mismo destinatario sobre su propia bandeja son
  // uno. Y así el secretario deja de recibir alarmas sueltas: lo que le llega
  // es el estado de su trabajo.
  //
  // Solo escribe cuando hay algo que hacer: o llegó algo nuevo en 24 h, o algo
  // lleva demasiado esperando. En los días tranquilos calla.
  {
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

    if (porRevisar.length || porRadicar.length) {
      const hace24h = Date.now() - 24 * 3600_000
      const hace5d = Date.now() - 5 * 24 * 3600_000

      // Un aviso por revisor cada 3 días como mucho; y nunca dos en 20 h, que
      // es el guard que ya usa R1 contra los reintentos del cron.
      const hace3d = new Date(Date.now() - 3 * 24 * 3600_000).toISOString()
      const { data: recientes } = await admin
        .from('notificaciones')
        .select('usuario_id, created_at')
        .eq('tipo', 'revision_pendiente')
        .gte('created_at', hace3d)
      const ultimoAviso = new Map<string, number>()
      for (const n of recientes ?? []) {
        const t = new Date(n.created_at as string).getTime()
        const k = n.usuario_id as string
        ultimoAviso.set(k, Math.max(ultimoAviso.get(k) ?? 0, t))
      }

      const etiqueta = (p: Fila) =>
        `${p.contrato?.contratista?.nombre_completo ?? '?'} (${p.mes})`

      // El reparto sale de lib/alcance.ts: cada dependencia, su gente. Ninguna
      // consulta por rol suelta — así es como se coló la lista global.
      await Promise.allSettled(
        [...ambitos.values()].map(async (ambito) => {
          const revisar = porRevisar.filter(p => p.contrato!.dependencia_id === ambito.dependenciaId)
          const radicar = porRadicar.filter(p => p.contrato!.dependencia_id === ambito.dependenciaId)
          if (revisar.length === 0 && radicar.length === 0) return

          const nuevos = revisar.filter(p => p.fecha_envio && new Date(p.fecha_envio).getTime() >= hace24h)
          const viejos = revisar.filter(p => p.fecha_envio && new Date(p.fecha_envio).getTime() <= hace5d)
          const estancadas = radicar.filter(p => {
            const f = aprobadoEn.get(p.id)
            return f && new Date(f).getTime() <= hace5d
          })

          // Nada nuevo y nada envejeciendo → silencio.
          if (nuevos.length === 0 && viejos.length === 0 && estancadas.length === 0) return

          const partes = [
            revisar.length
              ? `Tienes ${revisar.length} informe${revisar.length === 1 ? '' : 's'} esperando revisión.`
              : '',
            nuevos.length ? `${nuevos.length} lleg${nuevos.length === 1 ? 'ó' : 'aron'} en las últimas 24 horas.` : '',
            viejos.length
              ? `${viejos.length} llev${viejos.length === 1 ? 'a' : 'an'} más de 5 días sin revisar: ${viejos.slice(0, 5).map(etiqueta).join(', ')}${viejos.length > 5 ? ` y ${viejos.length - 5} más` : ''}.`
              : '',
            estancadas.length
              ? `Y ${estancadas.length} cuenta${estancadas.length === 1 ? '' : 's'} que ya aprobaste llev${estancadas.length === 1 ? 'a' : 'an'} 5 días o más sin radicar: ${estancadas.slice(0, 5).map(etiqueta).join(', ')}${estancadas.length > 5 ? ` y ${estancadas.length - 5} más` : ''}.`
              : '',
          ].filter(Boolean)
          const detalle = partes.join(' ')

          const titulo = revisar.length && estancadas.length
            ? `${revisar.length} por revisar y ${estancadas.length} por radicar`
            : estancadas.length
              ? `${estancadas.length} cuenta(s) esperando radicación`
              : `${revisar.length} informe(s) esperando revisión`

          await Promise.allSettled(
            destinatariosDe(ambito).map(async (revisorId) => {
              const ultimo = ultimoAviso.get(revisorId) ?? 0
              if (Date.now() - ultimo < 20 * 3600_000) return          // retry del cron
              // Si no hay nada nuevo, no se insiste más de una vez cada 3 días.
              if (nuevos.length === 0 && ultimo > 0) return

              await enviarNotificacion({
                destinatarioId: revisorId,
                tipo: 'revision_pendiente',
                titulo,
                mensaje: detalle,
                // `motivo` es lo que la plantilla usa de asunto; `titulo` va a
                // la campana. Los dos dicen lo mismo a propósito.
                motivo: titulo,
                detalle,
              })
              resumen.r2_bandeja++
            }),
          )
        }),
      )
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

          await enviarNotificacion({
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

      // Escalado: una sola notificación por supervisor con todo lo suyo.
      if (estancados.length) {
        const porSupervisor = new Map<string, Devuelto[]>()
        for (const d of estancados) {
          const sup = d.contrato!.supervisor_id
          if (!sup) continue
          porSupervisor.set(sup, [...(porSupervisor.get(sup) ?? []), d])
        }

        const hace7dEsc = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
        const { data: supAvisados } = await admin
          .from('notificaciones')
          .select('usuario_id')
          .eq('tipo', 'devuelto_estancado')
          .gte('created_at', hace7dEsc)
        const supYa = new Set((supAvisados ?? []).map(n => n.usuario_id as string))

        await Promise.allSettled(
          [...porSupervisor.entries()]
            .filter(([sup]) => !supYa.has(sup))
            .map(async ([sup, lista]) => {
              const nombres = lista
                .slice(0, 5)
                .map(d => `${d.contrato?.contratista?.nombre_completo ?? '?'} (${d.mes})`)
                .join(', ')
              const detalle = `Hay ${lista.length} informe${lista.length === 1 ? '' : 's'} devuelto${lista.length === 1 ? '' : 's'} hace más de dos semanas sin corregir: ${nombres}${lista.length > 5 ? ` y ${lista.length - 5} más` : ''}.`
              await enviarNotificacion({
                destinatarioId: sup,
                tipo: 'devuelto_estancado',
                titulo: `${lista.length} devolución(es) sin movimiento`,
                mensaje: detalle,
                detalle,
              })
              resumen.r3_escalados++
            }),
        )
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
  // de leerse.
  {
    const hace7dExp = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
    const { data: avisadosExp } = await admin
      .from('notificaciones')
      .select('usuario_id')
      .eq('tipo', 'expediente_incompleto')
      .gte('created_at', hace7dExp)
    const yaAvisadosExp = new Set((avisadosExp ?? []).map(n => n.usuario_id as string))

    const { data: vigentesRaw } = await admin
      .from('contratos')
      .select('id, numero, cdp, crp, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)')
      .eq('activo', true)
      .gte('fecha_fin', iso)

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
        const linea = (c: Vig) => `${c.numero} (${c.contratista?.nombre_completo ?? '?'})`
        const partes: string[] = []
        if (faltaCdpCrp.length) {
          partes.push(`${faltaCdpCrp.length} sin CDP o CRP: ${faltaCdpCrp.slice(0, 8).map(linea).join(', ')}${faltaCdpCrp.length > 8 ? ` y ${faltaCdpCrp.length - 8} más` : ''}.`)
        }
        if (faltaContrato.length) {
          partes.push(`${faltaContrato.length} van a pasar su primera cuenta sin el contrato en el expediente: ${faltaContrato.slice(0, 8).map(linea).join(', ')}${faltaContrato.length > 8 ? ` y ${faltaContrato.length - 8} más` : ''}.`)
        }
        const detalle = partes.join(' ')

        const { data: gestores } = await admin
          .from('usuarios').select('id').in('rol', ['contratacion', 'admin']).eq('activo', true)

        await Promise.allSettled(
          (gestores ?? []).filter(u => !yaAvisadosExp.has(u.id as string)).map(async (u) => {
            await enviarNotificacion({
              destinatarioId: u.id as string,
              tipo: 'expediente_incompleto',
              titulo: 'Documentación pendiente en contratos vigentes',
              mensaje: detalle,
              detalle,
            })
            resumen.r4_expediente++
          }),
        )
      }
    }
  }

  // ══ R7 — Contratos que vencen en 60 o 30 días ═════════════════
  {
    const en60 = fechaMasDias(iso, 60)
    const en30 = fechaMasDias(iso, 30)
    const { data: porVencer } = await admin
      .from('contratos')
      .select('id, numero, fecha_fin, supervisor_id, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)')
      .in('fecha_fin', [en60, en30])

    type ContratoVence = {
      id: string; numero: string; fecha_fin: string; supervisor_id: string | null
      contratista: { nombre_completo: string } | null
    }
    const contratos = ((porVencer ?? []) as unknown as ContratoVence[])

    if (contratos.length) {
      // Admin + Contratación (esta última tramita las prórrogas/otrosíes)
      const { data: admins } = await admin.from('usuarios').select('id').in('rol', ['admin', 'contratacion'])
      const adminIds = (admins ?? []).map(a => a.id)

      await Promise.allSettled(
        contratos.map(async (c) => {
          const dias = c.fecha_fin === en30 ? 30 : 60
          const detalle = `El contrato ${c.numero} de ${c.contratista?.nombre_completo ?? '?'} vence el ${c.fecha_fin} (en ${dias} días). Si continuará, es momento de tramitar la prórroga u otrosí.`
          // Admin(s) + supervisor del contrato, sin duplicar
          const destinatarios = [...new Set([...adminIds, ...(c.supervisor_id ? [c.supervisor_id] : [])])]
          await Promise.allSettled(
            destinatarios.map(id => enviarNotificacion({
              destinatarioId: id,
              tipo: 'contrato_vencimiento',
              titulo: `Contrato ${c.numero} vence en ${dias} días`,
              mensaje: detalle,
              contrato: c.numero,
              detalle,
            })),
          )
          resumen.r7_vencimientos += destinatarios.length
        }),
      )
    }
  }

  return NextResponse.json({ ok: true, fecha: iso, dia, ...resumen })
}
