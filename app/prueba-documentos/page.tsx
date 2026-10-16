'use client'
// TEMPORAL — prueba del apartado de documentos (variante A elegida). NO se mezcla a main.
import { useEffect, useState } from 'react'
import PanelDocumentos, { type Documento } from '@/components/ui/PanelDocumentos'
import { AYUDA_DOCUMENTO } from '@/lib/ayudas-documentos'
import { Iconos } from '@/lib/iconos'

type Escenario = 'vacio' | 'parcial' | 'completo' | 'error'
const ESCENARIOS: { clave: Escenario; texto: string }[] = [
  { clave: 'vacio', texto: 'Vacío' },
  { clave: 'parcial', texto: 'Parcial' },
  { clave: 'completo', texto: 'Completo' },
  { clave: 'error', texto: 'Intentó enviar sin todo' },
]

function Demo({ escenario, conFactura }: { escenario: Escenario; conFactura: boolean }) {
  const inicial = {
    vacio: { f: false, p: false, s: false, n: '' },
    parcial: { f: true, p: true, s: false, n: '' },
    completo: { f: true, p: true, s: true, n: '6016087440' },
    error: { f: true, p: true, s: false, n: '' },
  }[escenario]
  const [f, setF] = useState(inicial.f)
  const [p, setP] = useState(inicial.p)
  const [s, setS] = useState(inicial.s)
  const [n, setN] = useState(inicial.n)
  useEffect(() => { setF(inicial.f); setP(inicial.p); setS(inicial.s); setN(inicial.n) }, [escenario]) // eslint-disable-line react-hooks/exhaustive-deps
  const intento = escenario === 'error'

  const doc = (icono: Documento['icono'], etiqueta: string, ayuda: string, cargado: boolean, set: (v: boolean) => void): Documento => ({
    icono, etiqueta, ayuda,
    estado: cargado ? 'cargado' : intento ? 'error' : 'vacio',
    urlVer: cargado ? '#' : null,
    onSubir: () => set(true),
    onQuitar: () => set(false),
  })

  return (
    <div className="rounded-2xl border bg-white p-5">
      <h3 className="mb-1 font-medium text-gray-900">¿Listo para enviar?</h3>
      <p className="mb-3 text-sm text-gray-500">Adjunta tus documentos de seguridad social.</p>
      <div className="mb-4">
        <PanelDocumentos
          factura={conFactura ? doc(Iconos.documentos.cuentaCobro, 'Factura electrónica', AYUDA_DOCUMENTO.factura, f, setF) : null}
          planilla={doc(Iconos.documentos.planilla, 'Planilla', AYUDA_DOCUMENTO.planilla, p, setP)}
          soporte={doc(Iconos.documentos.soportePago, 'Soporte de pago', AYUDA_DOCUMENTO.soportePago, s, setS)}
          numero={{
            etiqueta: 'N.° de planilla', ayuda: AYUDA_DOCUMENTO.numeroPlanilla, valor: n, onCambio: setN,
            error: intento && !n.trim() ? 'Ingresa el número de planilla' : null,
          }}
        />
      </div>
      <div className="flex justify-end border-t border-gray-100 pt-3">
        <span className="rounded-xl bg-[#192031] px-5 py-2.5 text-sm font-medium text-white">Enviar a revisión</span>
      </div>
    </div>
  )
}

export default function Prueba() {
  const [escenario, setEscenario] = useState<Escenario>('completo')
  const [conFactura, setConFactura] = useState(false)
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-1 text-lg font-semibold text-gray-900">Apartado de documentos — variante A</h1>
      <p className="mb-4 text-sm text-gray-500">Para revisar que el letrero (al pasar el cursor) y el menú de los tres puntitos no choquen: abre un menú con el cursor sobre la ficha, pasa por encima de sus opciones y por las otras fichas.</p>
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 shadow-sm">
        {ESCENARIOS.map((e) => (
          <button key={e.clave} onClick={() => setEscenario(e.clave)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${escenario === e.clave ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>{e.texto}</button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs font-medium text-gray-700">
          <input type="checkbox" checked={conFactura} onChange={(e) => setConFactura(e.target.checked)} /> Con factura electrónica
        </label>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-1" style={{ minWidth: 340 }}>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Escritorio</p>
          <Demo escenario={escenario} conFactura={conFactura} />
        </div>
        <div style={{ width: 340 }}>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Teléfono</p>
          <Demo escenario={escenario} conFactura={conFactura} />
        </div>
      </div>
    </div>
  )
}
