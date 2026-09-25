'use client'

/**
 * PÁGINA TEMPORAL — se borra antes de llevar esto a main.
 *
 * El escáner solo se puede juzgar con un teléfono, una hoja y la luz de una
 * oficina de verdad, y la pantalla donde vive está detrás del inicio de
 * sesión. Aquí no se guarda nada.
 *
 * Enseña el resultado en los tres sitios que importan: sobre blanco, sobre
 * oscuro —para ver si quedó fondo pegado— y dentro del hueco de 150 × 50 del
 * acta, que es donde de verdad acaba.
 */

import { useState } from 'react'
import EscanerFirma from '@/components/firma/EscanerFirma'

export default function ProbarFirma() {
  const [abierto, setAbierto] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [medidas, setMedidas] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-gray-50 px-5 py-10">
      <div className="max-w-sm mx-auto">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">
          Prueba · no guarda nada
        </p>
        <h1 className="text-2xl font-semibold text-[#192031] mb-3">Escáner de firma</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-7">
          Arrastra las esquinas del recuadro para ajustarlo a tu firma. El
          tamaño que dejes se recuerda para la próxima vez.
        </p>

        <button
          onClick={() => { setResultado(null); setMedidas(null); setAbierto(true) }}
          className="w-full bg-[#192031] hover:bg-[#242F45] text-white font-semibold py-3.5 rounded-2xl transition-colors"
        >
          Escanear mi firma
        </button>

        {resultado && (
          <div className="mt-8">
            <p className="text-xs text-gray-400 mb-2">
              Resultado, sobre blanco
              {medidas && <span className="text-gray-300"> · {medidas}</span>}
            </p>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-center min-h-[120px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultado} alt="Firma escaneada" className="max-h-24 object-contain" />
            </div>

            <p className="text-xs text-gray-400 mt-5 mb-2">
              Sobre fondo oscuro — si se ve un rectángulo claro alrededor del
              trazo, el recorte del fondo falló:
            </p>
            <div className="bg-slate-800 rounded-2xl p-5 flex items-center justify-center min-h-[120px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultado} alt="Firma sobre oscuro" className="max-h-24 object-contain" />
            </div>

            <p className="text-xs text-gray-400 mt-5 mb-2">
              Y en el hueco del acta, 150 × 50, que es donde acaba:
            </p>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col items-center">
              <div className="w-[150px] h-[50px] flex items-end justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resultado} alt="Firma en el acta" className="max-w-full max-h-full object-contain" />
              </div>
              <div className="w-[150px] border-t border-gray-800 mt-1 pt-1 text-center">
                <p className="text-[8px] font-semibold text-gray-900 uppercase">Nombre de prueba</p>
                <p className="text-[7px] text-gray-500">Contratista</p>
              </div>
            </div>
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
          const url = URL.createObjectURL(blob)
          const img = new Image()
          img.onload = () => setMedidas(`${img.naturalWidth} × ${img.naturalHeight} px`)
          img.src = url
          setResultado(url)
          setAbierto(false)
        }}
      />
    </div>
  )
}
