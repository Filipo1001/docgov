import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { ProveedorAvisos } from '@/components/pdm/Avisos'
import { AvisoVistaPrevia, BarraPdmConectada } from '@/components/pdm/MarcoPdm'
import { leerAccesoPdm } from '@/lib/pdm/acceso'
import { pdmHabilitado } from '@/lib/pdm/habilitado'

/**
 * El layout propio del módulo: la barra (con sus pestañas) y el sitio del contenido.
 *
 * ── Qué hace y qué NO hace ───────────────────────────────────────────────
 *
 * Pinta la barra con las pestañas que le tocan a quien mira, calculadas aquí, en el servidor: llegan en el
 * primer byte, sin esperar a ninguna consulta del navegador (ver la nota de `MarcoPdm.tsx`).
 *
 * NO es la puerta de seguridad. Un layout no se vuelve a ejecutar cuando se navega entre sus pantallas hijas,
 * así que una comprobación puesta solo aquí protegería la primera pantalla y dejaría abiertas las demás. La
 * puerta sigue siendo `exigirAccesoPdm()` al principio de CADA página (ver `lib/pdm/acceso.ts`). Esto solo
 * decide qué pestañas se ven; lo que cada pestaña deja hacer lo decide su página, y en última instancia la base.
 *
 * ── Fuera de la vista previa, el módulo no existe ────────────────────────
 *
 * `connection()` obliga a decidirlo EN CADA PETICIÓN (sin él, el 404 se hornearía al compilar con el entorno
 * equivocado), y si el módulo no está habilitado es un 404 sin pintar nada suyo: ni barra, ni nombre del plan.
 * El layout del panel no usa este marco fuera de la vista previa (`usaMarcoPdm`), así que quien llegara aquí
 * lo vería con la barra lateral de siempre.
 *
 * ── Si no se pudo comprobar el acceso ────────────────────────────────────
 *
 * No se inventa una barra recortada: `nivel` va `undefined` y la barra pregunta al servidor desde el navegador,
 * mostrando solo las pestañas que valen para todos mientras llega la respuesta.
 */
export default async function PlanDesarrolloLayout({ children }: { children: React.ReactNode }) {
  await connection()
  if (!pdmHabilitado()) notFound()

  const lectura = await leerAccesoPdm()
  const nivel = lectura.estado === 'ok' ? lectura.acceso.nivel : lectura.estado === 'no_verificado' ? undefined : null

  return (
    <ProveedorAvisos>
      <BarraPdmConectada nivel={nivel} />
      {/* En producción no hay «vista previa» que avisar. */}
      {process.env.VERCEL_ENV !== 'production' && <AvisoVistaPrevia />}
      <main className="px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">
        {children}
      </main>
    </ProveedorAvisos>
  )
}
