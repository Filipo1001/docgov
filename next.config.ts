import type { NextConfig } from 'next'

// LAN origins allowed during development.
// Add IPs/hostnames separated by commas in ALLOWED_DEV_ORIGINS env var.
const devOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(',').map((s) => s.trim())
  : ['192.168.1.197']

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,

  // Marca de versión visible en el cliente. Sirve para responder sin ambigüedad
  // "¿este navegador está corriendo el código que acabo de desplegar?" — la
  // pregunta que no se pudo contestar durante la caza del panel congelado,
  // donde varios arreglos parecían no surtir efecto.
  env: {
    NEXT_PUBLIC_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
  },

  // Keep @react-pdf/renderer and canvas on the Node.js server only.
  // Prevents bundling issues when these packages are imported in API routes.
  serverExternalPackages: ['@react-pdf/renderer', 'canvas'],

  // Raise Server Action body limit to 10 MB so mobile phone photos (3–8 MB)
  // don't silently fail against the default 1 MB cap.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig
