import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from './supabase-server'
import type { Rol } from './types'

interface AuthUser {
  id: string
  rol: Rol
  nombre_completo: string
  dependencia_id: string | null
}

/**
 * Server-side authorization guard.
 * Call at the top of any server component or page to enforce role access.
 * Redirects to /dashboard if user doesn't have the required role.
 */
export async function requireRole(
  allowedRoles: Rol[],
  redirectTo = '/dashboard'
): Promise<AuthUser> {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, rol, nombre_completo, dependencia_id')
    .eq('id', user.id)
    .single()

  if (!usuario || !allowedRoles.includes(usuario.rol as Rol)) {
    redirect(redirectTo)
  }

  return usuario as AuthUser
}

/**
 * Verify that the authenticated user has access to a specific contract.
 * - admin: always allowed
 * - contratista: only if they own the contract
 * - supervisor: only if they supervise the contract
 * - asesor: only if the contract belongs to their dependencia
 */
export async function requireContractAccess(
  contratoId: string,
  redirectTo = '/dashboard'
): Promise<AuthUser> {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, rol, nombre_completo, dependencia_id')
    .eq('id', user.id)
    .single()

  if (!usuario) {
    redirect('/login')
  }

  const authUser = usuario as AuthUser

  if (authUser.rol === 'admin') return authUser

  const { data: contrato } = await supabase
    .from('contratos')
    .select('contratista_id, supervisor_id, dependencia_id')
    .eq('id', contratoId)
    .single()

  if (!contrato) {
    redirect(redirectTo)
  }

  const hasAccess =
    (authUser.rol === 'contratista' && contrato.contratista_id === authUser.id) ||
    (authUser.rol === 'supervisor' && contrato.supervisor_id === authUser.id) ||
    (authUser.rol === 'asesor' && contrato.dependencia_id === authUser.dependencia_id)

  if (!hasAccess) {
    redirect(redirectTo)
  }

  return authUser
}
