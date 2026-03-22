/**
 * Centralized environment variable validation.
 * This module throws at import time if any required variable is missing,
 * so the app fails fast with a clear message instead of a cryptic runtime error.
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(
      `[DocGov] Missing required environment variable: ${name}\n` +
      `Make sure it is defined in your .env.local file.\n` +
      `See: https://supabase.com/dashboard/project/_/settings/api`
    )
  }
  return value
}

export const env = {
  supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
} as const
