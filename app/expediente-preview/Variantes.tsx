'use client'

/**
 * PANTALLA DE COMPARACIÓN — se borra al elegir.
 *
 * Las dos variantes del expediente documental, con datos reales, en sus dos
 * estados. Son presentacionales: los botones no suben nada. Lo que se está
 * eligiendo es cómo se ve, y la subida ya está escrita en el componente real.
 */

import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import type { DocumentoContratoDTO } from '@/lib/documentos-contrato'

function peso(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

const Adjuntar = ({ texto = 'Adjuntar' }: { texto?: string }) => (
  <span className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-blue-600 hover:bg-blue-50 cursor-pointer shrink-0">
    {texto}
  </span>
)

/* ══════════════════════════════════════════════════════════════════════
   A · Sin categorías — el archivo manda
   ══════════════════════════════════════════════════════════════════════ */
export function VarianteA({ docs }: { docs: DocumentoContratoDTO[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          Expediente del contrato
        </h3>
        {docs.length > 0 && (
          <span className="text-xs text-gray-400">
            {docs.length} {docs.length === 1 ? 'archivo' : 'archivos'}
          </span>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center">
          <Icono glifo={Iconos.documentos.adjunto} tamano="md" className="text-gray-300 mx-auto" />
          <p className="text-sm text-gray-500 mt-2">Todavía no hay nada archivado</p>
          <p className="text-xs text-gray-400 mt-0.5 mb-3">
            El contrato firmado, los estudios previos, las pólizas — como estén escaneados.
          </p>
          <Adjuntar />
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <Icono glifo={Iconos.documentos.adjunto} tamano="md" className="text-red-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{d.nombre_original}</p>
                <p className="text-xs text-gray-400">
                  {d.paginas ? `${d.paginas} páginas · ` : ''}{peso(d.bytes)} · {fecha(d.created_at)}
                </p>
              </div>
              <span className="text-xs font-medium text-blue-600 shrink-0">Ver</span>
            </div>
          ))}
          <div className="pt-1"><Adjuntar texto="+ Añadir otro" /></div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   B · Una casilla, la que sí existe
   ══════════════════════════════════════════════════════════════════════ */
export function VarianteB({
  docs, mesPrimeraCuenta,
}: {
  docs: DocumentoContratoDTO[]
  mesPrimeraCuenta: string | null
}) {
  const contrato = docs[0] ?? null
  const otros = docs.slice(1)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
        Expediente documental
      </h3>

      {contrato ? (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Icono glifo={Iconos.estado.aprobado} tamano="md" className="text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Contrato</p>
              <p className="text-sm font-medium text-gray-900 truncate">{contrato.nombre_original}</p>
              <p className="text-xs text-gray-400">
                {contrato.paginas ? `${contrato.paginas} páginas · ` : ''}{peso(contrato.bytes)} · {fecha(contrato.created_at)}
              </p>
            </div>
            <span className="text-xs font-medium text-blue-600 shrink-0">Ver</span>
          </div>
          <div className="bg-emerald-50/60 border-t border-emerald-100 px-4 py-2.5">
            <p className="text-[12px] text-emerald-800">
              {mesPrimeraCuenta
                ? <>Viaja dentro del paquete de SECOP de <strong>{mesPrimeraCuenta}</strong>, la primera cuenta de cobro.</>
                : <>Viajará dentro del paquete de SECOP de la primera cuenta de cobro.</>}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-5">
          <div className="flex items-start gap-3">
            <Icono glifo={Iconos.estado.pendiente} tamano="md" className="text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Contrato</p>
              <p className="text-sm font-medium text-amber-900 mt-0.5">Falta el contrato firmado</p>
              <p className="text-xs text-amber-700/80 mt-1">
                {mesPrimeraCuenta
                  ? <>Debe acompañar la cuenta de cobro de <strong>{mesPrimeraCuenta}</strong>. Sin él, el paquete de SECOP sale incompleto.</>
                  : <>Debe acompañar la primera cuenta de cobro. Sin él, el paquete de SECOP sale incompleto.</>}
              </p>
            </div>
            <Adjuntar />
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Otros documentos {otros.length > 0 && <span className="normal-case font-normal">({otros.length})</span>}
          </p>
          <Adjuntar texto={otros.length ? '+ Añadir' : 'Adjuntar'} />
        </div>
        {otros.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {otros.map(d => (
              <div key={d.id} className="flex items-center gap-2.5 text-sm text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <Icono glifo={Iconos.documentos.adjunto} tamano="sm" className="text-gray-300 shrink-0" />
                <span className="truncate flex-1">{d.nombre_original}</span>
                <span className="text-xs text-gray-400 shrink-0">{peso(d.bytes)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 mt-1.5">
            Otrosíes, conceptos jurídicos, cualquier soporte posterior.
          </p>
        )}
      </div>
    </div>
  )
}
