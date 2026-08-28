'use client'

/**
 * QueryProvider — TanStack Query setup
 *
 * Provee QueryClient con configuración pensada para Fredonia (<250 contratos).
 *
 *  - staleTime: 30s — al cambiar de tab y volver no se vuelve a buscar
 *  - retry: 1 con backoff de 1.5s — útil con redes intermitentes (Android viejo)
 *  - refetchOnWindowFocus: false — evitamos refetch agresivo
 *  - refetchOnReconnect: true — sí queremos refrescar al volver la red
 *  - networkMode: 'always' — ver abajo; es lo que evitaba que el panel cargara
 *
 * Devtools incluidos solo en desarrollo.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            retryDelay: 1500,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            // ── Por qué el panel se quedaba en esqueleto para siempre ──
            //
            // Con el valor por defecto ('online'), TanStack no lanza NINGUNA
            // consulta mientras crea que el navegador está sin red:
            //
            //   canFetch = networkMode === 'online' ? onlineManager.isOnline() : true
            //
            // La consulta no falla: queda PAUSADA. Y una consulta pausada
            // reporta status 'pending' con fetchStatus 'paused', o sea
            // isLoading=false, isError=false y data=undefined. El guarda de
            // los paneles (`if (isLoading || !data) return <Skeleton/>`) caía
            // en `!data` y dibujaba el esqueleto eterno: sin spinner, sin
            // error, sin botón — y sin una sola petición en los registros,
            // que es justo lo que veíamos.
            //
            // onlineManager se queda en «sin red» cuando la pestaña se congela
            // y el evento 'online' del regreso se pierde: exactamente el caso
            // de dejar la sesión inactiva. Y no se cura recargando, porque el
            // navegador restaura la página congelada desde bfcache.
            //
            // 'always' hace que la red sea asunto del fetch, no de una
            // bandera del navegador que en móvil rural miente a menudo. Si de
            // verdad no hay red, el fetch falla, se reintenta y se ve el
            // error — que es recuperable. Una pausa invisible no lo es.
            networkMode: 'always',
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  )
}
