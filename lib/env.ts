/**
 * Centralized environment variable validation.
 * This module throws at import time if any required variable is missing,
 * so the app fails fast with a clear message instead of a cryptic runtime error.
 */

// Next.js/webpack can only substitute NEXT_PUBLIC_ vars when accessed as literal
// property lookups (process.env.NEXT_PUBLIC_FOO). Dynamic bracket access
// (process.env[name]) is NOT replaced and returns undefined on the client.
// Pass the resolved value as a second argument so the key stays literal.
function requireEnv(name: string, value: string | undefined): string {
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
  supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
} as const
