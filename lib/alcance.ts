/**
 * lib/alcance.ts — quién se entera de qué.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 *
 * Hasta ahora cada regla del cron resolvía su propia audiencia a mano, y una
 * se olvidó: la alerta de cuentas aprobadas sin radicar consultaba
 * `.in('rol', ['supervisor','admin'])` sin filtrar por dependencia y mandaba
 * la MISMA lista a los cuatro secretarios. El 17 de septiembre salió un correo
 * con tres nombres —dos de Gobierno y uno de Hacienda— a cinco personas: para
 * Desarrollo Territorial y Bienestar Social el contenido era íntegramente
 * ajeno, cero de tres.
 *
 * No era un caso raro: era el único sitio donde nadie había escrito el filtro.
 * Por eso el reparto vive aquí y no en cada llamador — el mismo razonamiento
 * por el que el control de ritmo de Resend vive en `enviarCorreo`: quien
 * escriba la regla siguiente queda protegido sin acordarse de nada.
 *
 * ── La fuente de la dependencia es el CONTRATO ───────────────────────────
 *
 * `contratos.dependencia_id`, nunca `usuarios.dependencia_id` del contratista.
 * En producción los 100 contratos vigentes tienen dependencia y supervisor, y
 * hay un caso que obliga a la distinción: Isabel Cristina Mejía figura en
 * Gobierno en su perfil y su contrato 215 es de Bienestar Social. Segmentar
 * por el perfil mandaría su información a la secretaría equivocada.
 *
 * Para los ASESORES sí manda `usuarios.dependencia_id`: esa es su adscripción,
 * no la de ningún contrato.
 *
 * `admin` y `alcalde` no tienen dependencia y es correcto: son transversales.
 * `contratacion` tiene una en su ficha, pero su función cruza todo el
 * municipio, así que aquí cuenta como transversal y no como parte de Gobierno.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Una dependencia y la gente que responde por ella. */
export interface Ambito {
  dependenciaId: string
  nombre: string
  /** En Fredonia hay exactamente un supervisor por dependencia. */
  supervisorId: string | null
  /** Hacienda, Bienestar Social y Desarrollo Territorial hoy no tienen. */
  asesorIds: string[]
  /**
   * Si esta dependencia puede ver el reparto del municipio entero.
   *
   * El consolidado mensual llevaba, al final, cómo se repartió el dinero
   * radicado entre las cuatro secretarías, y le llegaba a todas. No le
   * corresponde a todas: al secretario de Desarrollo Territorial no le incumbe
   * cuánto está ejecutando Gobierno. Hacienda es la excepción con fundamento —
   * paga las cuentas de las cuatro, así que el reparto ES su materia.
   *
   * Sale de `dependencias.ve_consolidado_municipio` (migración 047), no de
   * comparar el nombre contra 'Secretaría de Hacienda' dentro de un `if`: la
   * migración 035 ya obligó una vez a perseguir un nombre de dependencia por
   * media base de datos.
   */
  veMunicipio: boolean
}

/** Roles que ven el municipio entero y no pertenecen a una sola dependencia. */
export const ROLES_TRANSVERSALES = ['admin', 'contratacion', 'alcalde'] as const
export type RolTransversal = (typeof ROLES_TRANSVERSALES)[number]

/**
 * Los ámbitos de todas las dependencias, indexados por su id.
 *
 * Incluye las que no tienen contratos: filtrar por actividad es decisión de
 * quien llama, que es el único que sabe de qué mes está hablando. Lo que esta
 * función garantiza es que el reparto sea siempre el mismo.
 */
export async function cargarAmbitos(
  admin: SupabaseClient,
): Promise<Map<string, Ambito>> {
  // `select('*')` y no la lista de columnas: mientras la migración 047 no esté
  // aplicada, pedir `ve_consolidado_municipio` por su nombre haría fallar la
  // consulta entera. Con el asterisco la columna llega o no llega, y si no
  // llega nadie ve el reparto del municipio — que es el valor seguro.
  // `dependencias` tiene siete columnas y ninguna reservada.
  const [{ data: deps }, { data: gente }] = await Promise.all([
    admin.from('dependencias').select('*'),
    admin
      .from('usuarios')
      .select('id, rol, dependencia_id')
      .in('rol', ['supervisor', 'asesor'])
      .eq('activo', true),
  ])

  const ambitos = new Map<string, Ambito>()
  for (const d of deps ?? []) {
    ambitos.set(d.id as string, {
      dependenciaId: d.id as string,
      nombre: d.nombre as string,
      supervisorId: null,
      asesorIds: [],
      veMunicipio: (d as { ve_consolidado_municipio?: boolean }).ve_consolidado_municipio === true,
    })
  }

  for (const u of gente ?? []) {
    const dep = u.dependencia_id as string | null
    if (!dep) continue
    const a = ambitos.get(dep)
    if (!a) continue
    if (u.rol === 'supervisor') {
      // Si algún día hubiera dos, gana el primero y el segundo no se pierde:
      // entra como asesor, que a efectos de reparto recibe lo mismo.
      if (a.supervisorId) a.asesorIds.push(u.id as string)
      else a.supervisorId = u.id as string
    } else {
      a.asesorIds.push(u.id as string)
    }
  }

  return ambitos
}

/**
 * Quién debe enterarse de algo que ocurre DENTRO de una dependencia.
 *
 * Es la lista que puede ver nombres y contratos concretos. Deliberadamente no
 * incluye a admin: cuando una regla quiera avisar también a los transversales,
 * que lo diga explícitamente con `usuariosTransversales()`. Colarlos aquí es
 * justo como se cuela información de una secretaría en otra.
 */
export function destinatariosDe(ambito: Ambito | undefined | null): string[] {
  if (!ambito) return []
  return [...new Set([
    ...(ambito.supervisorId ? [ambito.supervisorId] : []),
    ...ambito.asesorIds,
  ])]
}

/**
 * Los ids de los roles que ven el municipio entero.
 *
 * Por defecto los tres; se puede acotar (p. ej. solo `contratacion` para lo
 * presupuestal, que al alcalde no le toca).
 */
export async function usuariosTransversales(
  admin: SupabaseClient,
  roles: readonly RolTransversal[] = ROLES_TRANSVERSALES,
): Promise<string[]> {
  const { data } = await admin
    .from('usuarios')
    .select('id')
    .in('rol', roles as unknown as string[])
    .eq('activo', true)
  return [...new Set((data ?? []).map(u => u.id as string))]
}

/**
 * Agrupa cualquier cosa que cuelgue de un contrato por la dependencia de ese
 * contrato. El parámetro es una función y no un campo para que sirva igual a
 * periodos, contratos y filas ya compuestas.
 */
export function agruparPorDependencia<T>(
  filas: T[],
  dependenciaDe: (fila: T) => string | null | undefined,
): Map<string, T[]> {
  const g = new Map<string, T[]>()
  for (const f of filas) {
    const dep = dependenciaDe(f)
    if (!dep) continue
    const lista = g.get(dep)
    if (lista) lista.push(f)
    else g.set(dep, [f])
  }
  return g
}
