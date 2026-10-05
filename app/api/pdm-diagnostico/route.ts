import { accesoPdm } from '@/lib/pdm/acceso'
import { pdmHabilitado } from '@/lib/pdm/habilitado'

/**
 * Recibe el rastro de la subida de evidencias (`lib/pdm/diagnostico.ts`) y lo deja en el registro del servidor.
 *
 *   · Solo existe donde existe el módulo (vista previa o desarrollo): fuera de ahí responde 404, como todo lo del módulo.
 *   · Solo lo acepta de quien tiene acceso al módulo, comprobado con su sesión.
 *   · Solo pasos y cifras: se descarta todo lo que no sea texto corto y número. Nada de datos de personas ni de archivos.
 *   · Un cuerpo de más de 2 KB se rechaza.
 */
const TEXTO = /^[\w .:/\-()+,;=%]{0,160}$/

export async function POST(req: Request) {
  if (!pdmHabilitado()) return new Response(null, { status: 404 })
  try {
    const acceso = await accesoPdm()
    if (!acceso) return new Response(null, { status: 401 })
    const crudo = await req.text()
    if (crudo.length > 2000) return new Response(null, { status: 413 })
    const d = JSON.parse(crudo) as { paso?: unknown; datos?: Record<string, unknown>; ruta?: unknown; vp?: unknown; ua?: unknown; mem?: unknown }
    const corto = (v: unknown) => (typeof v === 'string' && TEXTO.test(v) ? v : '?')
    const datos = Object.entries(d.datos ?? {})
      .filter(([k, v]) => TEXTO.test(k) && (typeof v === 'number' || typeof v === 'boolean' || v === null || (typeof v === 'string' && TEXTO.test(v))))
      .slice(0, 12)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' ')
    console.warn(`[pdm/diag] ${corto(d.paso)} ${datos} · ${corto(d.vp)} · mem=${typeof d.mem === 'number' ? d.mem + 'MB' : '-'} · usuario=${acceso.userId.slice(0, 8)} · ${corto(d.ua)}`)
    return new Response(null, { status: 204 })
  } catch {
    return new Response(null, { status: 400 })
  }
}
