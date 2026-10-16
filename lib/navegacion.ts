/**
 * ¿Es el navegador *navegando* a esta dirección?
 *
 * Abrir un PDF, una foto o un listado de `/api` sin sesión devolvía un JSON `{"error":"No autenticado"}` pelado.
 * Para una persona que pegó el enlace en la barra de direcciones eso es un callejón sin salida: lo que corresponde es
 * llevarla a iniciar sesión. Para una imagen (`<img src="/api/avatar/…">`), un `fetch` o un script, en cambio, el JSON
 * con su 401 es justo lo que esperan, y una redirección a una página HTML sería peor (la imagen "carga" un login).
 *
 * El navegador lo dice en `Sec-Fetch-Dest`: `document` al navegar (escribir la dirección, abrir un enlace, una
 * pestaña nueva), `image`, `empty` (fetch), `script`... Si la cabecera falta (navegadores viejos, herramientas),
 * se mira `Accept`: solo cuenta como navegación quien acepta HTML explícitamente; el «acepto cualquier cosa» de curl o de un fetch no.
 */
export function esNavegacionDeDocumento(headers: Pick<Headers, 'get'>): boolean {
  const destino = headers.get('sec-fetch-dest')
  if (destino) return destino === 'document'
  return (headers.get('accept') ?? '').includes('text/html')
}

/**
 * Rutas de `/api` que lleva a iniciar sesión a quien las abre en el navegador sin sesión. `/api/cron/*` queda fuera: lo
 * llama Vercel con su propio secreto, nunca una persona con cookies.
 */
export function debeIrAlLogin(pathname: string, headers: Pick<Headers, 'get'>): boolean {
  return pathname.startsWith('/api/') && !pathname.startsWith('/api/cron/') && esNavegacionDeDocumento(headers)
}
