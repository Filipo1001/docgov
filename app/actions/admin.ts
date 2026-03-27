'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
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
}): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin()
  if (!admin) return { error: 'No autorizado' }

  const adminClient = createAdminSupabaseClient()

  // 1. Create auth user (email confirmed immediately, temp password)
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: formData.email.trim().toLowerCase(),
    password: 'Fredonia2026*',
    email_confirm: true,
    user_metadata: { nombre_completo: formData.nombre_completo },
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
      email: formData.email.trim().toLowerCase(),
      nombre_completo: formData.nombre_completo.trim(),
      cedula: formData.cedula.trim(),
      rol: formData.rol,
      cargo: formData.cargo?.trim() || null,
      telefono: formData.telefono?.trim() || null,
      direccion: formData.direccion?.trim() || null,
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

  revalidatePath('/dashboard/admin/usuarios')
  return { data: { id: userId } }
}

// ─── Activate imported contractor ─────────────────────────────

export async function activarContratista(
  importId: number,
  email: string,
  extraData: { cargo?: string; cedula?: string; telefono?: string; direccion?: string; rh?: string; dependencia_id?: string }
): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin()
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

  // Create auth user
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: 'Fredonia2026*',
    email_confirm: true,
    user_metadata: { nombre_completo: imp.nombre_completo },
  })

  if (authError || !authData?.user) {
    return { error: authError?.message ?? 'Error creando cuenta' }
  }

  const userId = authData.user.id
  const { data: muni } = await supabase.from('municipios').select('id').limit(1).single()

  // Create usuarios row
  const emailLower = email.trim().toLowerCase()
  const { error: dbError } = await adminClient.from('usuarios').insert({
    id: userId,
    email: emailLower,
    nombre_completo: imp.nombre_completo,
    cedula: extraData.cedula?.trim() || imp.cedula || '',
    rol: imp.rol ?? 'contratista',
    cargo: extraData.cargo ?? imp.cargo,
    telefono: extraData.telefono ?? null,
    direccion: extraData.direccion ?? null,
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

  revalidatePath('/dashboard/admin/usuarios')
  return { data: { id: userId } }
}

// ─── Update user profile ──────────────────────────────────────

export async function actualizarUsuario(
  id: string,
  data: {
    nombre_completo?: string
    cedula?: string
    rol?: string
    cargo?: string
    telefono?: string
    direccion?: string
    rh?: string
    tipo_documento?: string
    dependencia_id?: string
  }
): Promise<ActionResult<void>> {
  const admin = await requireAdmin()
  if (!admin) return { error: 'No autorizado' }

  const adminClient = createAdminSupabaseClient()
  const { error } = await adminClient
    .from('usuarios')
    .update({
      ...data,
      cargo: data.cargo?.trim() || null,
      telefono: data.telefono?.trim() || null,
      direccion: data.direccion?.trim() || null,
      dependencia_id: data.dependencia_id || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/usuarios')
  revalidatePath(`/dashboard/admin/usuarios/${id}`)
  return {}
}

// ─── Upload profile photo ─────────────────────────────────────

export async function subirFotoUsuario(
  userId: string,
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  const admin = await requireAdmin()
  if (!admin) return { error: 'No autorizado' }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'No se adjuntó ningún archivo' }

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  if (!ALLOWED.includes(file.type)) {
    return { error: 'Solo se permiten imágenes JPEG, PNG, WEBP o HEIC' }
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: 'La imagen no puede superar 5 MB' }
  }

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${userId}/foto.${ext}`
  const bytes = await file.arrayBuffer()

  const adminClient = createAdminSupabaseClient()
  const { error: uploadError } = await adminClient.storage
    .from('avatars')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (uploadError) return { error: uploadError.message }

  const { data: { publicUrl } } = adminClient.storage
    .from('avatars')
    .getPublicUrl(path)

  // Append cache-buster so browsers reload after update
  const url = `${publicUrl}?t=${Date.now()}`

  await adminClient
    .from('usuarios')
    .update({ foto_url: publicUrl })
    .eq('id', userId)

  revalidatePath(`/dashboard/admin/usuarios/${userId}`)
  return { data: { url } }
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
    .update(data)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/municipio')
  return {}
}
