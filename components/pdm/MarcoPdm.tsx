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
 * ── El menú propio ────────────────────────────────────────────────────────
 *
 * Son pestañas bajo la barra y no una barra lateral: con tres o cuatro
 * secciones una barra lateral le vuelve a quitar al contenido el ancho que se
 * acaba de ganar. Si un día son siete, este es el sitio donde cambiarlo. Cada
 * pestaña es una ruta real, así que el botón «atrás», recargar y compartir un
 * enlace funcionan como se espera.
 *
 * ── Identidad ────────────────────────────────────────────────────────────
 *
 * Es Contratista Digital —misma tinta, misma tipografía, mismos iconos— pero se
 * lee como un módulo aparte: un solo acento propio (el verde azulado del
 * botón que lo abre) y el nombre del plan compuesto con tipografía, igual que
 * lo hace `AlcaldeHome`. Sin escudo ni imagen.
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
import { usePathname } from 'next/navigation'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { avatarThumb } from '@/lib/avatar'
import { useUsuario } from '@/lib/user-context'
import { PLAN, VISTA_PREVIA } from '@/lib/pdm/identidad'
import { SECCIONES_PDM, seccionActiva } from '@/lib/pdm/menu'

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase()
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase()
}

/**
 * La barra superior: salida, identidad del plan, secciones y persona.
 * Recibe todo por props —no sabe de dónde salen— y por eso se puede mirar sola.
 */
export function BarraPdm({
  usuario,
  ruta,
}: {
  usuario: { nombre_completo: string; foto_url?: string | null } | null
  ruta: string | null
}) {
  const activa = seccionActiva(ruta)

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4 md:h-14 md:px-8">
        <Link
          href="/dashboard"
          className="-ml-2 flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <Icono glifo={Iconos.accion.retroceder} tamano="sm" />
          <span className="hidden sm:inline">Contratista Digital</span>
          <span className="sm:hidden">Panel</span>
        </Link>

        <span aria-hidden className="h-6 w-px shrink-0 bg-gray-200" />

        {/* El nombre del plan. Va compuesto: es el eslogan de la administración, no un logotipo. */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white">
            <Icono glifo={Iconos.navegacion.planDesarrollo} tamano="md" />
          </span>
          <div className="min-w-0 leading-tight">
            <p
              className="truncate text-[10px] font-semibold uppercase text-teal-700"
              style={{ letterSpacing: '0.18em' }}
            >
              {PLAN.nombre}
            </p>
            <p className="truncate text-sm font-bold text-[#192031]">
              {PLAN.denominacion}
              <span className="hidden font-medium text-gray-400 sm:inline"> {PLAN.periodo}</span>
            </p>
          </div>
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

      <nav aria-label="Secciones del plan" className="mx-auto max-w-7xl px-4 md:px-8">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {SECCIONES_PDM.map(s => {
            const esta = s.href === activa
            return (
              <li key={s.href} className="shrink-0">
                <Link
                  href={s.href}
                  aria-current={esta ? 'page' : undefined}
                  className={`block border-b-2 px-3 py-2.5 text-sm transition-colors ${
                    esta
                      ? 'border-teal-600 font-semibold text-[#192031]'
                      : 'border-transparent font-medium text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {s.rotulo}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}

/**
 * Mientras los datos salgan de un archivo y no de la base, se dice: una línea,
 * sin ocupar una tarjeta. Se apaga en `VISTA_PREVIA.activa`.
 */
export function AvisoVistaPrevia() {
  if (!VISTA_PREVIA.activa) return null
  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <p className="mx-auto max-w-7xl px-4 py-1.5 text-xs text-amber-900 md:px-8">
        <b>Vista previa.</b> {VISTA_PREVIA.texto}
      </p>
    </div>
  )
}

export default function MarcoPdm({ children }: { children: React.ReactNode }) {
  const { usuario } = useUsuario()
  const ruta = usePathname()

  return (
    <div className="min-h-screen bg-gray-50">
      <BarraPdm usuario={usuario} ruta={ruta} />

      <AvisoVistaPrevia />

      <main className="px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">
        {children}
      </main>
    </div>
  )
}
