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
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'

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
): Promise<ActionResult<{ generados: number }>> {
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

    const { error } = await adminClient.from('periodos').insert(filas)
    if (error) return { error: `Error generando periodos: ${error.message}` }

    revalidatePath(`/dashboard/contratos/${contratoId}`)
    return { data: { generados: filas.length } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
