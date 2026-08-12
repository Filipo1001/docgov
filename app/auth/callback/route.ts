import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // La recuperación de contraseña NO pasa por aquí: su enlace apunta directo
  // a /auth/nueva-contrasena. Supabase no conserva `type=recovery` al redirigir
  // después de verificar, así que este punto no puede distinguir el motivo del
  // enlace y cualquier intento de hacerlo acaba mandando la recuperación al
  // panel, con la contraseña sin cambiar.
  return NextResponse.redirect(`${origin}/dashboard`)
}
