/**
 * Verificación visual temporal del Expediente documental rediseñado.
 * No requiere sesión: monta el componente real con datos de ejemplo.
 * Se borra antes de terminar esta revisión.
 */
import ExpedienteContrato from '../dashboard/contratos/[id]/ExpedienteContrato'
import type { DocumentoContratoDTO } from '@/lib/documentos-contrato'

export const dynamic = 'force-static'

const mock = (tipo: DocumentoContratoDTO['tipo_documento'], nombre: string, id: string): DocumentoContratoDTO => ({
  id, nombre_original: nombre, bytes: 240_000, paginas: 2, tipo_documento: tipo,
  created_at: new Date().toISOString(), subido_por_nombre: 'Prueba', urlFirmada: '#',
})

const parcial: DocumentoContratoDTO[] = [
  mock('contrato_firmado', 'Contrato_023-2026_firmado.pdf', '1'),
  mock('cdp', 'CDP_1245.pdf', '2'),
  mock('rut', 'RUT_felipe.pdf', '3'),
  mock('otro', 'Otrosi_1_ampliacion_plazo.pdf', '4'),
  mock('otro', 'Concepto_juridico_secretaria.pdf', '5'),
]

export default function Verificacion() {
  return (
    <div className="max-w-2xl mx-auto p-8 space-y-10 bg-gray-50 min-h-screen">
      <div>
        <p className="text-xs font-bold text-gray-400 mb-2">VACÍO — editable</p>
        <ExpedienteContrato contratoId="mock" initial={[]} editable={true} />
      </div>
      <div>
        <p className="text-xs font-bold text-gray-400 mb-2">PARCIAL — editable (con adicionales)</p>
        <ExpedienteContrato contratoId="mock" initial={parcial} editable={true} />
      </div>
      <div>
        <p className="text-xs font-bold text-gray-400 mb-2">PARCIAL — solo lectura</p>
        <ExpedienteContrato contratoId="mock" initial={parcial} editable={false} />
      </div>
    </div>
  )
}
