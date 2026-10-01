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
import { LogoCD } from '@/components/Logo'
import { useUsuario } from '@/lib/user-context'
import { PLAN, VISTA_PREVIA } from '@/lib/pdm/identidad'
import { useQuery } from '@tanstack/react-query'
import { nivelPdm } from '@/app/actions/pdm'
import { SECCIONES_PDM, seccionActiva, seccionesPara, type SeccionPdm } from '@/lib/pdm/menu'

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase()
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase()
}

/**
 * La barra superior: salida, identidad, secciones y persona.
 * Recibe todo por props —no sabe de dónde salen— y por eso se puede mirar sola.
 *
 * Es una banda de tinta (`#192031`, el grafito del logotipo) con el isotipo oficial en blanco: lo
 * primero que se ve es que esto es Contratista Digital. El nombre del plan va debajo del de la
 * plataforma, compuesto con tipografía —rótulo en mayúscula espaciada y el nombre del plan en
 * grueso—, como el membrete de un formato oficial. Las pestañas viven en la misma banda: un solo
 * bloque de navegación, no dos.
 */
export function BarraPdm({
  usuario,
  ruta,
  secciones = SECCIONES_PDM,
}: {
  usuario: { nombre_completo: string; foto_url?: string | null } | null
  ruta: string | null
  /** Las pestañas que le tocan a quien mira (ver `seccionesPara`). */
  secciones?: SeccionPdm[]
}) {
  const activa = seccionActiva(ruta)

  return (
    <header className="sticky top-0 z-30 bg-[#192031] text-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-8">
        <Link
          href="/dashboard"
          className="-ml-2 flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <Icono glifo={Iconos.accion.retroceder} tamano="sm" />
          <span className="hidden sm:inline">Contratista Digital</span>
          <span className="sm:hidden">Panel</span>
        </Link>

        <span aria-hidden className="h-7 w-px shrink-0 bg-white/20" />

        <div className="flex min-w-0 items-center gap-3">
          <LogoCD size={30} color="#FFFFFF" className="shrink-0" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[10px] font-semibold uppercase text-white/60" style={{ letterSpacing: '0.2em' }}>
              {PLAN.nombre}
            </p>
            <p className="truncate text-[15px] font-semibold tracking-tight">
              {PLAN.denominacion}
              <span className="hidden font-normal text-white/55 sm:inline"> · {PLAN.periodo}</span>
            </p>
          </div>
        </div>

        {usuario && (
          <Link
            href="/dashboard/perfil"
            aria-label="Mi perfil"
            className="ml-auto flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:pr-3"
          >
            {usuario.foto_url ? (
              <img
                src={avatarThumb(usuario.foto_url) ?? usuario.foto_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-8 w-8 rounded-full object-cover ring-1 ring-white/25"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold leading-none text-white">
                {iniciales(usuario.nombre_completo)}
              </span>
            )}
            <span className="hidden text-sm font-medium text-white/85 sm:inline">
              {usuario.nombre_completo.split(' ')[0]}
            </span>
          </Link>
        )}
      </div>

      <nav aria-label="Secciones del plan" className="mx-auto max-w-7xl px-4 md:px-8">
        <ul className="flex gap-1 overflow-x-auto">
          {secciones.map(s => {
            const esta = s.href === activa
            return (
              <li key={s.href} className="shrink-0">
                <Link
                  href={s.href}
                  aria-current={esta ? 'page' : undefined}
                  className={`block border-b-2 px-3.5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:bg-white/10 ${
                    esta
                      ? 'border-white font-semibold text-white'
                      : 'border-transparent font-medium text-white/60 hover:text-white'
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
    <div className="border-b border-[#DCE0E8] bg-white">
      <p className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 text-xs text-[#556072] md:px-8">
        <span className="font-semibold uppercase text-[#192031]" style={{ letterSpacing: '0.14em' }}>Vista previa</span>
        <span>{VISTA_PREVIA.texto}</span>
      </p>
    </div>
  )
}

export default function MarcoPdm({ children }: { children: React.ReactNode }) {
  const { usuario } = useUsuario()
  const ruta = usePathname()
  // La misma respuesta del servidor que usa la barra lateral (clave compartida): no es una petición más.
  const { data: nivel } = useQuery({
    queryKey: ['pdm-acceso'],
    queryFn: () => nivelPdm(),
    staleTime: Infinity,
    retry: false,
  })

  return (
    <div className="min-h-screen bg-[#F4F5F8]">
      <BarraPdm usuario={usuario} ruta={ruta} secciones={seccionesPara(nivel)} />

      <AvisoVistaPrevia />

      <main className="px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">
        {children}
      </main>
    </div>
  )
}
