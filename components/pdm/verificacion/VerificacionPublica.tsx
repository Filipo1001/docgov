/**
 * Lo que enseña la página pública cuando alguien escanea el QR de una constancia del Plan de Desarrollo (`/verificar/PDM-…`).
 *
 * Sin sesión y sin buscadores (la página que la monta lleva `noindex`). Pública no es lo mismo que indexable: muestra el nombre
 * de quien reportó y de quien validó, y eso se ve con el código, no al buscar a una persona.
 *
 * Qué dice, en este orden:
 *   1. El ESTADO vivo de esa versión, con todas las letras. Un reporte que no está aprobado lo dice arriba y en grande: quien
 *      escanea una constancia no puede tomarla por un reporte validado.
 *   2. De qué reporte se trata: la secretaría, el indicador, el año, la meta y el valor reportado.
 *   3. Quién reportó y quién validó, y cuándo.
 *   4. Los archivos por TIPO, tamaño y huella (sus nombres no se publican) y la comprobación de un archivo.
 *
 * No depende de que el módulo esté abierto o cerrado en el entorno: un QR impreso tiene que seguir valiendo (regla 1 de CLAUDE.md).
 */

import Link from 'next/link'
import { PLAN } from '@/lib/pdm/identidad'
import {
  ROTULO_DE_ESTADO, esVersionAnterior, fraseDeEstado, rotuloDeConstancia, rutaDeVerificacion, requiereAdvertencia,
  type ConstanciaPublica, type EstadoDeConstancia,
} from '@/lib/pdm/constancia'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import { nombrePropio } from '@/lib/pdm/personas'
import ArchivosDeConstancia from './ArchivosDeConstancia'
import ComprobarArchivo from './ComprobarArchivo'

const COLOR: Record<EstadoDeConstancia, { banda: string; caja: string; texto: string }> = {
  aprobado: { banda: 'bg-emerald-600', caja: 'bg-emerald-50 border-emerald-200', texto: 'text-emerald-900' },
  pendiente: { banda: 'bg-amber-600', caja: 'bg-amber-50 border-amber-300', texto: 'text-amber-950' },
  devuelto: { banda: 'bg-orange-600', caja: 'bg-orange-50 border-orange-300', texto: 'text-orange-950' },
  anulado: { banda: 'bg-red-600', caja: 'bg-red-50 border-red-200', texto: 'text-red-900' },
}

/** Una versión que ya no es la vigente no se pinta con el color de su estado: se pinta neutra. */
const NEUTRO = { banda: 'bg-slate-600', caja: 'bg-slate-50 border-slate-200', texto: 'text-slate-800' }

const numero = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 })

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2.5">
      <dt className="shrink-0 text-[13px] text-slate-500">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-[13px] font-semibold text-slate-900 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 px-4 py-8 font-sans">
      <div className="w-full max-w-[520px]">
        <div className="mb-6 text-center">
          <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900">
            <span className="text-base font-bold text-white">CD</span>
          </div>
          <h1 className="m-0 text-base font-bold text-slate-900">Contratista Digital</h1>
          <p className="mt-0.5 text-xs text-slate-400">Verificación de documentos</p>
        </div>
        {children}
        <p className="mt-5 text-center text-[11px] text-slate-300">Contratista Digital — Alcaldía Municipal de Fredonia, Antioquia</p>
      </div>
    </div>
  )
}

/** El código no existe en el sistema. */
export function ConstanciaNoEncontrada({ codigo }: { codigo: string }) {
  return (
    <Marco>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 bg-red-600 px-5 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-base text-white">!</div>
          <div>
            <p className="m-0 text-sm font-bold text-white">Código no encontrado</p>
            <p className="m-0 text-[11px] text-red-100">No existe una constancia con este código</p>
          </div>
        </div>
        <p className="m-0 p-5 text-[13px] leading-relaxed text-slate-600">
          El código <strong>{codigo}</strong> no corresponde a ninguna constancia emitida por el sistema. Verifique que lo haya
          escrito o escaneado correctamente. Si el problema persiste, el documento que tiene en su poder podría no ser auténtico.
        </p>
      </div>
    </Marco>
  )
}

/** No se pudo consultar (distinto de «no existe»: no se le dice a quien tiene un documento válido que podría ser falso). */
export function ConstanciaNoDisponible({ codigo }: { codigo: string }) {
  return (
    <Marco>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 bg-slate-700 px-5 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-base text-white">…</div>
          <div>
            <p className="m-0 text-sm font-bold text-white">No pudimos consultarlo ahora</p>
            <p className="m-0 text-[11px] text-slate-300">Esto no significa que el código sea falso</p>
          </div>
        </div>
        <p className="m-0 p-5 text-[13px] leading-relaxed text-slate-600">
          No fue posible consultar el código <strong>{codigo}</strong> en este momento. Inténtelo de nuevo en unos minutos.
        </p>
      </div>
    </Marco>
  )
}

export default function VerificacionPublica({ c }: { c: ConstanciaPublica }) {
  const color = esVersionAnterior(c) ? NEUTRO : COLOR[c.estado]
  const ind = c.indicador
  const unidad = ind.unidad.trim()
  const conUnidad = (n: number) => `${numero(n)}${unidad ? ` ${unidad}` : ''}`

  return (
    <Marco>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* El estado manda: color y palabras de ESE estado, no un «auténtico» verde para todos. */}
        <div className={`${color.banda} px-5 py-4`}>
          <p className="m-0 text-base font-bold text-white">{rotuloDeConstancia(c)}</p>
          <p className="m-0 mt-0.5 text-[11px] text-white/80">Constancia auténtica · emitida por Contratista Digital</p>
        </div>

        <div className="px-5 pb-5 pt-3">
          <p className={`mt-1 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed ${color.caja} ${color.texto} ${requiereAdvertencia(c.estado) ? 'font-medium' : ''}`}>
            {fraseDeEstado(c)}
          </p>

          {!c.vigente && c.estado !== 'anulado' && c.masReciente && (
            <p className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] leading-relaxed text-slate-700">
              Existe una versión más reciente de este reporte (del {fechaHoraBogota(c.masReciente.reportadoEn)}), hoy{' '}
              <strong>{ROTULO_DE_ESTADO[c.masReciente.estado].toLowerCase()}</strong>.{' '}
              {c.masReciente.codigo && (
                <Link href={rutaDeVerificacion(c.masReciente.codigo)} className="font-semibold text-slate-900 underline">
                  Ver esa versión
                </Link>
              )}
            </p>
          )}
          {c.estado === 'anulado' && c.masReciente && c.masReciente.codigo && (
            <p className="mt-2.5 text-[13px] text-slate-700">
              El reporte vigente de este indicador es otro:{' '}
              <Link href={rutaDeVerificacion(c.masReciente.codigo)} className="font-semibold text-slate-900 underline">verlo</Link>.
            </p>
          )}

          <dl className="mt-3">
            <Fila etiqueta="Plan">{PLAN.denominacion} · {PLAN.nombre}</Fila>
            <Fila etiqueta="Secretaría">{ind.dependencia}</Fila>
            <Fila etiqueta="Indicador">{ind.codigo ? `${ind.codigo} · ` : ''}{ind.nombre}</Fila>
            <Fila etiqueta="Año">{ind.anio}</Fila>
            {ind.meta !== null && <Fila etiqueta={`Meta ${ind.anio}`}>{conUnidad(ind.meta)}</Fila>}
            <Fila etiqueta="Valor reportado">
              {conUnidad(c.reporte.valor)}
              {c.reporte.valorAnterior !== null && (
                <span className="block text-[11px] font-normal text-slate-500">el anterior era {numero(c.reporte.valorAnterior)}</span>
              )}
            </Fila>
            <Fila etiqueta="Reportado">
              {fechaHoraBogota(c.reporte.reportadoEn)}
              <span className="block text-[11px] font-normal text-slate-500">por {nombrePropio(c.reporte.autor)}{c.reporte.esCorreccion ? ' · es una corrección' : ''}</span>
            </Fila>
            {c.validacion ? (
              <Fila etiqueta={c.validacion.estado === 'aprobado' ? 'Aprobado' : 'Devuelto'}>
                {fechaHoraBogota(c.validacion.fecha)}
                <span className="block text-[11px] font-normal text-slate-500">por {nombrePropio(c.validacion.validador)}</span>
              </Fila>
            ) : (
              <Fila etiqueta="Validación"><span className="font-normal text-slate-500">Todavía no ha sido validado</span></Fila>
            )}
            {c.anulacion && (
              <Fila etiqueta={c.anulacion.accion === 'anular' ? 'Anulado' : 'Restaurado'}>{fechaHoraBogota(c.anulacion.fecha)}</Fila>
            )}
            <Fila etiqueta="Código"><span className="font-mono">{c.codigo}</span></Fila>
            <Fila etiqueta="Constancia emitida">{fechaHoraBogota(c.creadaEn)}</Fila>
          </dl>

          <h2 className="mt-5 text-sm font-semibold text-slate-900">
            Archivos de esta versión{c.archivos.length > 0 ? ` (${c.archivos.length})` : ''}
          </h2>
          {c.archivos.length === 0 ? (
            <p className="mt-1.5 text-xs text-slate-500">Esta versión no tiene archivos.</p>
          ) : (
            <div className="mt-2">
              <ArchivosDeConstancia archivos={c.archivos} />
            </div>
          )}

          <ComprobarArchivo archivos={c.archivos} />

          <p className="mb-0 mt-5 text-[11px] leading-relaxed text-slate-400">
            Esta página muestra el estado ACTUAL del reporte, no el de la fecha en que se imprimió la constancia. Los nombres de los
            archivos no se publican: se comprueban por su huella. Si algún dato no coincide con el documento que recibió, el documento
            podría haber sido alterado.
          </p>
        </div>
      </div>
    </Marco>
  )
}
