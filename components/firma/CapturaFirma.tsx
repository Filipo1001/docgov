'use client'

/**
 * El bloque de la firma, completo: lo que se ve, el escáner y la subida de
 * emergencia. Se usa igual en el perfil y dentro de la certificación de
 * retención, que es donde antes había un callejón sin salida —«ve a tu
 * perfil y sube tu firma»— justo en mitad del primer envío.
 *
 * Los dos caminos —escanear y subir una imagen— pesan lo mismo y cada uno
 * dice para quién es, de modo que elegir no exija pensar. Escanear va
 * primero porque de los siete pasos del camino viejo cinco ocurrían fuera de
 * la aplicación, y ahí es donde se quedaron 27 de los 120 contratistas sin
 * registrar su firma; ninguno de esos 27 ha enviado jamás un informe. Pero
 * quien ya tiene la foto en el teléfono no tiene por qué buscar un papel.
 */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { subirFirma } from '@/app/actions/periodos'
import { desdeArchivo } from '@/lib/firma-escaner'
import { formatCedula } from '@/lib/format'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import EscanerFirma from './EscanerFirma'

export default function CapturaFirma({
  nombre,
  cedula,
  firmaActual,
  onGuardada,
  compacto = false,
}: {
  nombre: string
  cedula?: string | null
  /** URL firmada de la firma ya registrada, o null. */
  firmaActual: string | null
  onGuardada: (url: string) => void
  /** Dentro de un modal el bloque va sin marco ni título propios. */
  compacto?: boolean
}) {
  const [escaneando, setEscaneando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const archivoRef = useRef<HTMLInputElement>(null)

  async function guardar(blob: Blob) {
    const formData = new FormData()
    formData.append('file', new File([blob], 'firma.png', { type: 'image/png' }))
    const res = await subirFirma(formData)
    if (res.error || !res.data?.url) {
      toast.error(res.error ?? 'No se pudo guardar la firma')
      return
    }
    onGuardada(res.data.url)
    setEscaneando(false)
    toast.success('Firma registrada')
  }

  async function desdeGaleria(file: File) {
    setSubiendo(true)
    try {
      const blob = await desdeArchivo(file)
      await guardar(blob)
    } catch (e) {
      const causa = e instanceof Error ? e.message : ''
      toast.error(
        causa === 'sin-trazo'
          ? 'No encontramos una firma en esa imagen. Prueba con una foto donde se vea sobre papel claro.'
          : 'No pudimos leer esa imagen. Si es un PDF o una foto de iPhone, escanéala con la cámara aquí mismo — es más rápido.',
      )
    } finally {
      setSubiendo(false)
    }
  }

  /**
   * El bloque de firma del documento, que es el corazón de las dos pantallas.
   *
   * En vez de enseñar la imagen suelta en una caja gris —que no le dice nada a
   * nadie— se enseña DONDE va a acabar: sobre la línea, con el nombre y la
   * cédula debajo, igual que en la cuenta de cobro. Cuando todavía no hay
   * firma, el hueco se dibuja en lugar de describirse.
   */
  const bloqueDocumento = (
    <div className="relative bg-white rounded-xl border border-gray-200 shadow-[0_1px_2px_rgba(25,32,49,.04),0_8px_24px_-18px_rgba(25,32,49,.35)] px-6 pt-5 pb-4 max-w-[19rem] mx-auto">
      <div className={`flex items-end justify-center ${compacto ? 'h-14' : 'h-20'}`}>
        {firmaActual ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={firmaActual} alt="Tu firma" className="max-h-full max-w-full object-contain" />
        ) : (
          /* El hueco, dibujado. Un trazo fantasma dice «aquí va una firma»
             más rápido que cualquier rótulo. */
          <svg viewBox="0 0 200 54" className="h-full w-auto text-gray-200" aria-hidden="true">
            {/* Un garabato con lazo y remate, no una onda regular: una línea
                ondulada uniforme se lee como un gráfico, no como escritura. */}
            <path
              d="M10 42 C14 16, 24 6, 32 14 C40 22, 30 40, 23 46 C16 52, 25 54, 36 47
                 C47 40, 52 20, 62 25 C72 30, 65 46, 76 45 C87 44, 93 18, 106 24
                 C119 30, 112 47, 125 45 C138 43, 143 17, 156 26"
              stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"
              strokeLinejoin="round" fill="none" strokeDasharray="6 8"
            />
            <path
              d="M156 26 C166 33, 172 44, 182 38 C187 35, 190 28, 193 22"
              stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"
              strokeLinejoin="round" fill="none" strokeDasharray="6 8"
            />
          </svg>
        )}
      </div>
      <div className="border-t border-gray-900 mt-1.5 pt-2 text-center">
        <p className="text-[12px] font-semibold text-gray-900 uppercase leading-tight truncate">
          {nombre}
        </p>
        {cedula && (
          <p className="text-[10px] text-gray-500 mt-0.5">C.C. {formatCedula(cedula)}</p>
        )}
        <p className="text-[10px] text-gray-500">Contratista</p>
      </div>

      {!firmaActual && (
        <span className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          Falta
        </span>
      )}
    </div>
  )

  const contenido = (
    <>
      <div className={`rounded-2xl border ${
        firmaActual
          ? 'border-gray-200 bg-gradient-to-b from-gray-50/80 to-white'
          : 'border-amber-200 bg-gradient-to-b from-amber-50/60 to-white'
      } px-5 pt-6 pb-5`}>

        {bloqueDocumento}

        <p className="text-[13px] text-gray-500 text-center leading-relaxed mt-4 mb-5 max-w-xs mx-auto">
          {firmaActual
            ? 'Así se estampa en tu cuenta de cobro, tu informe y las actas.'
            : 'Así se firman tu cuenta de cobro, tu informe y las actas. Se registra una sola vez.'}
        </p>

        {firmaActual ? (
          /* Ya hay firma: las dos salidas siguen siendo botones de verdad, no
             enlaces escondidos. Cambiar la firma es raro pero no excepcional
             —una firma mal escaneada, un cambio de nombre— y cuando toca, hay
             que encontrarlo sin buscar. */
          <div className="grid grid-cols-2 gap-2.5 max-w-[19rem] mx-auto">
            <BotonFirma
              onClick={() => setEscaneando(true)}
              disabled={subiendo}
              icono={<IconoCamara />}
              titulo="Escanear otra"
            />
            <BotonFirma
              onClick={() => archivoRef.current?.click()}
              disabled={subiendo}
              icono={<IconoImagen />}
              titulo={subiendo ? 'Procesando…' : 'Subir otra'}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-w-[19rem] mx-auto">
            <button
              onClick={() => setEscaneando(true)}
              disabled={subiendo}
              className="w-full bg-[#192031] hover:bg-[#242F45] active:scale-[.99] disabled:opacity-60 text-white py-3.5 px-4 rounded-2xl transition-all flex items-center gap-3 text-left shadow-sm"
            >
              <span className="shrink-0 w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                <IconoCamara />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-[15px] leading-tight">
                  {subiendo ? 'Procesando…' : 'Escanear mi firma'}
                </span>
                <span className="block text-[12px] text-white/60 leading-tight mt-0.5">
                  Firma en un papel y apunta la cámara
                </span>
              </span>
            </button>

            <button
              onClick={() => archivoRef.current?.click()}
              disabled={subiendo}
              className="w-full bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[.99] disabled:opacity-60 text-gray-900 py-3.5 px-4 rounded-2xl transition-all flex items-center gap-3 text-left"
            >
              <span className="shrink-0 w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
                <IconoImagen />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-[15px] leading-tight">Subir una imagen</span>
                <span className="block text-[12px] text-gray-400 leading-tight mt-0.5">
                  Si ya tienes una foto de tu firma
                </span>
              </span>
            </button>
          </div>
        )}

        {/* El pie cambia con el estado. Quien todavía no tiene firma necesita
            saber que no le van a pedir recortar nada; quien ya la tiene y está
            pensando en cambiarla necesita saber otra cosa: que los documentos
            que ya salieron no se tocan (regla 3 del CLAUDE.md). */}
        <p className="text-[11px] text-gray-400 text-center mt-4 leading-relaxed max-w-xs mx-auto">
          {firmaActual
            ? 'Puedes cambiarla cuando quieras. Los documentos ya emitidos conservan la firma con la que salieron.'
            : 'Con cualquiera de los dos: no tienes que recortar nada ni quitarle el fondo, y la ves antes de guardarla.'}
        </p>
      </div>

      <input
        ref={archivoRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={subiendo}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void desdeGaleria(f)
          e.target.value = ''
        }}
      />

      <EscanerFirma
        abierto={escaneando}
        nombre={nombre}
        cedula={cedula}
        onCancelar={() => setEscaneando(false)}
        onSubirArchivo={() => { setEscaneando(false); archivoRef.current?.click() }}
        onConfirmar={guardar}
      />
    </>
  )

  if (compacto) return <div>{contenido}</div>

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Firma</h2>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1 ${
          firmaActual
            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
            : 'text-amber-700 bg-amber-50 border border-amber-200'
        }`}>
          <Icono
            glifo={firmaActual ? Iconos.estado.aprobado : Iconos.estado.pendiente}
            tamano="sm"
          />
          {firmaActual ? 'Registrada' : 'Pendiente'}
        </span>
      </div>
      {contenido}
    </div>
  )
}

/** Botón secundario de las dos salidas, cuando ya hay firma. */
function BotonFirma({
  onClick, disabled, icono, titulo,
}: {
  onClick: () => void
  disabled: boolean
  icono: React.ReactNode
  titulo: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[.98] disabled:opacity-60 text-gray-700 rounded-2xl py-3 px-3 transition-all flex flex-col items-center gap-1.5"
    >
      <span className="text-gray-400">{icono}</span>
      <span className="text-[12px] font-medium leading-tight text-center">{titulo}</span>
    </button>
  )
}

function IconoCamara() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function IconoImagen() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}
