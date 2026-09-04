'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { normalizeName, normalizeEmail, normalizeFreeText } from '@/lib/format'
import { passwordInicialDesdeCedula } from '@/lib/password-inicial'
import { enviarNotificacion } from '@/lib/notifications'
import type { ActionResult } from '@/lib/types'

// ─── Auth guard ───────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data } = await supabase
    .from('usuarios')
    .select('rol, municipio_id')
    .eq('id', session.user.id)
    .single()
  if (data?.rol !== 'admin') return null
  return { userId: session.user.id, municipioId: data.municipio_id as string }
}

/**
 * Admin o Contratación — gestión de cuentas de usuario.
 * Contratación SOLO puede gestionar cuentas de contratistas: toda función que
 * use este guard debe verificar el rol del usuario objetivo con
 * targetEsContratista() cuando gestor.rol === 'contratacion'. Esto evita la
 * escalada de privilegios (p. ej. resetear la contraseña de un admin).
 */
async function requireGestorUsuarios() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data } = await supabase
    .from('usuarios')
    .select('rol, municipio_id')
    .eq('id', session.user.id)
    .single()
  if (data?.rol !== 'admin' && data?.rol !== 'contratacion') return null
  return {
    userId: session.user.id,
    municipioId: data.municipio_id as string,
    rol: data.rol as 'admin' | 'contratacion',
  }
}

/** true si el usuario objetivo existe y es contratista. */
async function targetEsContratista(userId: string): Promise<boolean> {
  const adminClient = createAdminSupabaseClient()
  const { data } = await adminClient.from('usuarios').select('rol').eq('id', userId).single()
  return data?.rol === 'contratista'
}

const ERROR_SOLO_CONTRATISTAS = 'Contratación solo puede gestionar cuentas de contratistas'

// ─── Create user (auth + usuarios row) ───────────────────────

export async function crearUsuario(formData: {
  email: string
  nombre_completo: string
  cedula: string
  rol: string
  cargo?: string
  telefono?: string
  direccion?: string
  rh?: string
  tipo_documento?: string
  dependencia_id?: string
}): Promise<ActionResult<{ id: string; passwordInicial: string }>> {
  const admin = await requireGestorUsuarios()
  if (!admin) return { error: 'No autorizado' }
  // Contratación solo crea contratistas — nunca roles internos ni admin
  if (admin.rol === 'contratacion' && formData.rol !== 'contratista') {
    return { error: 'Contratación solo puede crear usuarios con rol contratista' }
  }

  const adminClient = createAdminSupabaseClient()

  // Normalize fields before writing
  const email         = normalizeEmail(formData.email)
  const nombreCompleto = normalizeName(formData.nombre_completo)
  const cargo         = formData.cargo ? normalizeName(formData.cargo) : null
  const direccion     = formData.direccion ? normalizeFreeText(formData.direccion) : null

  // 1. La contraseña inicial es la cédula: quien crea la cuenta no tiene que
  //    transmitir nada, el contratista ya conoce su número.
  const passwordInicial = passwordInicialDesdeCedula(formData.cedula)
  if (!passwordInicial) {
    return { error: 'La cédula es obligatoria: se usa como contraseña inicial de la cuenta.' }
  }
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: passwordInicial,
    email_confirm: true,
    user_metadata: { nombre_completo: nombreCompleto },
  })

  if (authError || !authData?.user) {
    return { error: authError?.message ?? 'Error creando cuenta de acceso' }
  }

  const userId = authData.user.id

  // 2. Get the municipio_id
  const supabase = await createServerSupabaseClient()
  const { data: muni } = await supabase
    .from('municipios').select('id').limit(1).single()

  // 3. Create usuarios row
  const { error: dbError } = await adminClient
    .from('usuarios')
    .insert({
      id: userId,
      email,
      nombre_completo: nombreCompleto,
      cedula: formData.cedula.trim(),
      rol: formData.rol,
      cargo,
      telefono: formData.telefono?.trim() || null,
      direccion,
      rh: formData.rh || null,
      tipo_documento: formData.tipo_documento ?? 'CC',
      dependencia_id: formData.dependencia_id || null,
      municipio_id: muni?.id,
    })

  if (dbError) {
    // Rollback: delete auth user
    await adminClient.auth.admin.deleteUser(userId)
    return { error: dbError.message }
  }

  await enviarNotificacion({
    destinatarioId: userId,
    tipo: 'bienvenida',
    titulo: 'Bienvenido a Contratista Digital',
    mensaje: 'Tu cuenta fue creada. Ingresa con tu correo y tu número de documento como contraseña inicial.',
  })

  revalidatePath('/dashboard/admin/usuarios')
  return { data: { id: userId, passwordInicial } }
}

// ─── Activate imported contractor ─────────────────────────────

export async function activarContratista(
  importId: number,
  email: string,
  extraData: { cargo?: string; cedula?: string; telefono?: string; direccion?: string; rh?: string; dependencia_id?: string }
): Promise<ActionResult<{ id: string; passwordInicial: string }>> {
  const admin = await requireGestorUsuarios()
  if (!admin) return { error: 'No autorizado' }

  const supabase = await createServerSupabaseClient()
  const adminClient = createAdminSupabaseClient()

  // Get staging row
  const { data: imp } = await supabase
    .from('contratistas_importados')
    .select('*')
    .eq('id', importId)
    .single()

  if (!imp) return { error: 'Contratista no encontrado' }
  if (imp.activado) return { error: 'Este contratista ya fue activado' }
  // Contratación solo activa cuentas de contratistas
  if (admin.rol === 'contratacion' && (imp.rol ?? 'contratista') !== 'contratista') {
    return { error: ERROR_SOLO_CONTRATISTAS }
  }

  const emailNorm    = normalizeEmail(email)
  const nombreNorm   = normalizeName(imp.nombre_completo)
  const cargoNorm    = extraData.cargo ?? imp.cargo
    ? normalizeName(extraData.cargo ?? imp.cargo!)
    : null
  const direccionNorm = extraData.direccion ? normalizeFreeText(extraData.direccion) : null

  const cedulaCuenta = extraData.cedula?.trim() || imp.cedula || ''
  const passwordInicial = passwordInicialDesdeCedula(cedulaCuenta)
  if (!passwordInicial) {
    return { error: 'Este contratista no tiene cédula registrada, y la cédula es la contraseña inicial. Ingrésala para activarlo.' }
  }
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: emailNorm,
    password: passwordInicial,
    email_confirm: true,
    user_metadata: { nombre_completo: nombreNorm },
  })

  if (authError || !authData?.user) {
    return { error: authError?.message ?? 'Error creando cuenta' }
  }

  const userId = authData.user.id
  const { data: muni } = await supabase.from('municipios').select('id').limit(1).single()

  // Create usuarios row
  const { error: dbError } = await adminClient.from('usuarios').insert({
    id: userId,
    email: emailNorm,
    nombre_completo: nombreNorm,
    cedula: extraData.cedula?.trim() || imp.cedula || '',
    rol: imp.rol ?? 'contratista',
    cargo: cargoNorm,
    telefono: extraData.telefono ?? null,
    direccion: direccionNorm,
    rh: extraData.rh ?? null,
    dependencia_id: extraData.dependencia_id ?? null,
    municipio_id: muni?.id,
  })

  if (dbError) {
    await adminClient.auth.admin.deleteUser(userId)
    return { error: dbError.message }
  }

  // Mark staging row as activated
  await adminClient
    .from('contratistas_importados')
    .update({ activado: true, usuario_id: userId })
    .eq('id', importId)

  await enviarNotificacion({
    destinatarioId: userId,
    tipo: 'bienvenida',
    titulo: 'Bienvenido a Contratista Digital',
    mensaje: 'Tu cuenta fue creada. Ingresa con tu correo y tu número de documento como contraseña inicial.',
  })

  revalidatePath('/dashboard/admin/usuarios')
  return { data: { id: userId, passwordInicial } }
}

// ─── Update user profile ──────────────────────────────────────

export async function actualizarUsuario(
  id: string,
  data: {
    nombre_completo?: string
    cedula?: string
    email?: string
    rol?: string
    cargo?: string
    telefono?: string
    direccion?: string
    rh?: string
    tipo_documento?: string
    dependencia_id?: string
    banco?: string
    tipo_cuenta?: string
    numero_cuenta?: string
    /** true = factura electrónica · false = no obligado · null = sin verificar */
    obligado_facturar_electronicamente?: boolean | null
  }
): Promise<ActionResult<void>> {
  const admin = await requireGestorUsuarios()
  if (!admin) return { error: 'No autorizado' }
  // Contratación: solo edita contratistas y no puede cambiarles el rol
  if (admin.rol === 'contratacion') {
    if (!(await targetEsContratista(id))) return { error: ERROR_SOLO_CONTRATISTAS }
    if (data.rol && data.rol !== 'contratista') {
      return { error: 'Contratación no puede cambiar el rol de un usuario' }
    }
  }

  const adminClient = createAdminSupabaseClient()

  // Sync email to auth.users when it changes
  if (data.email) {
    const newEmail = data.email.trim().toLowerCase()
    const { error: authError } = await adminClient.auth.admin.updateUserById(id, {
      email: newEmail,
      email_confirm: true,  // skip confirmation email, apply immediately
    })
    if (authError) return { error: `Error actualizando email en auth: ${authError.message}` }
  }

  const { error } = await adminClient
    .from('usuarios')
    .update({
      ...data,
      ...(data.nombre_completo !== undefined && { nombre_completo: normalizeName(data.nombre_completo) }),
      ...(data.cargo !== undefined && { cargo: data.cargo ? normalizeName(data.cargo) : null }),
      ...(data.direccion !== undefined && { direccion: data.direccion ? normalizeFreeText(data.direccion) : null }),
      telefono: data.telefono?.trim() || null,
      email: data.email?.trim().toLowerCase() || null,
      banco: data.banco?.trim() || null,
      tipo_cuenta: data.tipo_cuenta || null,
      numero_cuenta: data.numero_cuenta?.trim() || null,
      dependencia_id: data.dependencia_id || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/usuarios')
  revalidatePath(`/dashboard/admin/usuarios/${id}`)
  return {}
}

// ─── Upload profile photo (presigned URL pattern) ─────────────
//
// Why presigned URLs instead of FormData through the Server Action:
// - Vercel payload limit is 4.5 MB; raw phone photos can exceed this.
// - Going Client → Vercel → Supabase doubles the upload time.
// - New flow: validate server-side → sign URL → Client PUTs directly
//   to Supabase → confirm with DB update. Same security, twice as fast.

const FOTO_ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

/**
 * Step 1 — Validate the request and return a short-lived signed upload URL.
 * The client uploads the (already-compressed) file directly to Supabase Storage.
 */
export async function prepararUploadFoto(
  userId: string,
  fileName: string,
  fileSize: number,
  fileMime: string,
): Promise<ActionResult<{ signedUrl: string; path: string; publicUrl: string }>> {
  const admin = await requireGestorUsuarios()
  if (!admin) return { error: 'No autorizado' }
  if (admin.rol === 'contratacion' && !(await targetEsContratista(userId))) {
    return { error: ERROR_SOLO_CONTRATISTAS }
  }

  const mime = fileMime?.toLowerCase() || ''
  if (!FOTO_ALLOWED.includes(mime)) {
    return { error: 'Solo se permiten imágenes JPEG, PNG, WEBP o HEIC' }
  }
  // After client-side compression the file should be well under 1 MB
  if (fileSize > 5 * 1024 * 1024) {
    return { error: 'La imagen no puede superar 5 MB' }
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? mime.split('/')[1].replace('jpeg', 'jpg')
  const path = `${userId}/foto.${ext}`

  const adminClient = createAdminSupabaseClient()
  const { data: signedData, error: signedError } = await adminClient.storage
    .from('avatars')
    .createSignedUploadUrl(path, { upsert: true })

  if (signedError || !signedData) {
    return { error: signedError?.message ?? 'No se pudo generar URL de subida' }
  }

  // `getPublicUrl` solo arma una cadena; no consulta si el bucket es público
  // —ya no lo es—. Se sigue guardando esa forma porque identifica el objeto y
  // es lo que hay en los registros existentes. Quien la pinte debe pasarla por
  // `avatarThumb()`, que la traduce a /api/avatar; abierta directamente da 400.
  const { data: { publicUrl } } = adminClient.storage.from('avatars').getPublicUrl(path)

  return { data: { signedUrl: signedData.signedUrl, path, publicUrl } }
}

/**
 * Step 2 — After the client has PUT the file, update the usuarios record.
 */
export async function confirmarFotoUsuario(
  userId: string,
  publicUrl: string,
): Promise<ActionResult<{ url: string }>> {
  const admin = await requireGestorUsuarios()
  if (!admin) return { error: 'No autorizado' }
  if (admin.rol === 'contratacion' && !(await targetEsContratista(userId))) {
    return { error: ERROR_SOLO_CONTRATISTAS }
  }

  // La foto reemplazada conserva la ruta del objeto —{id}/foto.ext—, así que la
  // URL que pinta el navegador sería idéntica a la anterior y la caché de una
  // hora seguiría sirviendo la vieja: la subida funcionaba y en pantalla no
  // pasaba nada. La versión se guarda en foto_url, no solo se devuelve a quien
  // subió, para que el cambio se vea también en las demás pantallas y sesiones.
  const urlVersionada = `${publicUrl.split('?')[0]}?v=${Date.now()}`

  const adminClient = createAdminSupabaseClient()
  const { error } = await adminClient
    .from('usuarios')
    .update({ foto_url: urlVersionada })
    .eq('id', userId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/admin/usuarios/${userId}`)
  revalidatePath('/dashboard/admin/usuarios')
  return { data: { url: urlVersionada } }
}

// ─── Change user password (admin only) ───────────────────────

export async function cambiarContrasena(
  userId: string,
  password: string
): Promise<ActionResult<{ email: string }>> {
  const admin = await requireGestorUsuarios()
  if (!admin) return { error: 'No autorizado' }
  // CRÍTICO: sin este check, contratación podría resetear la contraseña de un
  // admin y escalar privilegios. Solo puede tocar cuentas de contratistas.
  if (admin.rol === 'contratacion' && !(await targetEsContratista(userId))) {
    return { error: ERROR_SOLO_CONTRATISTAS }
  }

  const pw = password.trim()
  if (pw.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres' }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return { error: 'Configuración de servidor incompleta (service key faltante)' }
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({ password: pw }),
    })

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      return { error: body.message ?? body.msg ?? `Error ${res.status} al cambiar contraseña` }
    }

    // body.email lets the caller confirm which auth user was updated
    return { data: { email: body.email ?? userId } }
  } catch (err: any) {
    return { error: err?.message ?? 'Error inesperado al cambiar contraseña' }
  }
}

// ─── Update municipality ──────────────────────────────────────

export async function actualizarMunicipio(
  id: string,
  data: {
    nombre?: string
    departamento?: string
    nit?: string
    representante_legal?: string
    cedula_representante?: string
  }
): Promise<ActionResult<void>> {
  const admin = await requireAdmin()
  if (!admin) return { error: 'No autorizado' }

  const adminClient = createAdminSupabaseClient()
  const { error } = await adminClient
    .from('municipios')
    .update({
      ...data,
      ...(data.nombre && { nombre: normalizeName(data.nombre) }),
      ...(data.representante_legal && { representante_legal: normalizeName(data.representante_legal) }),
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/municipio')
  return {}
}

// ─── Eliminar usuario ─────────────────────────────────────────

/**
 * Elimina un usuario del sistema con dos modos:
 *
 *  incluirContrato = false → Solo elimina el usuario. Los contratos
 *    asociados permanecen pero pierden la referencia al contratista.
 *
 *  incluirContrato = true  → Elimina el usuario Y sus contratos
 *    (incluyendo periodos, actividades y evidencias por CASCADE).
 *
 * Orden de operaciones (resuelve todas las FK con NO ACTION antes de borrar):
 *   1. Contratos: borrar o desvincular contratista_id
 *   2. Contratos: desvincular supervisor_id (siempre)
 *   3. periodos.historico_marcado_por → NULL
 *   4. documentos.generado_por → NULL
 *   5. aprobaciones where usuario_id → DELETE
 *   6. historial_periodos.usuario_id → NULL (fallback: DELETE si NOT NULL)
 *   7. usuarios → DELETE (CASCADE: notificaciones, preaprobaciones, preferencias)
 *   8. auth.users → DELETE (siempre al final)
 */
export async function eliminarUsuario(
  userId: string,
  incluirContrato: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { error: 'No autorizado' }
  if (userId === admin.userId) return { error: 'No puedes eliminar tu propia cuenta de administrador' }

  const adminClient = createAdminSupabaseClient()

  try {
    // 1. Contratos del contratista
    if (incluirContrato) {
      const { error } = await adminClient
        .from('contratos')
        .delete()
        .eq('contratista_id', userId)
      if (error) throw new Error(`Error eliminando contratos: ${error.message}`)
    } else {
      // Desvincular sin borrar el contrato
      await adminClient
        .from('contratos')
        .update({ contratista_id: null })
        .eq('contratista_id', userId)
    }

    // 2. Desvincular rol de supervisor en cualquier contrato
    await adminClient
      .from('contratos')
      .update({ supervisor_id: null })
      .eq('supervisor_id', userId)

    // 3. Desvincular referencia en periodos
    await adminClient
      .from('periodos')
      .update({ historico_marcado_por: null })
      .eq('historico_marcado_por', userId)

    // 4. Desvincular referencia en documentos generados
    await adminClient
      .from('documentos')
      .update({ generado_por: null })
      .eq('generado_por', userId)

    // 5. Eliminar aprobaciones (sin usuario no tienen sentido)
    await adminClient
      .from('aprobaciones')
      .delete()
      .eq('usuario_id', userId)

    // 6. historial_periodos: intentar NULL; si la columna es NOT NULL, borrar esas filas
    const { error: historialError } = await adminClient
      .from('historial_periodos')
      .update({ usuario_id: null })
      .eq('usuario_id', userId)
    if (historialError) {
      await adminClient
        .from('historial_periodos')
        .delete()
        .eq('usuario_id', userId)
    }

    // 7. Eliminar el usuario (CASCADE: notificaciones, preaprobaciones, preferencias_notificacion)
    const { error: usuarioError } = await adminClient
      .from('usuarios')
      .delete()
      .eq('id', userId)
    if (usuarioError) throw new Error(`Error eliminando usuario: ${usuarioError.message}`)

    // 8. Eliminar de auth.users (siempre al final)
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
    if (authError) throw new Error(`Error eliminando cuenta de acceso: ${authError.message}`)

    revalidatePath('/dashboard/admin/usuarios')
    revalidatePath('/dashboard')
    return {}
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al eliminar el usuario'
    console.error('[eliminarUsuario]', err)
    return { error: msg }
  }
}

// ─── Firma management ─────────────────────────────────────────

/**
 * Borra la firma registrada de un usuario, para poder reemplazarla.
 */
export async function eliminarFirmaAdmin(userId: string): Promise<ActionResult> {
  // Gestión de firmas: exclusiva de admin.
  const admin = await requireAdmin()
  if (!admin) return { error: 'No autorizado' }

  const adminClient = createAdminSupabaseClient()
  const { error } = await adminClient
    .from('usuarios')
    .update({ firma_url: null })
    .eq('id', userId)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/firmas')
  revalidatePath('/dashboard')
  return {}
}

// ─── Firma del representante legal (alcalde) ──────────────────

/**
 * Sube la firma del alcalde al bucket privado y la asocia al municipio.
 *
 * Vive aquí y no en el perfil de un usuario porque el alcalde no es usuario
 * del sistema: no inicia sesión ni aprueba nada. Su firma es un atributo
 * institucional del municipio, como el NIT o el escudo, y la administra el
 * admin desde /dashboard/admin/municipio.
 *
 * Se estampa en el Acta de Terminación cuando el supervisor aprueba el último
 * informe, que es el acto con el que la administración suscribe el acta.
 */
export async function subirFirmaMunicipio(formData: FormData): Promise<ActionResult<{ url: string }>> {
  try {
    const auth = await requireAdmin()
    if (!auth) return { error: 'Solo el administrador puede gestionar la firma del municipio' }

    const file = formData.get('file') as File
    if (!file) return { error: 'No se recibió el archivo' }

    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED.includes(file.type)) return { error: 'Solo se permiten imágenes (JPG, PNG, WEBP)' }
    if (file.size > 10 * 1024 * 1024) return { error: 'La firma no puede superar 10 MB' }

    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : 'png'
    const path = `firmas/municipio/${auth.municipioId}/${Date.now()}.${ext}`

    const admin = createAdminSupabaseClient()
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await admin.storage
      .from('documentos')
      .upload(path, buffer, { contentType: file.type, upsert: true })
    if (upErr) return { error: `Error al subir: ${upErr.message}` }

    // Se guarda la URL en forma pública canónica; para mostrarla se firma,
    // porque el bucket es privado. Mismo criterio que las firmas de usuario.
    const { data: { publicUrl } } = admin.storage.from('documentos').getPublicUrl(path)

    const { error: updErr } = await admin
      .from('municipios')
      .update({ firma_representante_url: publicUrl })
      .eq('id', auth.municipioId)
    if (updErr) return { error: `Error al guardar: ${updErr.message}` }

    const { data: firmada } = await admin.storage.from('documentos').createSignedUrl(path, 3600)

    revalidatePath('/dashboard/admin/municipio')
    return { data: { url: firmada?.signedUrl ?? publicUrl } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/** URL firmada de la firma del alcalde, para previsualizarla en el panel. */
export async function obtenerFirmaMunicipio(): Promise<string | null> {
  try {
    const auth = await requireAdmin()
    if (!auth) return null

    const admin = createAdminSupabaseClient()
    const { data: m } = await admin
      .from('municipios')
      .select('firma_representante_url')
      .eq('id', auth.municipioId)
      .maybeSingle()

    const url = m?.firma_representante_url as string | undefined
    if (!url) return null

    const path = url.split('/documentos/')[1]
    if (!path) return null
    const { data } = await admin.storage.from('documentos').createSignedUrl(path, 3600)
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}

/** Quita la firma del alcalde. El archivo queda en el bucket como histórico. */
export async function eliminarFirmaMunicipio(): Promise<ActionResult> {
  try {
    const auth = await requireAdmin()
    if (!auth) return { error: 'Solo el administrador puede gestionar la firma del municipio' }

    const { error } = await createAdminSupabaseClient()
      .from('municipios')
      .update({ firma_representante_url: null })
      .eq('id', auth.municipioId)
    if (error) return { error: error.message }

    revalidatePath('/dashboard/admin/municipio')
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
