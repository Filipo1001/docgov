'use client'

/**
 * El marco del módulo Plan de Desarrollo: lo que rodea a sus pantallas.
 *
 * ── Por qué no lleva la barra lateral de contratos ───────────────────────
 *
 * Esa barra es el menú de la gestión contractual: contratos, informes,
 * firmas. Mientras se trabaja en el plan no se usa nada de eso, y ocupa 256 px
 * de ancho que las tablas de indicadores sí aprovechan. Se sustituye, no se
 * quita: hace falta una salida a la vista de siempre y saber en qué módulo se
 * está.
 *
 * ── Por qué no lleva menú propio (todavía) ───────────────────────────────
 *
 * Hoy el módulo tiene una sola pantalla; un menú de un ítem sería el mismo
 * ruido que se acaba de quitar. Cuando existan las secciones de administración
 * (estructura, responsables, cortes, auditoría) su barra lateral irá aquí, en
 * este marco, y no en el de contratos.
 *
 * ── Qué NO hace, a propósito ─────────────────────────────────────────────
 *
 * No cierra sesión. La salida de `Sidebar` lleva una defensa contra un cuelgue
 * real del navegador (el bloqueo interno de `signOut`); copiarla aquí sería
 * mantener dos versiones de algo delicado. Se cierra desde el panel, a un clic
 * de «Contratista Digital».
 *
 * Vive DENTRO del layout del panel, así que hereda la sesión, el caché de
 * datos y la redirección por sesión vencida: no hay un segundo login.
 */

import Link from 'next/link'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { avatarThumb } from '@/lib/avatar'
import { useUsuario } from '@/lib/user-context'

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase()
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase()
}

/** La barra superior. Recibe los datos por props: no sabe de dónde salen, y por eso se puede mirar sola. */
export function BarraPdm({
  usuario,
  municipio,
}: {
  usuario: { nombre_completo: string; foto_url?: string | null } | null
  municipio: { nombre: string } | null
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-8">
        <Link
          href="/dashboard"
          className="-ml-2 flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <Icono glifo={Iconos.accion.retroceder} tamano="sm" />
          <span className="hidden sm:inline">Contratista Digital</span>
          <span className="sm:hidden">Panel</span>
        </Link>

        <span aria-hidden className="h-5 w-px shrink-0 bg-gray-200" />

        <div className="flex min-w-0 items-center gap-2">
          <Icono glifo={Iconos.navegacion.planDesarrollo} tamano="md" className="shrink-0 text-teal-600" />
          <span className="truncate text-sm font-bold text-gray-900">Plan de Desarrollo</span>
          {municipio && (
            <span className="hidden truncate text-sm text-gray-400 md:inline">· {municipio.nombre}</span>
          )}
        </div>

        {usuario && (
          <Link
            href="/dashboard/perfil"
            aria-label="Mi perfil"
            className="ml-auto flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-gray-100 sm:pr-3"
          >
            {usuario.foto_url ? (
              <img
                src={avatarThumb(usuario.foto_url) ?? usuario.foto_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold leading-none text-teal-800">
                {iniciales(usuario.nombre_completo)}
              </span>
            )}
            <span className="hidden text-sm font-medium text-gray-700 sm:inline">
              {usuario.nombre_completo.split(' ')[0]}
            </span>
          </Link>
        )}
      </div>
    </header>
  )
}

export default function MarcoPdm({ children }: { children: React.ReactNode }) {
  const { usuario, municipio } = useUsuario()

  return (
    <div className="min-h-screen bg-gray-50">
      <BarraPdm usuario={usuario} municipio={municipio} />
      <main className="px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">
        {children}
      </main>
    </div>
  )
}
