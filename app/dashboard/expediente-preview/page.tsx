/**
 * PANTALLA DE COMPARACIÓN — se borra al elegir variante.
 *
 * Las dos propuestas del expediente documental, con los datos reales de dos
 * contratos: el 191, que tiene su expediente escaneado (76 páginas, 6,1 MB),
 * y el 102, que no tiene nada — que es el caso de 114 de los 156 contratos.
 */

import { requireRole } from '@/lib/auth'
import { listarDocumentosContrato } from '@/app/actions/documentos-contrato'
import { VarianteA, VarianteB } from './Variantes'

const CON_EXPEDIENTE = 'c39eb0d5-1f1f-47e5-9a75-628cfaf79d27'   // contrato 191
const SIN_EXPEDIENTE = '580fd627-6d95-4201-8ae6-cbeb89be0414'   // contrato 102

export const dynamic = 'force-dynamic'

export default async function ComparacionExpediente() {
  await requireRole(['admin'])
  const [conDocs, sinDocs] = await Promise.all([
    listarDocumentosContrato(CON_EXPEDIENTE),
    listarDocumentosContrato(SIN_EXPEDIENTE),
  ])

  const Col = ({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) => (
    <div>
      <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">{titulo}</p>
      <p className="text-xs text-gray-500 mb-3">{nota}</p>
      {children}
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900">Expediente documental — dos propuestas</h1>
      <p className="text-sm text-gray-500 mt-1 mb-2">
        Datos reales. Arriba, el contrato <strong>191</strong> con su expediente escaneado
        (76 páginas, 6,1 MB). Abajo, el <strong>102</strong> sin nada adjunto, que es el caso
        de 114 de los 156 contratos.
      </p>
      <p className="text-xs text-gray-400 mb-8">
        Los botones no suben nada: aquí solo se elige cómo se ve.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Col titulo="A · Sin categorías" nota="El archivo manda. Sin casillas ni contador.">
          <VarianteA docs={conDocs} />
        </Col>
        <Col titulo="B · Una casilla, la que sí existe" nota="El contrato, con su papel en el trámite.">
          <VarianteB docs={conDocs} mesPrimeraCuenta="Septiembre" />
        </Col>

        <Col titulo="A · sin expediente" nota="Cómo se ve cuando no hay nada.">
          <VarianteA docs={sinDocs} />
        </Col>
        <Col titulo="B · sin expediente" nota="Cómo se ve cuando no hay nada.">
          <VarianteB docs={sinDocs} mesPrimeraCuenta="Septiembre" />
        </Col>
      </div>

      <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Lo que desaparece en las dos</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          Las seis casillas fijas —Contrato firmado, CDP, RP, RUT, Certificación bancaria,
          Póliza— y el contador «0 de 6». De los 42 documentos adjuntos que hay en el
          municipio, <strong>ninguno</strong> se subió en una de ellas: los 42 están en
          «Documentos adicionales».
        </p>
      </div>
    </div>
  )
}
