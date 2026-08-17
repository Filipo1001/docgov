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
    // app/favicon.ico lo inyecta Next por convención de archivo; declararlo
    // aquí además duplicaba la etiqueta. Estos dos son los que Next no añade.
    icon: [
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
    // `translate="no"` + la meta de Google: el navegador NO debe traducir esta
    // aplicación.
    //
    // No es una precaución teórica. Con la traducción automática encendida,
    // Chrome tomaba «Mayo» por la palabra inglesa y la mostraba como
    // «Mayonesa» en el selector de mes de cotización; «Agosto» aparecía como
    // «Atrás». El valor enviado seguía siendo el correcto —se traduce el texto
    // visible, no el `value` de la opción—, pero alguien que elige el mes que
    // cubre su planilla no puede estar leyendo «Mayonesa».
    //
    // `lang="es"` por sí solo no basta: Chrome recuerda «traducir siempre este
    // sitio» y pasa por encima de esa declaración. Esta aplicación es
    // monolingüe para municipios colombianos, así que no hay ningún caso en el
    // que traducirla sea correcto.
    <html lang="es" translate="no">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased notranslate`}
      >
        {children}
      </body>
    </html>
  );
}
