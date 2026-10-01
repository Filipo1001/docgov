import 'server-only'
import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hoyBogota } from './contrato'
import { cargarPlanPdm } from './datos'
import { armarDirectorio, type FilaContrato, type FilaUsuario } from './directorio-armar'
import { armarGrupos, type FilaGrupo, type FilaMiembro } from './grupos-armar'
import type { Directorio } from './personas'

/**
 * El directorio: todos los usuarios de Contratista Digital, con su foto, su
 * secretaría y su contrato, atados a los indicadores que llevan.
 *
 * ── Solo lee, y solo lo que ya ve el administrador ───────────────────────
 *
 * Dos consultas de lectura con la sesión del administrador (la puerta,
 * `exigirAccesoPdm`, ya lo garantizó), sobre `usuarios` y `contratos`. Es lo
 * mismo que hace la pantalla de usuarios de CD. Columnas explícitas —regla 2 de
 * CLAUDE.md— y solo las que hacen falta: ni cédula, ni correo, ni cuenta
 * bancaria.
 *
 * ── Si la lectura falla, nada se rompe ───────────────────────────────────
 *
 * Devuelve `ok: false` y listas vacías. Las pantallas siguen mostrando el
 * Excel; solo pierden la foto y el contrato. Un fallo aquí no puede dejar sin
 * pantalla al módulo, ni tocar a CD.
 *
 * Depende del plan (`cargarPlanPdm`): las asignaciones, que dicen quién lleva qué,
 * vienen en los indicadores. Si el plan no se pudo leer, tampoco hay directorio.
 *
 * `cache` de React: una sola lectura por petición aunque la llamen varios
 * componentes.
 */

const VACIO: Directorio = { ok: false, personas: [], sinUsuario: [], fichas: {}, grupos: [], secretarias: [] }

export const cargarDirectorio = cache(async (): Promise<Directorio> => {
  try {
    const plan = await cargarPlanPdm()
    if (!plan.ok) return VACIO

    const supabase = await createServerSupabaseClient()
    const [usuarios, contratos, grupos, miembros, dependencias] = await Promise.all([
      supabase
        .from('usuarios')
        .select('id, nombre_completo, rol, foto_url, dependencia:dependencias(nombre)')
        .eq('activo', true)
        .order('nombre_completo'),
      supabase
        .from('contratos')
        .select('contratista_id, numero, anio, estado, fecha_fin')
        .not('contratista_id', 'is', null),
      supabase.from('pdm_grupos').select('id, nombre, descripcion, dependencia_id, dependencia:dependencias(nombre)'),
      supabase.from('pdm_grupo_miembros').select('grupo_id, usuario_id, es_lider'),
      supabase.from('dependencias').select('id, nombre'),
    ])

    const error = usuarios.error ?? contratos.error ?? grupos.error ?? miembros.error ?? dependencias.error
    if (error || !usuarios.data || !contratos.data || !grupos.data || !miembros.data || !dependencias.data) {
      console.error('[pdm/directorio] lectura fallida:', error?.message)
      return VACIO
    }

    // Solo las secretarías que tienen indicadores en el plan: es donde se puede crear un grupo.
    const delPlan = new Set(plan.indicadores.map(i => i.dependencia))
    const secretarias = dependencias.data
      .filter(d => delPlan.has(d.nombre))
      .map(d => ({ id: d.id as string, nombre: d.nombre as string }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

    return armarDirectorio(
      usuarios.data as unknown as FilaUsuario[],
      contratos.data as FilaContrato[],
      plan.indicadores,
      hoyBogota(),
      armarGrupos(grupos.data as unknown as FilaGrupo[], miembros.data as FilaMiembro[], plan.indicadores),
      secretarias,
    )
  } catch (e) {
    console.error('[pdm/directorio] excepción:', e)
    return VACIO
  }
})
