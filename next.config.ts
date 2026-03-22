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
}

export default nextConfig
