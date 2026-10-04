'use client'

import { useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BotonAccion from '@/components/pdm/Movimiento'
import { T } from '@/components/pdm/tema'

/**
 * Cuando una pantalla del módulo falla, falla ELLA y no el marco.
 *
 * Este límite de error vive dentro del layout del módulo, así que la barra con sus pestañas sigue en su sitio y
 * la persona puede ir a otra sección sin recargar. Antes, el error de una pantalla caía en el del panel de
 * contratos (otro estilo, otras esquinas, un círculo rojo con un «!») y en producción, además, escondía qué
 * había pasado.
 *
 * El mensaje es el mismo para cualquier fallo: en producción Next no deja pasar el texto del error del servidor,
 * y las causas más comunes (la sesión que se renueva en paralelo, una consulta lenta) se resuelven reintentando.
 * «Reintentar» pide la pantalla de nuevo al servidor; «Iniciar sesión de nuevo» es la salida para cuando la sesión
 * de verdad venció.
 */
export default function ErrorPdm({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  useEffect(() => { console.error('[plan-desarrollo]', error) }, [error])

  // `reset` solo vuelve a pintar; para que el servidor vuelva a leer hay que refrescar la ruta también.
  const reintentar = () => empezar(() => { router.refresh(); reset() })

  return (
    <div role="alert" className="pdm-entra mx-auto max-w-2xl rounded-lg border border-[#DCE0E8] bg-white px-6 py-10 text-center">
      <p className="text-sm font-semibold text-[#192031]">No se pudo cargar esta pantalla.</p>
      <p className={`mt-1.5 text-sm leading-relaxed ${T.tenue}`}>
        A veces pasa cuando la sesión se está renovando. Lo que ya guardaste no se pierde. Intenta de nuevo; si sigue
        igual, inicia sesión otra vez.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <BotonAccion
          fase={pendiente ? 'trabajando' : 'reposo'}
          etiquetas={{ reposo: 'Reintentar', trabajando: 'Reintentando', hecho: 'Listo' }}
          onClick={reintentar}
        />
        <Link href="/login" className={T.accionSecundaria}>Iniciar sesión de nuevo</Link>
      </div>
    </div>
  )
}
