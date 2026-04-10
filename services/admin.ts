/**
 * Admin-only data access layer.
 * All functions run server-side via Server Actions or API routes.
 */
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Rol } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────

export interface UsuarioAdmin {
  id: string
  nombre_completo: string
  cedula: string
  email?: string
  rol: Rol
  cargo?: string
  telefono?: string
  direccion?: string
  rh?: string
  foto_url?: string
  tipo_documento?: string
  dependencia_id?: string
  dependencia?: { id: string; nombre: string } | null
  banco?: string
  tipo_cuenta?: string
  numero_cuenta?: string
}

export interface ContratistaPendiente {
  id: number
  nombre_completo: string
  cedula: string | null
  cargo: string
  secretaria: string
  rol: string
  email_sugerido: string | null
  activado: boolean
  usuario_id: string | null
}

export interface Dependencia {
  id: string
  nombre: string
}

export interface MunicipioAdmin {
  id: string
  nombre: string
  departamento?: string
  nit?: string
  representante_legal?: string
  cedula_representante?: string
}

// ─── Users ────────────────────────────────────────────────────

export async function getUsuariosAdmin(): Promise<UsuarioAdmin[]> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('usuarios')
    .select('id, nombre_completo, cedula, rol, cargo, telefono, rh, foto_url, tipo_documento, dependencia_id, dependencia:dependencias(id, nombre)')
    .order('nombre_completo')
  return (data ?? []) as unknown as UsuarioAdmin[]
}

export async function getUsuarioAdmin(id: string): Promise<UsuarioAdmin | null> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('usuarios')
    .select('*, dependencia:dependencias(id, nombre)')
    .eq('id', id)
    .single()
  return data as unknown as UsuarioAdmin | null
}

// ─── Pending imports ──────────────────────────────────────────

export async function getContratistasImportados(): Promise<ContratistaPendiente[]> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('contratistas_importados')
    .select('*')
    .eq('activado', false)
    .order('nombre_completo')
  return (data ?? []) as ContratistaPendiente[]
}

// ─── Dependencias ─────────────────────────────────────────────

export async function getDependencias(): Promise<Dependencia[]> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('dependencias')
    .select('id, nombre')
    .order('nombre')
  return (data ?? []) as Dependencia[]
}

// ─── Municipio ────────────────────────────────────────────────

export async function getMunicipioAdmin(): Promise<MunicipioAdmin | null> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('municipios')
    .select('id, nombre, departamento, nit, representante_legal, cedula_representante')
    .limit(1)
    .single()
  return data as MunicipioAdmin | null
}

// ─── Stats ────────────────────────────────────────────────────

export async function getAdminStats() {
  const supabase = await createServerSupabaseClient()
  const [usuarios, contratos, pendientes, importados] = await Promise.all([
    supabase.from('usuarios').select('id', { count: 'exact', head: true }),
    supabase.from('contratos').select('id', { count: 'exact', head: true }),
    supabase.from('periodos').select('id', { count: 'exact', head: true })
      .in('estado', ['enviado', 'revision_asesor', 'revision_gobierno', 'revision_hacienda']),
    supabase.from('contratistas_importados').select('id', { count: 'exact', head: true })
      .eq('activado', false),
  ])
  return {
    totalUsuarios: usuarios.count ?? 0,
    totalContratos: contratos.count ?? 0,
    periodosPendientes: pendientes.count ?? 0,
    contratistasXActivar: importados.count ?? 0,
  }
}
