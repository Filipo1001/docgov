import 'server-only'
import QRCode from 'qrcode'
import { ORIGEN_APP } from '@/lib/dominio'
import { rutaDeVerificacion } from './constancia'
import { cargarConstanciaPublica, emitirConstancia } from './constancia-servidor'
import { fechaHoraBogota } from './historial'

/**
 * La constancia en PDF de una versión de reporte, lista para entregar: emite su código (el que ya tenía, o uno nuevo), lee lo
 * que la base publica de ella, dibuja el QR y arma el documento. La usan el botón «Constancia (PDF)» y el paquete ZIP, para
 * que las dos entreguen EXACTAMENTE la misma constancia.
 *
 * Quién puede pedirla NO se decide aquí: lo comprueba cada ruta con la sesión de quien la pide (que vea el reporte).
 */
export type ConstanciaGenerada =
  | { ok: true; codigo: string; url: string; pdf: Uint8Array; generadaEn: string }
  | { ok: false; error: string }

export async function generarConstanciaPdf(reporteId: string): Promise<ConstanciaGenerada> {
  const emitida = await emitirConstancia(reporteId)
  if (!emitida.ok) return { ok: false, error: emitida.error }
  const lectura = await cargarConstanciaPublica(emitida.codigo)
  if (lectura.estado !== 'ok') return { ok: false, error: 'No se pudo generar la constancia.' }

  const url = `${ORIGEN_APP}${rutaDeVerificacion(emitida.codigo)}`
  const generadaEn = fechaHoraBogota(new Date().toISOString())
  const qr = await QRCode.toDataURL(url, { margin: 0, width: 360, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } })

  const [{ renderToBuffer }, React, { ConstanciaDeReporte }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('react'),
    import('./constancia-pdf'),
  ])
  const pdf = await renderToBuffer(React.createElement(ConstanciaDeReporte, { c: lectura.constancia, qr, url, generadaEn }) as never)
  return { ok: true, codigo: emitida.codigo, url, pdf: new Uint8Array(pdf), generadaEn }
}
