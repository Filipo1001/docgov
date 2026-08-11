import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Supabase agrega `type=recovery` al enlace de resetPasswordForEmail, para
  // distinguirlo de un login normal. Sin este chequeo, quien pide recuperar
  // su contraseña terminaba con sesión iniciada en /dashboard sin que nadie
  // le pidiera la contraseña nueva.
  const type = searchParams.get('type')

  if (code) {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/auth/nueva-contrasena`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
