'use client'

/**
 * Expediente documental del contrato.
 *
 * ── Qué se ve, y por qué así ─────────────────────────────────────────────
 *
 * EL CONTRATO, arriba y con su papel escrito debajo: «viaja dentro del paquete
 * de SECOP de la primera cuenta de cobro». No es un adorno — es lo que hace
 * que esa casilla exista. Cuando falta, el hueco no dice «sin adjuntar»: dice
 * qué se rompe y cuándo, porque es el estado que se ve en 114 de los 156
 * contratos y el único momento en que la pantalla puede evitar el problema.
 *
 * OTROS DOCUMENTOS, debajo y sin lista fija. Otrosíes, conceptos jurídicos,
 * cualquier soporte que solo se archiva. El nombre del archivo los identifica.
 *
 * ── Lo que había antes ───────────────────────────────────────────────────
 *
 * Seis casillas fijas (contrato firmado, CDP, RP, RUT, certificación bancaria,
 * póliza) con un contador «0 de 6» presidiéndolo todo. De los 42 documentos
 * adjuntos que había en producción, ninguno se subió en una de ellas: la
 * alcaldía escanea el expediente entero y sube un solo PDF de ~104 páginas.
 * El contador estaba en rojo permanente y lo único real vivía en un pie de
 * página gris. Ver lib/documentos-contrato.ts.
 */

import { useState } from 'react'
import SubiendoArchivo from '@/components/ui/SubiendoArchivo'
import { toast } from 'sonner'
import VisorPDF from '@/components/VisorPDF'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import {
  prepararUploadDocumento, registrarDocumento,
  eliminarDocumentoContrato, listarDocumentosContrato,
} from '@/app/actions/documentos-contrato'
import {
  type DocumentoContratoDTO, type TipoDocumento,
} from '@/lib/documentos-contrato'

/** «14 de septiembre de 2026», en hora de Colombia. */
function fechaLegible(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota',
  })
}

function pesoLegible(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function BotonAdjuntar({
  cargando, tieneArchivos, onFile,
}: {
  cargando: boolean
  tieneArchivos: boolean
  onFile: (file: File) => void
}) {
  return (
    <label
      className={`text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors shrink-0 ${
        cargando
          ? 'text-gray-400 bg-gray-100 cursor-wait'
          : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
      }`}
    >
      {cargando ? 'Subiendo…' : tieneArchivos ? '+ Añadir' : 'Adjuntar'}
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={cargando}
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
    </label>
  )
}

function ListaArchivos({
  archivos, editable, onVer, onBorrar, indentado = true,
}: {
  archivos: DocumentoContratoDTO[]
  editable: boolean
  onVer: (d: DocumentoContratoDTO) => void
  onBorrar: (id: string) => void
  /** Alinea bajo el icono de estado de la fila requerida. En la sección de
      adicionales no hay fila que alinear, así que se desactiva. */
  indentado?: boolean
}) {
  return (
    <div className={`space-y-1 ${indentado ? 'mt-2 pl-9' : ''}`}>
      {archivos.map(d => (
        <div key={d.id} className="group flex items-center gap-2">
          <Icono glifo={Iconos.documentos.adjunto} tamano="sm" className="shrink-0 text-gray-300" />
          <button
            type="button"
            onClick={() => onVer(d)}
            className="flex-1 min-w-0 flex items-baseline gap-2 text-left hover:underline underline-offset-2"
          >
            <span className="text-xs text-gray-700 truncate">{d.nombre_original}</span>
            <span className="text-[10px] text-gray-400 shrink-0">
              {pesoLegible(d.bytes)}{d.paginas ? ` · ${d.paginas} p.` : ''}
            </span>
          </button>
          {editable && (
            <button
              onClick={() => onBorrar(d.id)}
              aria-label={`Eliminar ${d.nombre_original}`}
              className="p-1 rounded text-gray-300 hover:text-red-600 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
            >
              <Icono glifo={Iconos.accion.eliminar} tamano="sm" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export default function ExpedienteContrato({
  contratoId,
  initial,
  editable,
  mesPrimeraCuenta,
}: {
  contratoId: string
  initial: DocumentoContratoDTO[]
  editable: boolean
  /**
   * Mes de la primera cuenta de cobro del contrato, si ya se puede saber.
   *
   * Es lo que convierte el hueco vacío en un aviso con fecha. Llega `null`
   * cuando el contrato todavía no tiene ningún periodo enviado: entonces la
   * pantalla dice «la primera cuenta de cobro» sin comprometerse con un mes
   * que aún no existe.
   */
  mesPrimeraCuenta: string | null
}) {
  const [docs, setDocs] = useState(initial)
  const [subiendo, setSubiendo] = useState<TipoDocumento | null>(null)
  const [visor, setVisor] = useState<{ url: string; nombre: string } | null>(null)

  const porTipo = (t: TipoDocumento) => docs.filter(d => d.tipo_documento === t)
  const adicionales = porTipo('otro')

  async function subir(tipo: TipoDocumento, file: File) {
    setSubiendo(tipo)
    try {
      const prep = await prepararUploadDocumento(contratoId, file.name, file.size, tipo)
      if (prep.error || !prep.data) { toast.error(prep.error ?? 'No se pudo preparar la subida'); return }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.timeout = 120_000
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
          ? resolve() : reject(new Error(`Error al subir (HTTP ${xhr.status})`))
        xhr.onerror = () => reject(new Error('Error de red al subir el documento'))
        xhr.ontimeout = () => reject(new Error('La subida tardó demasiado. Verifica tu conexión.'))
        xhr.open('PUT', prep.data!.signedUrl)
        xhr.setRequestHeader('Content-Type', 'application/pdf')
        xhr.send(file)
      })

      const res = await registrarDocumento(contratoId, prep.data.path, file.name, tipo)
      if (res.error) { toast.error(res.error); return }
      setDocs(await listarDocumentosContrato(contratoId))
      toast.success('Documento adjuntado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir el documento')
    } finally {
      setSubiendo(null)
    }
  }

  async function borrar(id: string) {
    const res = await eliminarDocumentoContrato(contratoId, id)
    if (res.error) { toast.error(res.error); return }
    setDocs(prev => prev.filter(d => d.id !== id))
    toast.success('Documento eliminado')
  }

  const contrato = porTipo('contrato')[0] ?? null
  const otros = porTipo('otro')

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
        Expediente documental
      </h3>

      {/* ── El contrato ── */}
      {contrato ? (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Icono glifo={Iconos.estado.aprobado} tamano="md" className="text-emerald-600" />
            </div>
            <button
              type="button"
              onClick={() => contrato.urlFirmada && setVisor({ url: contrato.urlFirmada, nombre: contrato.nombre_original })}
              className="min-w-0 flex-1 text-left group"
            >
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Contrato</p>
              <p className="text-sm font-medium text-gray-900 truncate group-hover:underline underline-offset-2">
                {contrato.nombre_original}
              </p>
              <p className="text-xs text-gray-400">
                {contrato.paginas ? `${contrato.paginas} páginas · ` : ''}{pesoLegible(contrato.bytes)} · {fechaLegible(contrato.created_at)}
              </p>
            </button>
            {editable && (
              <button
                onClick={() => borrar(contrato.id)}
                aria-label={`Eliminar ${contrato.nombre_original}`}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
              >
                <Icono glifo={Iconos.accion.eliminar} tamano="sm" />
              </button>
            )}
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
              <p className="text-xs text-amber-700/80 mt-1 leading-relaxed">
                {mesPrimeraCuenta
                  ? <>Debe acompañar la cuenta de cobro de <strong>{mesPrimeraCuenta}</strong>. Sin él, el paquete de SECOP sale incompleto.</>
                  : <>Debe acompañar la primera cuenta de cobro. Sin él, el paquete de SECOP sale incompleto.</>}
              </p>
            </div>
            {editable && (
              <BotonAdjuntar
                cargando={subiendo === 'contrato'}
                tieneArchivos={false}
                onFile={file => subir('contrato', file)}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Otros documentos ── */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Otros documentos {otros.length > 0 && <span className="normal-case font-normal">({otros.length})</span>}
          </p>
          {editable && (
            <BotonAdjuntar
              cargando={subiendo === 'otro'}
              tieneArchivos={otros.length > 0}
              onFile={file => subir('otro', file)}
            />
          )}
        </div>

        {otros.length > 0 ? (
          <div className="mt-2">
            <ListaArchivos
              archivos={otros}
              editable={editable}
              indentado={false}
              onVer={d => d.urlFirmada && setVisor({ url: d.urlFirmada, nombre: d.nombre_original })}
              onBorrar={borrar}
            />
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 mt-1.5">
            Otrosíes, conceptos jurídicos, cualquier soporte posterior.
          </p>
        )}
      </div>

      {visor && (
        <VisorPDF url={visor.url} nombre={visor.nombre} onClose={() => setVisor(null)} />
      )}
      {/* Indicador de subida unificado — ver components/ui/SubiendoArchivo.tsx */}
      <SubiendoArchivo
        abierto={subiendo !== null}
        icono={Iconos.documentos.adjunto}
        etiqueta={'Subiendo documento'}
        detalle="No cierres esta página."
      />

    </div>
  )
}
