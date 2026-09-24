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

/** Firma de ejemplo, para poder ver el estado «ya registrada» sin escanear.
 *  Se va con esta página. */
const FIRMA_EJEMPLO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80">
       <path d="M14 58 C22 20 38 6 50 16 C62 26 46 54 36 62 C26 70 40 72 56 62
                C72 52 80 22 96 30 C112 38 100 60 116 58 C132 56 140 18 158 28
                C176 38 164 58 182 56 C200 54 206 20 226 32 C240 40 250 56 268 44"
             stroke="#1b2330" stroke-width="5" fill="none"
             stroke-linecap="round" stroke-linejoin="round"/>
       <path d="M96 66 C140 58 200 56 252 62" stroke="#1b2330" stroke-width="3"
             fill="none" stroke-linecap="round" opacity=".8"/>
     </svg>`,
  )

export default function ProbarFirma() {
  const [abierto, setAbierto] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-gray-50 px-5 py-10">
      <div className="max-w-sm mx-auto">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">
          Prueba · no guarda nada
        </p>
        <h1 className="text-2xl font-semibold text-[#192031] mb-3">Firma del contratista</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-7">
          El bloque tal como sale en el perfil. Escanea una y verás también
          cómo queda cuando ya hay firma registrada.
        </p>

        {/* El bloque tal como lo verá el contratista en su perfil. Pasa solo
            del estado «sin firma» al de «ya tiene firma» en cuanto se escanea
            una, que es el recorrido real. */}
        <CapturaFirma
          nombre="FELIPE RESTREPO CEBALLOS"
          cedula="1001456659"
          firmaActual={resultado}
          onGuardada={setResultado}
          soloDemo
        />

        <div className="flex items-center justify-center gap-5 mt-4">
          {resultado && (
            <button
              onClick={() => setResultado(null)}
              className="text-xs text-gray-400 hover:text-gray-600 py-1"
            >
              Volver al estado vacío
            </button>
          )}
          <button
            onClick={() => { setResultado(null); setAbierto(true) }}
            className="text-xs text-gray-400 hover:text-gray-600 py-1"
          >
            Abrir solo el escáner
          </button>
          {!resultado && (
            <button
              onClick={() => setResultado(FIRMA_EJEMPLO)}
              className="text-xs text-gray-400 hover:text-gray-600 py-1"
            >
              Ver con firma de ejemplo
            </button>
          )}
        </div>

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
