import type { Metadata } from 'next'
import AmigoSecretoClient from './AmigoSecretoClient'

/**
 * Sorteo de amigo secreto de la Alcaldía de Fredonia.
 *
 * Vive en el ápice —contratistadigital.com/amigosecreto— y no en el subdominio
 * de la aplicación: el enlace se reparte por WhatsApp entre 35 empleados del
 * municipio, y `app.` es la herramienta de trabajo, con sus sesiones y sus
 * datos contractuales. Esto es un regalo aparte y no debe parecer parte de
 * ella. Por eso está en RUTAS_COMERCIALES de `lib/dominio.ts`; sin esa entrada
 * el middleware lo redirigiría al app.
 *
 * NO SE INDEXA, y aquí importa más que en las propuestas: la página lleva los
 * nombres de 35 personas reales de una alcaldía. Que un buscador los liste al
 * teclear su nombre sería un problema de discreción sin ninguna contrapartida.
 * La exclusión va por partida doble —aquí y en `app/robots.ts`— porque
 * robots.txt evita el rastreo pero no impide que una URL enlazada desde fuera
 * termine listada.
 *
 * Se sirve sobre fondo oscuro y a una sola tema, a propósito: es un juego de
 * diciembre, no una pantalla de trabajo, y los alumbrados de Antioquia son
 * nocturnos.
 */

export const metadata: Metadata = {
  title: 'Amigo secreto · Alcaldía de Fredonia',
  description: 'Entra, busca tu nombre y descubre a quién le regalas.',
  robots: { index: false, follow: false },
}

export default function AmigoSecretoPage() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: '#101A2E' }}>
      <AmigoSecretoClient />
    </main>
  )
}
