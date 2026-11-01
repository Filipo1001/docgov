import { redirect } from 'next/navigation'

// El perfil y la configuración viven juntos en «Mi cuenta» desde el 31-oct-2026. La dirección vieja se conserva
// para los enlaces guardados y los correos ya enviados.
export default function Page() {
  redirect('/dashboard/cuenta')
}
