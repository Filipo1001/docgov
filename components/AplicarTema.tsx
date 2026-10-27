'use client'

/**
 * Mantiene el atributo del tema de la raíz acorde con la ruta y la preferencia. No pinta nada.
 *
 * El script de `<head>` (`SCRIPT_TEMA`) lo pone al cargar; esto lo sigue cuando se navega SIN recargar: al entrar al módulo Plan de
 * Desarrollo (que por ahora siempre es claro) lo quita, al volver al panel lo repone, y si la preferencia es «automático» sigue al
 * sistema. Al desmontarse (salir del panel) lo quita, para no dejar un sitio público a medio oscurecer.
 */

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { ATRIBUTO_TEMA } from '@/lib/tema'
import { alCambiarElSistema, aplicarTema, preferenciaGuardada } from '@/lib/tema-cliente'

export default function AplicarTema() {
  const pathname = usePathname()

  useEffect(() => {
    aplicarTema(preferenciaGuardada(), pathname)
    return alCambiarElSistema(() => aplicarTema(preferenciaGuardada(), pathname))
  }, [pathname])

  // Otra pestaña cambió la preferencia: esta la sigue.
  useEffect(() => {
    const alGuardar = () => aplicarTema(preferenciaGuardada())
    window.addEventListener('storage', alGuardar)
    return () => window.removeEventListener('storage', alGuardar)
  }, [])

  useEffect(() => () => document.documentElement.removeAttribute(ATRIBUTO_TEMA), [])

  return null
}
