import 'server-only'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { origenSeguro } from './enlaces'

/**
 * Programa un aviso por correo para DESPUÉS de responder, sin poder estorbar la acción que lo pide.
 *
 * `after()` corre cuando la respuesta ya viajó al navegador (mismo patrón que `app/actions/periodos.ts`): nadie espera
 * al correo, y lo que haya pasado en la base ya pasó. Aquí además se lee el origen de la petición ANTES —dentro de
 * `after()` ya no hay cabeceras— y se atrapa cualquier fallo al programar: una acción que salió bien no puede reportar
 * error porque no se pudo avisar.
 *
 * El origen (`https://…`) es con el que se arman los enlaces: el módulo solo existe en la vista previa de Vercel, así
 * que el botón del correo tiene que llevar a la dirección donde está corriendo (ver `enlaces.ts`).
 */
export async function avisarDespues(tarea: (origen: string) => Promise<void>): Promise<void> {
  try {
    const origen = await origenDeLaSolicitud()
    after(() => tarea(origen))
  } catch (e) {
    console.error('[pdm/correos] no se pudo programar el aviso:', e instanceof Error ? e.message : e)
  }
}

async function origenDeLaSolicitud(): Promise<string> {
  try {
    const h = await headers()
    return origenSeguro(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'), process.env.VERCEL_BRANCH_URL)
  } catch {
    return origenSeguro(null, null, process.env.VERCEL_BRANCH_URL)
  }
}
