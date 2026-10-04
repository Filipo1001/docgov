import 'server-only'
import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { pdmHabilitado } from '@/lib/pdm/habilitado'
import { PLAN } from '@/lib/pdm/identidad'
import { ITEM_PLAN_DESARROLLO } from '@/lib/pdm/menu'
import { gestiona, veDirectorio } from '@/lib/pdm/niveles'
import { leerAcceso, type AccesoLeido, type LecturaAcceso } from '@/lib/pdm/acceso-leer'

export type AccesoPdm = AccesoLeido
export type { LecturaAcceso }

/**
 * Lo que dice el error cuando no se pudo comprobar el acceso. No es un «no»: ver `acceso-leer.ts`. Lo recoge
 * `app/dashboard/plan-desarrollo/error.tsx`, que lo muestra DENTRO del marco del módulo (con su barra).
 */
export const ERROR_ACCESO_NO_VERIFICADO = 'PDM: no se pudo verificar el acceso'

/**
 * Qué se sabe del acceso de quien pregunta, con los cuatro resultados de `leerAcceso`.
 *
 *   · Fuera de vista previa o desarrollo el módulo no existe: «sin acceso» para todos, y falla hacia
 *     lo cerrado (ver `pdmHabilitado`).
 *   · El administrador entra por su rol.
 *   · Cualquier otra persona entra solo si tiene una fila en `pdm_permisos`: se lee con SU
 *     sesión, y la política de la base le deja ver únicamente la suya.
 *
 * `cache` de React: una sola lectura por petición aunque la pidan varios componentes (la barra del módulo
 * y la pantalla, por ejemplo).
 */
export const leerAccesoPdm = cache(async (): Promise<LecturaAcceso> => {
  try {
    if (!pdmHabilitado()) return { estado: 'sin_acceso' }
    return await leerAcceso(await createServerSupabaseClient())
  } catch {
    return { estado: 'no_verificado' }
  }
})

/**
 * Qué puede hacer en el módulo quien pregunta, o `null` si nada.
 *
 * `null` es la respuesta segura ante cualquier cosa que no sea un «sí» comprobado: es lo que usan las
 * acciones del servidor y las lecturas, que ante la duda no hacen nada. Las PANTALLAS no deben decidir
 * con esto —un fallo pasajero se leería como «no tienes acceso»—: usan `exigirAccesoPdm`.
 */
export const accesoPdm = cache(async (): Promise<AccesoPdm | null> => {
  const lectura = await leerAccesoPdm()
  return lectura.estado === 'ok' ? lectura.acceso : null
})

/** Qué se exige para entrar a una pantalla. */
export type Requisito = 'cualquiera' | 'gestor' | 'gestor_o_consulta' | 'admin'

/**
 * La puerta de TODAS las pantallas del módulo.
 *
 * Se llama al principio de cada página y no una vez en un layout: un layout no
 * se vuelve a ejecutar cuando se navega entre sus páginas hijas, así que una
 * comprobación puesta solo ahí protegería la primera pantalla y dejaría abiertas
 * las demás. Con una función y una línea por página, olvidarla salta a la vista.
 *
 * 1. Fuera de vista previa o desarrollo el módulo no existe: 404, y falla hacia
 *    lo cerrado (ver `pdmHabilitado`).
 * 2. Sin sesión, al inicio de sesión. Con sesión pero sin acceso al módulo, al panel. Si NO se pudo
 *    comprobar (un fallo pasajero), no se redirige a ninguna parte: ver `acceso-leer.ts`.
 * 3. Cada pantalla dice qué nivel exige. Quien tiene acceso pero no el suficiente va al
 *    resumen, que es la pantalla de todos: ninguna pestaña lleva a una puerta cerrada.
 *
 * `connection()` obliga a decidirlo EN CADA PETICIÓN. Sin él, en un entorno donde
 * `pdmHabilitado()` responde «no», `notFound()` se lanza antes de que nada lea
 * las cookies y Next da la página por estática: hornea el 404 al compilar. La
 * decisión quedaría tomada con el entorno de la compilación y no con el de
 * ejecución, que es el que importa.
 */
export async function exigirAccesoPdm(requiere: Requisito = 'cualquiera'): Promise<AccesoPdm> {
  await connection()
  if (!pdmHabilitado()) notFound()

  // Una sola lectura (la misma que usa la barra del módulo): sesión y acceso juntos.
  const lectura = await leerAccesoPdm()
  if (lectura.estado === 'sin_sesion') redirect('/login')
  if (lectura.estado === 'sin_acceso') redirect('/dashboard')
  // No se pudo comprobar: NO se saca a nadie del módulo. Se lanza un error que el marco del módulo recoge
  // dejando la barra en su sitio, con un botón para reintentar.
  if (lectura.estado === 'no_verificado') throw new Error(ERROR_ACCESO_NO_VERIFICADO)
  const acceso = lectura.acceso

  const suficiente = requiere === 'cualquiera'
    || (requiere === 'gestor' && gestiona(acceso.nivel))
    || (requiere === 'gestor_o_consulta' && veDirectorio(acceso.nivel))
    || (requiere === 'admin' && acceso.nivel === 'admin')
  if (!suficiente) redirect(ITEM_PLAN_DESARROLLO.href)

  return acceso
}

/**
 * El título de la pestaña del navegador.
 *
 * Next calcula los metadatos de una página AUNQUE su cuerpo termine en 404, así
 * que un `metadata` fijo pondría «Resumen · Por Amor a Fredonia» en la pestaña
 * de quien abra esta dirección en producción, donde el módulo no existe.
 * Pasando por la misma regla que la puerta, allí no dice nada.
 */
export function metadataPdm(seccion: string): Metadata {
  return pdmHabilitado() ? { title: `${seccion} · ${PLAN.nombre}` } : {}
}
