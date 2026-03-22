import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from './env'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore errors in Server Components
          }
        },
      },
    }
  )
}