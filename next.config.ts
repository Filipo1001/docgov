import type { NextConfig } from 'next'

// LAN origins allowed during development.
// Add IPs/hostnames separated by commas in ALLOWED_DEV_ORIGINS env var.
const devOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(',').map((s) => s.trim())
  : ['192.168.1.197']

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,

  // Keep @react-pdf/renderer and canvas on the Node.js server only.
  // Prevents bundling issues when these packages are imported in API routes.
  serverExternalPackages: ['@react-pdf/renderer', 'canvas'],

  // Raise Server Action body limit to 10 MB so mobile phone photos (3–8 MB)
  // don't silently fail against the default 1 MB cap.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',

      // Orígenes admitidos para las Server Actions.
      //
      // Next compara el `origin` del navegador contra el `x-forwarded-host` y
      // aborta la acción si difieren. Este proyecto sirve DOS dominios sobre un
      // mismo despliegue (ver lib/dominio.ts y middleware.ts), así que dejar esa
      // correspondencia implícita es frágil: basta una petición que llegue con
      // el host comercial, o desde un dominio de Vercel, para que la acción se
      // rechace — y desde el navegador eso se ve como un error opaco, sin pista
      // de que el problema es de origen.
      //
      // Declararlos explícitamente vuelve determinista qué se acepta. Importa
      // más desde que el panel de inicio pide sus datos por Server Action:
      // antes, un rechazo aquí solo afectaba a acciones sueltas; ahora dejaría
      // el panel sin datos.
      allowedOrigins: [
        'app.contratistadigital.com',
        'contratistadigital.com',
        'www.contratistadigital.com',
        'docgov-black.vercel.app',
        // Despliegues de vista previa: el subdominio cambia en cada uno.
        '*.vercel.app',
      ],
    },
  },
}

export default nextConfig
