'use client'

/**
 * PÁGINA TEMPORAL — se borra antes de llevar esto a main.
 *
 * Existe por una razón concreta: el escáner solo se puede juzgar con un
 * teléfono de verdad, una hoja de verdad y la luz de una oficina de verdad.
 * Y la pantalla donde vive —el perfil— está detrás del inicio de sesión, que
 * en un preview obliga a autenticarse dos veces desde el móvil.
 *
 * Aquí no se guarda nada ni se toca la base de datos: se escanea y se ve el
 * resultado. Lo que se está probando es si la cámara arranca en ese teléfono
 * y si el recorte sale limpio, no el guardado, que ya funcionaba.
 */

import { useState } from 'react'
import EscanerFirma from '@/components/firma/EscanerFirma'
import CapturaFirma from '@/components/firma/CapturaFirma'

export default function ProbarFirma() {
  const [abierto, setAbierto] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-gray-50 px-5 py-10">
      <div className="max-w-sm mx-auto">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">
          Prueba · no guarda nada
        </p>
        <h1 className="text-2xl font-semibold text-[#192031] mb-3">Escáner de firma</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-7">
          El bloque tal como lo verá el contratista. Si escaneas: no hay que
          disparar, captura sola cuando la ve bien.
        </p>

        {/* El bloque tal como lo verá el contratista en su perfil. */}
        <CapturaFirma
          nombre="NOMBRE DE PRUEBA"
          cedula="1234567890"
          firmaActual={null}
          onGuardada={setResultado}
          soloDemo
          compacto
        />

        <button
          onClick={() => { setResultado(null); setAbierto(true) }}
          className="w-full text-xs text-gray-400 hover:text-gray-600 mt-4 py-1"
        >
          Abrir solo el escáner
        </button>

        {resultado && (
          <div className="mt-8">
            <p className="text-xs text-gray-400 mb-2">Resultado, sobre blanco:</p>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-center min-h-[120px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultado} alt="Firma escaneada" className="max-h-24 object-contain" />
            </div>

            <p className="text-xs text-gray-400 mt-5 mb-2">
              Y sobre un fondo oscuro, para ver si quedó fondo pegado:
            </p>
            <div className="bg-slate-800 rounded-2xl p-5 flex items-center justify-center min-h-[120px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultado} alt="Firma escaneada sobre oscuro" className="max-h-24 object-contain" />
            </div>
            <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
              Si sobre el fondo oscuro se ve un rectángulo claro alrededor del
              trazo, el recorte del fondo falló y hay que ajustar los umbrales.
            </p>
          </div>
        )}
      </div>

      <EscanerFirma
        abierto={abierto}
        nombre="NOMBRE DE PRUEBA"
        cedula="1234567890"
        onCancelar={() => setAbierto(false)}
        onSubirArchivo={() => setAbierto(false)}
        onConfirmar={(blob) => {
          setResultado(URL.createObjectURL(blob))
          setAbierto(false)
        }}
      />
    </div>
  )
}
