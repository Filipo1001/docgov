import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITIO, NOMBRE, DESCRIPCION } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Metadatos base de todo el despliegue.
 *
 * `metadataBase` es lo que permite que las rutas declaren imágenes y canónicas
 * con rutas relativas: sin él, Next omite las URL absolutas que exigen Open
 * Graph y las canónicas, que era justo lo que faltaba.
 *
 * Apunta al sitio comercial porque es el único indexable. La aplicación se
 * marca como no indexable más abajo y en su propio layout.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: {
    default: NOMBRE,
    // Las rutas internas añaden su nombre y heredan la marca.
    template: `%s | ${NOMBRE}`,
  },
  description: DESCRIPCION,
  applicationName: NOMBRE,
  referrer: 'origin-when-cross-origin',
  formatDetection: { telephone: false, address: false, email: false },
  icons: {
    // El .ico va primero: es lo que piden los rastreadores antiguos y el que
    // Google usa para el icono del resultado de búsqueda.
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { url: '/marca/icono-96.png', type: 'image/png', sizes: '96x96' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
