/**
 * PANTALLA DE COMPARACIÓN — desechable, se borra al elegir variante.
 *
 * Fuera de /dashboard y SIN sesión a propósito: lo que se elige aquí es cómo
 * se ve, y pedir un login de admin en un dominio de preview donde nadie tiene
 * sesión convertía la decisión en un trámite.
 *
 * Los datos van escritos a mano, pero son los reales, medidos contra
 * producción: el contrato 191 tiene un único adjunto de 76 páginas y 6,1 MB,
 * y 114 de los 156 contratos no tienen ninguno. No lee la base de datos, así
 * que no expone nada de nadie.
 */

import { VarianteA, VarianteB } from './Variantes'
import type { DocumentoContratoDTO } from '@/lib/documentos-contrato'

export const dynamic = 'force-static'

const CON_EXPEDIENTE: DocumentoContratoDTO[] = [{
  id: 'ejemplo',
  nombre_original: 'CONTRATO 191.pdf',
  bytes: 6_396_313,
  paginas: 76,
  tipo_documento: 'otro',
  created_at: '2026-09-14T14:03:00.000Z',
  subido_por_nombre: 'Contratación',
}]

function Col({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">{titulo}</p>
      <p className="text-xs text-gray-500 mb-3">{nota}</p>
      {children}
    </div>
  )
}

export default function ComparacionExpediente() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-xl font-bold text-gray-900">Expediente documental — dos propuestas</h1>
        <p className="text-sm text-gray-500 mt-1.5 max-w-2xl leading-relaxed">
          Arriba, un contrato con su expediente escaneado tal como se sube hoy: un
          solo archivo de 76 páginas y 6,1 MB. Abajo, sin nada adjunto — el caso de
          <strong> 114 de los 156 contratos</strong>.
        </p>
        <p className="text-xs text-gray-400 mt-2 mb-8">
          Los botones no suben nada: aquí solo se elige cómo se ve.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Col titulo="A · Sin categorías" nota="El archivo manda. Sin casillas ni contador.">
            <VarianteA docs={CON_EXPEDIENTE} />
          </Col>
          <Col titulo="B · Una casilla, la que sí existe" nota="El contrato, con su papel en el trámite.">
            <VarianteB docs={CON_EXPEDIENTE} mesPrimeraCuenta="Septiembre" />
          </Col>

          <Col titulo="A · sin expediente" nota="Lo que se ve 114 de 156 veces.">
            <VarianteA docs={[]} />
          </Col>
          <Col titulo="B · sin expediente" nota="Lo que se ve 114 de 156 veces.">
            <VarianteB docs={[]} mesPrimeraCuenta="Septiembre" />
          </Col>
        </div>

        <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
            Lo que desaparece en las dos
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Las seis casillas fijas —Contrato firmado, CDP, RP, RUT, Certificación
            bancaria, Póliza— y el contador «0 de 6». De los 42 documentos adjuntos
            que hay en el municipio, <strong>ninguno</strong> se subió en una de
            ellas: los 42 están en «Documentos adicionales», y ningún contrato tiene
            más de uno.
          </p>
        </div>
      </div>
    </div>
  )
}
