/**
 * Server-only Supabase client using the service_role key.
 * This client bypasses RLS — NEVER import it in client components.
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from '@supabase/supabase-js'

export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[DocGov] SUPABASE_SERVICE_ROLE_KEY is required for admin operations.\n' +
      'Add it to your .env.local file. Find it in:\n' +
      'Supabase Dashboard → Project Settings → API → service_role key'
    )
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
