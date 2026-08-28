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
 *  - networkMode: 'always' — nunca pausar por una lectura falsa de «sin red»
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
            // Defensa, no la causa. La causa del panel congelado resultó ser
            // otra (la capa de auth del navegador se cuelga; ver
            // app/actions/dashboard.ts), pero por el camino se comprobó que
            // con el valor por defecto TanStack no lanza NINGUNA consulta
            // mientras crea que no hay red:
            //
            //   canFetch = networkMode === 'online' ? onlineManager.isOnline() : true
            //
            // La consulta no falla: queda PAUSADA, o sea isLoading=false,
            // isError=false y data=undefined — indistinguible de «cargando» y
            // sin nada que el usuario pueda hacer. En red móvil rural esa
            // bandera del navegador miente a menudo. Con 'always' la red es
            // asunto del fetch: si de verdad no hay, falla, se reintenta y se
            // ve el error, que sí es recuperable.
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
