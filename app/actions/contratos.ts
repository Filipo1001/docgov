'use server'

/**
 * Server Actions: Contract management (admin only)
 *
 * El insert corre server-side, de modo que la autorización se valida con las
 * cookies httpOnly — sin depender de que la sesión del navegador esté
 * "caliente". Corrige el bug donde crear un contrato se quedaba colgado en
 * "Guardando..." (browser client + RLS con sesión fría, sin try/catch).
 * Mismo patrón que actividades y obligaciones.
 */

import { randomBytes } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { normalizeName, normalizeEmail, normalizeFreeText } from '@/lib/format'
import { extraerPath } from '@/lib/storage-firmado'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'
import { ESTADOS_CONTRATO, type EstadoContrato } from '@/lib/estado-contrato'

/** Contraseña temporal aleatoria (mismo criterio que admin.ts). */
function generarPasswordSegura(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(randomBytes(12)).map((b) => chars[b % chars.length]).join('')
}

async function requireAdminId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()
  // Contratación gestiona contratos igual que admin (crear, editar, generar periodos)
  return data?.rol === 'admin' || data?.rol === 'contratacion' ? user.id : null
}

export type CrearContratoInput = {
  dependencia_id: string
  contratista_id: string
  supervisor_id: string
  numero: string
  anio: number
  objeto: string
  modalidad_seleccion: string
  valor_total: number
  valor_mensual: number
  valor_letras_total: string
  valor_letras_mensual: string
  plazo_dias: number
  fecha_inicio: string
  fecha_fin: string
  cdp: string | null
  crp: string | null
  secop_url: string | null
}

export async function crearContrato(
  input: CrearContratoInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const adminId = await requireAdminId()
    if (!adminId) return { error: 'No autorizado' }

    // Validaciones mínimas (defensa server-side; el form ya valida en cliente)
    if (!input.numero?.trim()) return { error: 'El número de contrato es obligatorio' }
    if (!input.objeto?.trim()) return { error: 'El objeto del contrato es obligatorio' }
    if (!input.dependencia_id) return { error: 'Selecciona la dependencia' }
    if (!input.contratista_id) return { error: 'Selecciona el contratista' }
    if (!input.supervisor_id) return { error: 'Selecciona el supervisor' }
    if (!input.fecha_inicio || !input.fecha_fin) return { error: 'Las fechas son obligatorias' }
    if (!Number.isFinite(input.valor_total) || input.valor_total <= 0) {
      return { error: 'El valor total debe ser mayor a 0' }
    }

    const adminClient = createAdminSupabaseClient()

    // municipio (single-tenant): tomar el del registro
    const { data: muni } = await adminClient.from('municipios').select('id').limit(1).single()
    if (!muni) return { error: 'No se encontró el municipio configurado' }

    const meses = Math.round(input.plazo_dias / 30) // aproximado, compat hacia atrás

    const { data, error } = await adminClient
      .from('contratos')
      .insert({
        municipio_id: muni.id,
        dependencia_id: input.dependencia_id,
        contratista_id: input.contratista_id,
        supervisor_id: input.supervisor_id,
        numero: input.numero.trim(),
        anio: input.anio,
        objeto: input.objeto.trim(),
        modalidad_seleccion: input.modalidad_seleccion,
        valor_total: input.valor_total,
        valor_mensual: input.valor_mensual || 0,
        valor_letras_total: input.valor_letras_total,
        valor_letras_mensual: input.valor_letras_mensual,
        plazo_dias: input.plazo_dias,
        plazo_meses: meses,
        fecha_inicio: input.fecha_inicio,
        fecha_fin: input.fecha_fin,
        cdp: input.cdp,
        crp: input.crp,
        secop_url: input.secop_url,
      })
      .select('id')
      .single()

    if (error) {
      // Mensaje claro para el caso más común: contrato duplicado (numero+municipio)
      if (error.code === '23505') {
        return { error: `Ya existe un contrato con el número ${input.numero} en este municipio.` }
      }
      return { error: `Error al crear el contrato: ${error.message}` }
    }

    revalidatePath('/dashboard/contratos')
    return { data: { id: data.id as string } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Crear contrato + contratista en un solo flujo ──────────────────────────

export type NuevoContratistaInput = {
  nombre_completo: string
  cedula: string
  email: string
  telefono?: string
  direccion?: string
  banco?: string
  tipo_cuenta?: string
  numero_cuenta?: string
  /** true = factura electrónica · false = no obligado · undefined = sin verificar */
  obligado_facturar_electronicamente?: boolean | null
}

/**
 * Crea un contrato y, opcionalmente, el usuario contratista en el mismo flujo.
 *
 * Si `nuevoContratista` viene presente, se crea primero la cuenta (auth +
 * usuarios, rol contratista) y su id se usa como contratista_id del contrato.
 * ATÓMICO: si el contrato falla, se elimina el usuario recién creado para no
 * dejar cuentas huérfanas. Si `contratista_id` viene, se usa tal cual (flujo
 * clásico de seleccionar un contratista existente).
 *
 * Devuelve la contraseña temporal solo cuando se creó un contratista nuevo.
 */
export async function crearContratoConContratista(
  input: Omit<CrearContratoInput, 'contratista_id'> & {
    contratista_id?: string
    nuevoContratista?: NuevoContratistaInput
  },
): Promise<ActionResult<{ id: string; passwordInicial?: string; contratistaNombre?: string }>> {
  try {
    const adminId = await requireAdminId()
    if (!adminId) return { error: 'No autorizado' }

    const adminClient = createAdminSupabaseClient()
    const { data: muni } = await adminClient.from('municipios').select('id').limit(1).single()
    if (!muni) return { error: 'No se encontró el municipio configurado' }

    // ── Paso 1: resolver contratista_id (crear si es nuevo) ──────
    let contratistaId = input.contratista_id?.trim() || ''
    let usuarioCreadoId: string | null = null
    let passwordInicial: string | undefined
    let contratistaNombre: string | undefined

    if (!contratistaId && input.nuevoContratista) {
      const nc = input.nuevoContratista
      const email = normalizeEmail(nc.email)
      const nombre = normalizeName(nc.nombre_completo)
      if (!email) return { error: 'El correo del contratista es obligatorio' }
      if (!nombre) return { error: 'El nombre del contratista es obligatorio' }
      if (!nc.cedula?.trim()) return { error: 'La cédula del contratista es obligatoria' }

      passwordInicial = generarPasswordSegura()
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password: passwordInicial,
        email_confirm: true,
        user_metadata: { nombre_completo: nombre },
      })
      if (authError || !authData?.user) {
        return { error: authError?.message ?? 'Error creando la cuenta del contratista' }
      }
      usuarioCreadoId = authData.user.id

      const { error: dbError } = await adminClient.from('usuarios').insert({
        id: usuarioCreadoId,
        email,
        nombre_completo: nombre,
        cedula: nc.cedula.trim(),
        rol: 'contratista',
        telefono: nc.telefono?.trim() || null,
        direccion: nc.direccion ? normalizeFreeText(nc.direccion) : null,
        banco: nc.banco?.trim() || null,
        tipo_cuenta: nc.tipo_cuenta?.trim() || null,
        numero_cuenta: nc.numero_cuenta?.trim() || null,
        tipo_documento: 'CC',
        // Condición de la persona ante la DIAN, no del contrato. Decide si en
        // el futuro se genera Cuenta de Cobro o se exige la factura.
        obligado_facturar_electronicamente: nc.obligado_facturar_electronicamente ?? null,
        municipio_id: muni.id,
      })
      if (dbError) {
        // Rollback: la fila de usuarios falló → borrar el auth user huérfano
        await adminClient.auth.admin.deleteUser(usuarioCreadoId).catch(() => {})
        if (dbError.code === '23505') {
          return { error: 'Ya existe un usuario con ese correo o cédula' }
        }
        return { error: `Error al crear el contratista: ${dbError.message}` }
      }
      contratistaId = usuarioCreadoId
      contratistaNombre = nombre
    }

    if (!contratistaId) return { error: 'Selecciona o crea el contratista' }

    // ── Paso 2: validaciones del contrato ────────────────────────
    if (!input.numero?.trim()) { await rollbackUsuario(adminClient, usuarioCreadoId); return { error: 'El número de contrato es obligatorio' } }
    if (!input.objeto?.trim()) { await rollbackUsuario(adminClient, usuarioCreadoId); return { error: 'El objeto del contrato es obligatorio' } }
    if (!input.dependencia_id) { await rollbackUsuario(adminClient, usuarioCreadoId); return { error: 'Selecciona la dependencia' } }
    if (!input.supervisor_id) { await rollbackUsuario(adminClient, usuarioCreadoId); return { error: 'Selecciona el supervisor' } }
    if (!input.fecha_inicio || !input.fecha_fin) { await rollbackUsuario(adminClient, usuarioCreadoId); return { error: 'Las fechas son obligatorias' } }
    if (!Number.isFinite(input.valor_total) || input.valor_total <= 0) {
      await rollbackUsuario(adminClient, usuarioCreadoId)
      return { error: 'El valor total debe ser mayor a 0' }
    }

    // ── Paso 3: crear el contrato ────────────────────────────────
    const meses = Math.round(input.plazo_dias / 30)
    const { data, error } = await adminClient
      .from('contratos')
      .insert({
        municipio_id: muni.id,
        dependencia_id: input.dependencia_id,
        contratista_id: contratistaId,
        supervisor_id: input.supervisor_id,
        numero: input.numero.trim(),
        anio: input.anio,
        objeto: input.objeto.trim(),
        modalidad_seleccion: input.modalidad_seleccion,
        valor_total: input.valor_total,
        valor_mensual: input.valor_mensual || 0,
        valor_letras_total: input.valor_letras_total,
        valor_letras_mensual: input.valor_letras_mensual,
        plazo_dias: input.plazo_dias,
        plazo_meses: meses,
        fecha_inicio: input.fecha_inicio,
        fecha_fin: input.fecha_fin,
        cdp: input.cdp,
        crp: input.crp,
        secop_url: input.secop_url,
      })
      .select('id')
      .single()

    if (error) {
      // Rollback del usuario recién creado para no dejarlo huérfano
      await rollbackUsuario(adminClient, usuarioCreadoId)
      if (error.code === '23505') {
        return { error: `Ya existe un contrato con el número ${input.numero} en este municipio.` }
      }
      return { error: `Error al crear el contrato: ${error.message}` }
    }

    revalidatePath('/dashboard/contratos')
    revalidatePath('/dashboard/admin/usuarios')
    return { data: { id: data.id as string, passwordInicial, contratistaNombre } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/** Borra un usuario recién creado (auth) si un paso posterior falló. */
async function rollbackUsuario(
  adminClient: ReturnType<typeof createAdminSupabaseClient>,
  usuarioId: string | null,
): Promise<void> {
  if (!usuarioId) return
  await adminClient.auth.admin.deleteUser(usuarioId).catch(() => {})
}

// ─── Generar periodos ───────────────────────────────────────────────────────

export type PeriodoNuevo = {
  numero_periodo: number
  mes: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_cobro: number
  es_historico: boolean
}

/**
 * Inserta los periodos de un contrato (calculados en cliente con
 * calcularDistribucionPeriodos). Corre server-side para que el insert no
 * dependa de la sesión del navegador (mismo bug "Generando..." colgado).
 */
export async function generarPeriodos(
  contratoId: string,
  periodos: PeriodoNuevo[],
): Promise<ActionResult<{ periodos: Record<string, unknown>[] }>> {
  try {
    const adminId = await requireAdminId()
    if (!adminId) return { error: 'No autorizado' }

    if (!periodos.length) return { error: 'No hay periodos para generar' }

    const adminClient = createAdminSupabaseClient()

    // Guard anti-duplicado: no regenerar si ya existen periodos.
    const { count } = await adminClient
      .from('periodos')
      .select('id', { count: 'exact', head: true })
      .eq('contrato_id', contratoId)

    if ((count ?? 0) > 0) return { error: 'Los periodos ya fueron generados para este contrato' }

    const filas = periodos.map((p) => ({
      contrato_id: contratoId,
      numero_periodo: p.numero_periodo,
      mes: p.mes,
      anio: p.anio,
      fecha_inicio: p.fecha_inicio,
      fecha_fin: p.fecha_fin,
      valor_cobro: p.valor_cobro,
      estado: 'borrador',
      es_historico: p.es_historico,
      ...(p.es_historico && {
        historico_marcado_at: new Date().toISOString(),
        historico_nota: 'Periodo anterior a la digitalización del sistema — marcado automáticamente',
      }),
    }))

    // Se devuelven los periodos insertados —con su id real— para que la
    // pantalla los liste al instante, sin una segunda consulta de por medio.
    const { data: creados, error } = await adminClient
      .from('periodos').insert(filas).select('*').order('numero_periodo')
    if (error) return { error: `Error generando periodos: ${error.message}` }

    revalidatePath(`/dashboard/contratos/${contratoId}`)
    return { data: { periodos: (creados ?? []) as Record<string, unknown>[] } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Edición del contrato ────────────────────────────────────────────────────

/**
 * Campos del contrato que se pueden corregir, agrupados por lo que arriesgan.
 *
 * El contrato es la fuente de la que se derivan TODOS los documentos oficiales,
 * así que la libertad para corregirlo se estrecha a medida que el expediente
 * avanza. Tres niveles:
 *
 *  · SIEMPRE — metadatos administrativos y personas. Que un supervisor cambie
 *    o que se corrija un número de CDP son hechos normales de la vida del
 *    contrato; nada de lo ya emitido se vuelve falso por registrarlos.
 *
 *  · HASTA GENERAR PERIODOS — valores y plazo. Los periodos se calculan a
 *    partir de estos campos; cambiarlos después dejaría la distribución de
 *    pagos desincronizada del contrato. A partir de ahí la vía correcta es un
 *    otrosí, que sí queda registrado como acto administrativo.
 *
 *  · HASTA EL PRIMER INFORME PRESENTADO — identidad y objeto. En cuanto un
 *    informe sale de borrador, esos textos ya viajaron impresos en un
 *    documento con código de verificación y huella; cambiarlos haría que el
 *    documento archivado y el sistema dijeran cosas distintas.
 */
const CAMPOS_SIEMPRE = [
  'modalidad_seleccion', 'cdp', 'crp', 'numero_cdp', 'numero_crp', 'secop_url',
  'supervisor_id', 'dependencia_id', 'banco', 'tipo_cuenta', 'numero_cuenta',
] as const

const CAMPOS_HASTA_PERIODOS = [
  'valor_total', 'valor_mensual', 'valor_letras_total', 'valor_letras_mensual',
  'plazo_dias', 'plazo_meses', 'fecha_inicio', 'fecha_fin',
] as const

const CAMPOS_HASTA_PRIMER_INFORME = ['numero', 'anio', 'objeto'] as const

export type CampoContrato =
  | (typeof CAMPOS_SIEMPRE)[number]
  | (typeof CAMPOS_HASTA_PERIODOS)[number]
  | (typeof CAMPOS_HASTA_PRIMER_INFORME)[number]

export interface CamposBloqueados {
  /** Ya existen periodos: valores y plazo exigen otrosí. */
  economicos: boolean
  /** Algún informe salió de borrador: identidad y objeto quedan fijados. */
  identidad: boolean
  motivoEconomicos: string | null
  motivoIdentidad: string | null
}

/** Qué se puede tocar hoy en este contrato, y por qué no lo demás. */
export async function getCamposBloqueados(contratoId: string): Promise<CamposBloqueados> {
  const admin = createAdminSupabaseClient()
  const [{ count: periodos }, { count: presentados }] = await Promise.all([
    admin.from('periodos').select('id', { count: 'exact', head: true }).eq('contrato_id', contratoId),
    admin.from('periodos').select('id', { count: 'exact', head: true })
      .eq('contrato_id', contratoId).neq('estado', 'borrador'),
  ])

  const conPeriodos = (periodos ?? 0) > 0
  const conInformes = (presentados ?? 0) > 0

  return {
    economicos: conPeriodos,
    identidad: conInformes,
    motivoEconomicos: conPeriodos
      ? `Los ${periodos} periodos ya están generados a partir de estos valores. Para modificarlos se requiere un otrosí.`
      : null,
    motivoIdentidad: conInformes
      ? `${presentados} informe(s) ya se presentaron con estos datos impresos y sellados.`
      : null,
  }
}

export async function actualizarContrato(
  contratoId: string,
  cambios: Partial<Record<CampoContrato, string | number | null>>,
): Promise<ActionResult<{ camposActualizados: number }>> {
  try {
    const gestorId = await requireAdminId()
    if (!gestorId) return { error: 'No autorizado' }

    const admin = createAdminSupabaseClient()
    const { data: actual } = await admin
      .from('contratos').select('*').eq('id', contratoId).single()
    if (!actual) return { error: 'Contrato no encontrado' }

    const bloqueo = await getCamposBloqueados(contratoId)

    const permitidos = new Set<string>(CAMPOS_SIEMPRE)
    if (!bloqueo.economicos) CAMPOS_HASTA_PERIODOS.forEach(c => permitidos.add(c))
    if (!bloqueo.identidad) CAMPOS_HASTA_PRIMER_INFORME.forEach(c => permitidos.add(c))

    // Se rechaza en bloque en vez de ignorar en silencio: si el formulario
    // envía un campo bloqueado es un fallo, y guardar "casi todo" dejaría al
    // usuario creyendo que su corrección quedó registrada.
    const rechazados = Object.keys(cambios).filter(c => !permitidos.has(c))
    if (rechazados.length) {
      const motivo = CAMPOS_HASTA_PRIMER_INFORME.some(c => rechazados.includes(c))
        ? bloqueo.motivoIdentidad
        : bloqueo.motivoEconomicos
      return { error: motivo ?? `No se pueden modificar estos campos: ${rechazados.join(', ')}.` }
    }

    // Solo lo que de verdad cambia: así el historial no se llena de filas donde
    // el valor anterior y el nuevo son idénticos.
    const efectivos: Record<string, string | number | null> = {}
    const filasHistorial: Array<{ campo: string; valor_anterior: string | null; valor_nuevo: string | null }> = []

    for (const [campo, valor] of Object.entries(cambios)) {
      const previo = (actual as Record<string, unknown>)[campo] ?? null
      const norm = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))
      if (norm(previo) === norm(valor)) continue
      efectivos[campo] = valor === '' ? null : valor
      filasHistorial.push({ campo, valor_anterior: norm(previo), valor_nuevo: norm(valor) })
    }

    if (!filasHistorial.length) return { data: { camposActualizados: 0 } }

    const { error } = await admin
      .from('contratos')
      .update({ ...efectivos, updated_at: new Date().toISOString() })
      .eq('id', contratoId)

    if (error) return { error: error.message }

    // El historial no bloquea la corrección: si falla el registro, el dato ya
    // quedó bien y perder la traza es preferible a dejar el contrato mal.
    await admin.from('contratos_historial').insert(
      filasHistorial.map(f => ({ ...f, contrato_id: contratoId, usuario_id: gestorId })),
    ).then(undefined, () => {})

    revalidatePath(`/dashboard/contratos/${contratoId}`)
    revalidatePath('/dashboard/contratos', 'layout')
    return { data: { camposActualizados: filasHistorial.length } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

export interface CambioContrato {
  id: string
  campo: string
  valor_anterior: string | null
  valor_nuevo: string | null
  created_at: string
  usuario: string
}

export async function getHistorialContrato(contratoId: string): Promise<CambioContrato[]> {
  try {
    const gestorId = await requireAdminId()
    if (!gestorId) return []
    const admin = createAdminSupabaseClient()
    const { data } = await admin
      .from('contratos_historial')
      .select('id, campo, valor_anterior, valor_nuevo, created_at, usuario:usuarios(nombre_completo)')
      .eq('contrato_id', contratoId)
      .order('created_at', { ascending: false })
      .limit(50)

    return ((data ?? []) as any[]).map(f => ({
      id: f.id,
      campo: f.campo,
      valor_anterior: f.valor_anterior,
      valor_nuevo: f.valor_nuevo,
      created_at: f.created_at,
      usuario: f.usuario?.nombre_completo ?? '—',
    }))
  } catch {
    return []
  }
}

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

/**
 * Registra un hecho del ciclo de vida del contrato: suspensión, terminación
 * anticipada, liquidación o cesión.
 *
 * Va aparte de actualizarContrato porque no es una corrección de un dato mal
 * escrito, sino la constancia de un acto administrativo: exige fecha y, salvo
 * al volver a "vigente", un motivo. Queda en el mismo historial para que la
 * vida del contrato se lea en una sola línea de tiempo.
 */
export async function cambiarEstadoContrato(
  contratoId: string,
  estado: EstadoContrato,
  fecha: string,
  motivo: string,
): Promise<ActionResult> {
  try {
    const gestorId = await requireAdminId()
    if (!gestorId) return { error: 'No autorizado' }

    if (!ESTADOS_CONTRATO.some(e => e.id === estado)) return { error: 'Estado no válido.' }
    if (!fecha) return { error: 'Indica la fecha del acto.' }
    if (estado !== 'vigente' && !motivo.trim()) {
      return { error: 'Indica el motivo: queda como constancia en el expediente.' }
    }

    const admin = createAdminSupabaseClient()
    const { data: actual } = await admin
      .from('contratos').select('estado').eq('id', contratoId).single()
    if (!actual) return { error: 'Contrato no encontrado' }
    if (actual.estado === estado) return { error: `El contrato ya está en estado "${estado}".` }

    const { error } = await admin
      .from('contratos')
      .update({
        estado,
        estado_fecha: fecha,
        estado_motivo: motivo.trim() || null,
        // `activo` se mantiene coherente para el código anterior que aún lo
        // consulta; el estado es a partir de ahora la fuente de verdad.
        activo: estado === 'vigente' || estado === 'suspendido',
        updated_at: new Date().toISOString(),
      })
      .eq('id', contratoId)

    if (error) return { error: error.message }

    await admin.from('contratos_historial').insert({
      contrato_id: contratoId,
      usuario_id: gestorId,
      campo: 'estado',
      valor_anterior: actual.estado,
      valor_nuevo: `${estado} (${fecha})${motivo.trim() ? ` — ${motivo.trim()}` : ''}`,
    }).then(undefined, () => {})

    revalidatePath(`/dashboard/contratos/${contratoId}`)
    revalidatePath('/dashboard/contratos', 'layout')
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Eliminación del contrato ────────────────────────────────────────────────

export interface ResumenBorrado {
  periodos: number
  obligaciones: number
  evidencias: number
  documentos: number
  /** Informes que salieron de borrador: ya circularon fuera del sistema. */
  informesPresentados: number
  /** Códigos QR emitidos que dejarán de poder verificarse. */
  codigosVerificacion: number
}

/**
 * Qué se lleva por delante borrar este contrato.
 *
 * No decide si se puede: el administrador puede borrar cualquier contrato. Su
 * función es que sepa QUÉ está destruyendo antes de confirmarlo, en particular
 * los informes ya presentados y los códigos de verificación emitidos: esos
 * códigos pueden estar impresos en documentos que ya circulan fuera del
 * sistema, y al borrar el contrato dejarán de resolver.
 */
export async function resumenBorradoContrato(contratoId: string): Promise<ResumenBorrado> {
  const admin = createAdminSupabaseClient()

  const { data: periodos } = await admin
    .from('periodos').select('id, estado').eq('contrato_id', contratoId)
  const idsPeriodo = (periodos ?? []).map(p => p.id as string)

  const vacio = Promise.resolve({ count: 0 } as { count: number | null })

  const [
    { count: obligaciones }, { count: evidencias },
    { count: adjuntosPeriodo }, { count: adjuntosContrato }, { count: codigos },
  ] = await Promise.all([
    admin.from('obligaciones').select('id', { count: 'exact', head: true }).eq('contrato_id', contratoId),
    idsPeriodo.length
      ? admin.from('evidencias').select('id, actividades!inner(periodo_id)', { count: 'exact', head: true })
          .in('actividades.periodo_id', idsPeriodo)
      : vacio,
    idsPeriodo.length
      ? admin.from('documentos_adjuntos').select('id', { count: 'exact', head: true })
          .eq('entidad_tipo', 'periodo').in('entidad_id', idsPeriodo)
      : vacio,
    admin.from('documentos_adjuntos').select('id', { count: 'exact', head: true })
      .eq('entidad_tipo', 'contrato').eq('entidad_id', contratoId),
    idsPeriodo.length
      ? admin.from('documentos_emitidos').select('id', { count: 'exact', head: true }).in('periodo_id', idsPeriodo)
      : vacio,
  ])

  return {
    periodos: idsPeriodo.length,
    obligaciones: obligaciones ?? 0,
    evidencias: evidencias ?? 0,
    documentos: (adjuntosPeriodo ?? 0) + (adjuntosContrato ?? 0),
    informesPresentados: (periodos ?? []).filter(p => p.estado !== 'borrador').length,
    codigosVerificacion: codigos ?? 0,
  }
}

/**
 * Borra el contrato y todo lo que cuelga de él. Exclusivo del administrador.
 *
 * Sin restricciones: el administrador puede borrar cualquier contrato, tenga o
 * no informes presentados. Es una decisión suya, y la pantalla se limita a
 * decirle qué destruye —incluidos los códigos de verificación, que dejarán de
 * resolver aunque estén impresos en documentos ya entregados.
 *
 * En la base de datos todas las claves foráneas hacia `contratos` son CASCADE,
 * así que un solo DELETE arrastra periodos, obligaciones, actividades,
 * evidencias, otrosíes, historial y certificaciones.
 *
 * Storage NO cascadea, y los adjuntos del expediente del contrato tampoco:
 * cuelgan de (entidad_tipo, entidad_id) sin clave foránea, así que sobrevivirían
 * al borrado como filas huérfanas. Ambas cosas se limpian aquí, ANTES del
 * DELETE — si se hiciera después ya no habría forma de saber qué archivos
 * pertenecían al contrato, y quedarían ocupando espacio para siempre.
 */
export async function eliminarContrato(
  contratoId: string,
  confirmacion: string,
): Promise<ActionResult<{ numero: string }>> {
  try {
    // requireAdmin, no requireAdminId: contratación gestiona contratos pero no
    // los destruye.
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }
    const { data: yo } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
    if (yo?.rol !== 'admin') return { error: 'Solo el administrador puede eliminar contratos.' }

    const admin = createAdminSupabaseClient()
    const { data: contrato } = await admin
      .from('contratos').select('id, numero, anio').eq('id', contratoId).single()
    if (!contrato) return { error: 'Contrato no encontrado' }

    // El número escrito a mano evita el borrado por inercia: obliga a mirar
    // QUÉ contrato se está borrando, no solo a pulsar "confirmar".
    if (confirmacion.trim() !== contrato.numero) {
      return { error: `Para confirmar, escribe el número del contrato: ${contrato.numero}` }
    }

    // ── Archivos en Storage ──────────────────────────────────────────────────
    const { data: periodos } = await admin
      .from('periodos')
      .select('id, planilla_ss_url, informe_actividades_url, cuenta_cobro_url')
      .eq('contrato_id', contratoId)
    const idsPeriodo = (periodos ?? []).map(p => p.id as string)

    const porBucket: Record<string, string[]> = { evidencias: [], adjuntos: [], documentos: [], certificaciones: [] }
    const anotar = (bucket: string, url: string | null | undefined) => {
      const path = url ? extraerPath(url, bucket) : null
      if (path) porBucket[bucket].push(path)
    }

    for (const p of (periodos ?? []) as Record<string, string | null>[]) {
      anotar('documentos', p.planilla_ss_url)
      anotar('documentos', p.informe_actividades_url)
      anotar('documentos', p.cuenta_cobro_url)
    }

    if (idsPeriodo.length) {
      const { data: evs } = await admin
        .from('evidencias').select('url, storage_path, actividades!inner(periodo_id)')
        .in('actividades.periodo_id', idsPeriodo)
      for (const e of (evs ?? []) as unknown as Array<{ url: string | null; storage_path: string | null }>) {
        anotar('evidencias', e.storage_path ?? e.url)
      }
    }

    const [{ data: adjContrato }, { data: adjPeriodo }] = await Promise.all([
      admin.from('documentos_adjuntos').select('storage_path')
        .eq('entidad_tipo', 'contrato').eq('entidad_id', contratoId),
      idsPeriodo.length
        ? admin.from('documentos_adjuntos').select('storage_path')
            .eq('entidad_tipo', 'periodo').in('entidad_id', idsPeriodo)
        : Promise.resolve({ data: [] as { storage_path: string }[] }),
    ])
    for (const a of [...(adjContrato ?? []), ...(adjPeriodo ?? [])] as { storage_path: string }[]) {
      porBucket.adjuntos.push(a.storage_path)
    }

    const { data: certs } = await admin
      .from('certificaciones_retencion').select('pdf_path').eq('contrato_id', contratoId)
    for (const c of (certs ?? []) as { pdf_path: string | null }[]) {
      if (c.pdf_path) porBucket.certificaciones.push(c.pdf_path)
    }

    // Un fallo al borrar archivos no impide borrar el contrato: dejar basura en
    // Storage es molesto, dejar el contrato a medio borrar es peor.
    await Promise.all(
      Object.entries(porBucket)
        .filter(([, rutas]) => rutas.length)
        .map(([bucket, rutas]) => admin.storage.from(bucket).remove(rutas).then(undefined, () => {})),
    )

    // ── Filas sin cascada ────────────────────────────────────────────────────
    // documentos_adjuntos apunta al contrato y al periodo por (entidad_tipo,
    // entidad_id), sin clave foránea: nada las borraría.
    await admin.from('documentos_adjuntos').delete()
      .eq('entidad_tipo', 'contrato').eq('entidad_id', contratoId)
    if (idsPeriodo.length) {
      await admin.from('documentos_adjuntos').delete()
        .eq('entidad_tipo', 'periodo').in('entidad_id', idsPeriodo)
    }

    // ── El contrato (arrastra el resto por CASCADE) ──────────────────────────
    const { error } = await admin.from('contratos').delete().eq('id', contratoId)
    if (error) return { error: `No se pudo eliminar el contrato: ${error.message}` }

    revalidatePath('/dashboard/contratos', 'layout')
    return { data: { numero: `${contrato.numero}-${contrato.anio}` } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado al eliminar el contrato' }
  }
}
