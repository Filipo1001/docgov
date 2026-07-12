/**
 * Página pública de verificación de documentos — /verificar/{codigo}
 *
 * Sin autenticación: cualquiera que reciba un documento (impreso o PDF) puede
 * escanear su QR y comprobar contra el sistema los datos canónicos del acta.
 * Una firma robada y pegada en un documento falso pierde valor: los datos
 * mostrados aquí no coincidirán con el papel adulterado.
 *
 * Privacidad: solo se muestran datos NO sensibles (sin cuenta bancaria,
 * cédula completa, dirección ni email). El acceso es por código exacto vía
 * service-role, sin posibilidad de enumerar la tabla.
 */

import { getVerificacion, TIPO_LABEL, type TipoDocumento } from '@/lib/verificacion'

export const dynamic = 'force-dynamic'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'En elaboración',
  enviado: 'Enviado a revisión',
  revision: 'En revisión',
  aprobado: 'Aprobado',
  radicado: 'Radicado',
  rechazado: 'Devuelto',
}

function Fila({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ color: '#64748b', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#0f172a', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default async function VerificarPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const resultado = await getVerificacion(codigo)

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Marca */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, background: '#0f172a', borderRadius: 12, marginBottom: 8 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>CD</span>
          </div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Contratista Digital</h1>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Verificación de documentos</p>
        </div>

        {resultado ? (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {/* Banda de autenticidad */}
            <div style={{ background: '#059669', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16 }}>✓</div>
              <div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>Documento auténtico</p>
                <p style={{ color: '#d1fae5', fontSize: 11, margin: 0 }}>Emitido por el sistema Contratista Digital</p>
              </div>
            </div>

            <div style={{ padding: '8px 20px 20px' }}>
              <div style={{ padding: '12px 0 4px' }}>
                <span style={{ display: 'inline-block', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8 }}>
                  {TIPO_LABEL[resultado.datos.tipo as TipoDocumento] ?? resultado.datos.tipo}
                </span>
              </div>

              <Fila label="Contrato" value={`N.° ${resultado.datos.contratoNumero}-${resultado.datos.contratoAnio}`} />
              <Fila label="Contratista" value={resultado.datos.contratistaNombre} />
              <Fila label="Documento" value={resultado.datos.cedulaMasked} />
              <Fila label="Dependencia" value={resultado.datos.dependencia} />
              <Fila label="Periodo" value={`${resultado.datos.mes} ${resultado.datos.anio}`} />
              <Fila label="Valor" value={COP.format(resultado.datos.valor)} />
              <Fila label="Estado" value={ESTADO_LABEL[resultado.datos.estado] ?? resultado.datos.estado} />
              <Fila label="Supervisor" value={resultado.datos.supervisorNombre} />
              <Fila label="Código" value={resultado.codigo} />
              <Fila
                label="Emitido"
                value={new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(resultado.emitidoEn))}
              />

              <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, marginTop: 16, marginBottom: 0 }}>
                Compare estos datos con el documento físico o PDF que recibió. Si algún dato no coincide,
                el documento podría haber sido alterado.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#dc2626', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16 }}>!</div>
              <div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>Código no encontrado</p>
                <p style={{ color: '#fecaca', fontSize: 11, margin: 0 }}>No existe un documento con este código</p>
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, margin: 0 }}>
                El código <strong>{codigo}</strong> no corresponde a ningún documento emitido por el sistema.
                Verifique que lo haya escrito o escaneado correctamente. Si el problema persiste, el documento
                que tiene en su poder podría no ser auténtico.
              </p>
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: '#cbd5e1', marginTop: 20 }}>
          Contratista Digital — Alcaldía Municipal de Fredonia, Antioquia
        </p>
      </div>
    </div>
  )
}
