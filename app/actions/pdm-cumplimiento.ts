'use server'

/**
 * El cumplimiento del plan para el panel de inicio de cada rol (administrador, secretaría, contratista).
 *
 * Sigue el mismo camino que el resto de acciones del módulo, y ninguna puerta se salta:
 *
 *   1. `accesoPdm()`: fuera de la vista previa (producción) responde `null` sin leer nada. Quien no tiene acceso al módulo
 *      tampoco ve nada: el panel de inicio no abre una puerta que el módulo tiene cerrada.
 *   2. Solo LEE, con la sesión de quien pregunta: lo que ve lo decide la base, no este código (una secretaría su dependencia,
 *      un responsable sus indicadores, el administrador y Control Interno todo).
 *   3. Se devuelven las cuentas por año, no los indicadores: son pocas cifras, y el navegador las combina al elegir años.
 *
 * Un responsable recibe además solo lo que tiene a su cargo, por si la base le dejara ver más: lo que el diagrama dice de
 * «tus indicadores» no puede incluir los de nadie más.
 */

import { accesoPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm } from '@/lib/pdm/datos'
import { cuentasPorAnio, type DatosCumplimiento, type RespuestaCumplimiento } from '@/lib/pdm/graficos'
import { esMio } from '@/lib/pdm/mi-trabajo'
import { agrupar } from '@/lib/pdm/plan'

export async function cumplimientoPdm(): Promise<RespuestaCumplimiento> {
  try {
    const acceso = await accesoPdm()
    if (!acceso) return null

    const plan = await cargarPlanPdm()
    if (!plan.ok) return { estado: 'error' }

    const { anioActual } = plan.seguimiento
    const { nivel } = acceso
    const indicadores = nivel === 'responsable'
      ? plan.indicadores.filter(i => esMio(i, acceso.userId))
      : plan.indicadores
    if (indicadores.length === 0) return null

    const alcance: DatosCumplimiento['alcance'] = nivel === 'coordinador' ? 'secretaria' : nivel === 'responsable' ? 'mios' : 'plan'
    const secretarias = [...new Set(indicadores.map(i => i.dependencia))]

    const datos: DatosCumplimiento = {
      nivel,
      anioActual,
      alcance,
      secretaria: alcance === 'secretaria' ? secretarias.join(', ') : null,
      total: cuentasPorAnio(indicadores, anioActual),
      porSecretaria: alcance === 'plan'
        ? agrupar(indicadores, i => i.dependencia).map(([nombre, l]) => ({ nombre, porAnio: cuentasPorAnio(l, anioActual) }))
        : [],
    }
    return { estado: 'ok', datos }
  } catch (e) {
    console.error('[pdm/cumplimiento] excepción:', e)
    return { estado: 'error' }
  }
}
