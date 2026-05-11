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
