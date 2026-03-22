import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { PDFData, PDFObligacion } from './types'

// ─── Date utilities ───────────────────────────────────────────

const MESES_MAYUS = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]
const MESES_MINUS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function fechaContratoInicio(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d} de ${MESES_MAYUS[parseInt(m) - 1]} de ${y}`
}

function periodoRangoMinusc(inicio: string, fin: string): string {
  const [yi, mi, di] = inicio.split('-')
  const [, , df] = fin.split('-')
  return `Del ${di} al ${df} de ${MESES_MINUS[parseInt(mi) - 1]} del ${yi}`
}

function fechaFirmaMinusc(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d} de ${MESES_MINUS[parseInt(m) - 1]} de ${y}`
}

// ─── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: '#000',
    paddingTop: 40,
    paddingBottom: 52,
    paddingHorizontal: 48,
  },

  // ── Report title (bordered box)
  reportTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    padding: '8 10',
    marginBottom: 0,
    letterSpacing: 0.4,
  },

  // ── Header info table
  infoTable: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    minHeight: 18,
  },
  infoRowLast: {
    flexDirection: 'row',
    minHeight: 18,
  },
  infoLabel: {
    width: '36%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '4 7',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    backgroundColor: '#f3f3f3',
  },
  infoValue: {
    flex: 1,
    padding: '4 7',
    fontSize: 9.5,
    lineHeight: 1.4,
  },
  infoSectionHeader: {
    width: '100%',
    backgroundColor: '#d9d9d9',
    padding: '5 7',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },

  // ── Activities heading (italic only — no bold+italic, react-pdf has no such built-in font)
  activitiesHeading: {
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 2,
  },

  // ── Main 3-column activities table
  mainTable: {
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    marginBottom: 14,
  },
  mainHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#d0d0d0',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  mainRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  mainRowLast: {
    flexDirection: 'row',
  },
  col1: {
    width: '34%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '6 7',
  },
  col2: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '6 7',
  },
  col3: {
    width: '13%',
    padding: '6 4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colHeaderText: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 1.4,
  },
  oblIndex: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#555',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  oblText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.5,
  },
  // Each activity item inside col2
  actItem: {
    marginBottom: 5,
    paddingBottom: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    borderBottomStyle: 'solid',
  },
  actItemLast: {
    marginBottom: 0,
  },
  actNumber: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#444',
    marginBottom: 1,
  },
  actText: {
    fontSize: 9,
    lineHeight: 1.5,
    color: '#111',
  },
  actCantidad: {
    fontSize: 7.5,
    color: '#666',
    marginTop: 2,
    fontStyle: 'italic',
  },
  countText: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  permanenteText: {
    fontSize: 8.5,
    fontStyle: 'italic',
    color: '#666',
    textAlign: 'center',
  },

  // ── Registro Fotográfico section
  fotoSectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    padding: '7 10',
    marginBottom: 12,
  },
  fotoOblBlock: {
    marginBottom: 14,
  },
  fotoOblHeader: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#e8e8e8',
    padding: '5 8',
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#333',
    borderLeftStyle: 'solid',
  },
  fotoActBlock: {
    marginBottom: 12,
    paddingLeft: 10,
  },
  fotoActLabel: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#333',
    marginBottom: 6,
    lineHeight: 1.4,
  },
  // Two-photo row
  photoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  photoItem: {
    flex: 1,
    marginRight: 8,
  },
  photoItemLast: {
    flex: 1,
    marginRight: 0,
  },
  photo: {
    width: '100%',
    height: 165,
    objectFit: 'cover',
    borderWidth: 0.5,
    borderColor: '#bbb',
    borderStyle: 'solid',
  },
  photoCaption: {
    fontSize: 7.5,
    color: '#777',
    textAlign: 'center',
    marginTop: 3,
    fontStyle: 'italic',
  },

  // ── Closing & signatures
  closingText: {
    fontSize: 9.5,
    lineHeight: 1.7,
    marginBottom: 28,
    marginTop: 4,
  },
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sigBlock: {
    width: '47%',
  },
  sigLine: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    marginBottom: 5,
    width: '85%',
  },
  sigName: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  sigRole: {
    fontSize: 9,
    lineHeight: 1.4,
    marginBottom: 1,
  },
  sigCedula: {
    fontSize: 9,
    marginBottom: 1,
  },
  sigTel: {
    fontSize: 9,
  },
  receiptLabel: {
    fontSize: 9,
    lineHeight: 1.5,
    marginBottom: 14,
    color: '#333',
  },

  // ── Fixed footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderTopColor: '#aaa',
    borderTopStyle: 'solid',
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7.5,
    color: '#888',
  },
})

// ─── Helpers ─────────────────────────────────────────────────

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? s.infoRowLast : s.infoRow}>
      <View style={s.infoLabel}><Text>{label}</Text></View>
      <View style={s.infoValue}><Text>{value}</Text></View>
    </View>
  )
}

function SectionHeader({ children }: { children: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoSectionHeader}>{children}</Text>
    </View>
  )
}

// ─── Text table row (no photos) ───────────────────────────────

function ObligacionRow({ obl, index, total }: { obl: PDFObligacion; index: number; total: number }) {
  const isLast = index === total - 1
  const actCount = obl.actividades.reduce((sum, a) => sum + a.cantidad, 0)

  return (
    <View style={isLast ? s.mainRowLast : s.mainRow} wrap={false}>

      {/* Col 1 — Obligation */}
      <View style={s.col1}>
        <Text style={s.oblIndex}>Obligación {index + 1}</Text>
        <Text style={s.oblText}>{obl.descripcion}</Text>
      </View>

      {/* Col 2 — Activity descriptions */}
      <View style={s.col2}>
        {obl.es_permanente ? (
          <Text style={s.actText}>Permanente</Text>
        ) : obl.actividades.length === 0 ? (
          <Text style={{ ...s.actText, fontStyle: 'italic', color: '#999' }}>
            Sin actividades registradas en este periodo.
          </Text>
        ) : (
          obl.actividades.map((act, i) => {
            const isLastAct = i === obl.actividades.length - 1
            return (
              <View key={i} style={isLastAct ? s.actItemLast : s.actItem}>
                <Text style={s.actNumber}>Actividad {i + 1}:</Text>
                <Text style={s.actText}>{act.descripcion}</Text>
                {act.cantidad > 1 && (
                  <Text style={s.actCantidad}>Cantidad: {act.cantidad}</Text>
                )}
              </View>
            )
          })
        )}
      </View>

      {/* Col 3 — Count */}
      <View style={s.col3}>
        {obl.es_permanente ? (
          <Text style={s.permanenteText}>Perm.</Text>
        ) : (
          <Text style={s.countText}>{actCount > 0 ? actCount : '—'}</Text>
        )}
      </View>
    </View>
  )
}

// ─── Photographic evidence section ───────────────────────────

function RegistroFotografico({ obligaciones }: { obligaciones: PDFObligacion[] }) {
  return (
    <>
      <Text style={s.fotoSectionTitle}>REGISTRO FOTOGRÁFICO DE ACTIVIDADES</Text>

      {obligaciones.map((obl, oi) => {
        const actsConFotos = obl.actividades.filter(a => a.evidencias.length > 0)
        if (actsConFotos.length === 0) return null

        return (
          <View key={oi} style={s.fotoOblBlock}>
            <Text style={s.fotoOblHeader}>
              Obligación {oi + 1}: {obl.descripcion}
            </Text>

            {actsConFotos.map((act, ai) => {
              const actIndex = obl.actividades.indexOf(act)
              // Group photos into pairs for 2-per-row grid
              const pairs: Array<typeof act.evidencias> = []
              for (let i = 0; i < act.evidencias.length; i += 2) {
                pairs.push(act.evidencias.slice(i, i + 2))
              }

              return (
                <View key={ai} style={s.fotoActBlock}>
                  <Text style={s.fotoActLabel}>
                    Actividad {actIndex + 1}: {act.descripcion}
                  </Text>

                  {pairs.map((pair, pi) => (
                    <View key={pi} style={s.photoRow} wrap={false}>
                      {pair.map((ev, ei) => (
                        <View key={ei} style={ei === pair.length - 1 ? s.photoItemLast : s.photoItem}>
                          <Image
                            src={ev.url}
                            style={s.photo}
                          />
                          <Text style={s.photoCaption}>
                            Foto {pi * 2 + ei + 1} — {ev.nombre_archivo}
                          </Text>
                        </View>
                      ))}
                      {/* Filler to keep grid aligned when pair has only 1 photo */}
                      {pair.length === 1 && <View style={{ flex: 1 }} />}
                    </View>
                  ))}
                </View>
              )
            })}
          </View>
        )
      })}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────

export function InformeActividadesPDF({ data }: { data: PDFData }) {
  const { municipio, contrato, periodo, obligaciones } = data

  const hasEvidencias = obligaciones.some(o =>
    o.actividades.some(a => a.evidencias.length > 0)
  )

  return (
    <Document
      title={`Informe de Actividades — Contrato ${contrato.numero}-${contrato.anio} — Periodo ${periodo.numero}`}
      author={contrato.contratista.nombre_completo}
      subject="Reporte de Actividades del Contratista"
      creator="DocGov"
    >
      <Page size="A4" style={s.page}>

        {/* ── Title ────────────────────────────────── */}
        <Text style={s.reportTitle}>REPORTE DE ACTIVIDADES DEL CONTRATISTA</Text>

        {/* ── Header info table ─────────────────────── */}
        <View style={s.infoTable}>
          <InfoRow label="Modalidad de selección:" value={contrato.modalidad_seleccion} />
          <InfoRow
            label="Número y objeto del contrato:"
            value={`N.º ${contrato.numero}-${contrato.anio} del ${fechaContratoInicio(periodo.fecha_inicio)}. "${contrato.objeto}"`}
          />

          <SectionHeader>Contratante</SectionHeader>
          <InfoRow label="Alcaldía Municipal:" value={municipio.nombre} />
          {municipio.representante_legal
            ? <InfoRow label="Representante legal:" value={municipio.representante_legal} />
            : null}
          {municipio.cedula_representante
            ? <InfoRow label="Cédula de Ciudadanía:" value={municipio.cedula_representante} />
            : null}
          {municipio.nit
            ? <InfoRow label="NIT:" value={municipio.nit} />
            : null}

          <SectionHeader>Supervisor</SectionHeader>
          <InfoRow label="Supervisor:" value={contrato.supervisor.nombre_completo} />
          <InfoRow label="Cédula de Ciudadanía:" value={contrato.supervisor.cedula} />

          <SectionHeader>Contratista</SectionHeader>
          <InfoRow label="Si es persona natural:" value="" />
          <InfoRow label="Nombre:" value={contrato.contratista.nombre_completo} />
          <InfoRow label="Cédula de ciudadanía:" value={contrato.contratista.cedula} />
          <InfoRow
            label="Periodo para reportar la actividad:"
            value={periodoRangoMinusc(periodo.fecha_inicio, periodo.fecha_fin)}
            last
          />
        </View>

        {/* ── Section heading ──────────────────────── */}
        <Text style={s.activitiesHeading}>
          Descripción del desarrollo de actividades durante el mes para cumplimiento del objeto contractual
        </Text>

        {/* ── Text summary table (no photos) ───────── */}
        <View style={s.mainTable}>
          {/* Header row */}
          <View style={s.mainHeaderRow}>
            <View style={s.col1}>
              <Text style={s.colHeaderText}>OBLIGACIONES{'\n'}ESPECIFICAS</Text>
            </View>
            <View style={s.col2}>
              <Text style={s.colHeaderText}>
                DESCRIPCIÓN DE LA ACTIVIDAD{'\n'}
                {'(descripción detallada de las actividades y logros realizados\n'}
                {'durante el periodo de ejecución)'}
              </Text>
            </View>
            <View style={s.col3}>
              <Text style={s.colHeaderText}>N.º DE{'\n'}ACCION.</Text>
            </View>
          </View>

          {obligaciones.map((obl, i) => (
            <ObligacionRow key={i} obl={obl} index={i} total={obligaciones.length} />
          ))}
        </View>

        {/* ── Photographic evidence (only if any photos exist) ── */}
        {hasEvidencias && (
          <>
            {/* Force photos to start on a new page */}
            <View break />
            <RegistroFotografico obligaciones={obligaciones} />
          </>
        )}

        {/* ── Closing paragraph ─────────────────────── */}
        <Text style={s.closingText}>
          En constancia de lo anterior se firma el {fechaFirmaMinusc(periodo.fecha_fin)}.
        </Text>

        {/* ── Signatures ───────────────────────────── */}
        <View style={s.sigRow} wrap={false}>

          {/* Contratista */}
          <View style={s.sigBlock}>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{contrato.contratista.nombre_completo}</Text>
            {contrato.contratista.cargo
              ? <Text style={s.sigRole}>CONTRATISTA — {contrato.contratista.cargo.toUpperCase()}</Text>
              : <Text style={s.sigRole}>CONTRATISTA</Text>}
            <Text style={s.sigCedula}>C.C. No. {contrato.contratista.cedula}</Text>
            {contrato.contratista.telefono && (
              <Text style={s.sigTel}>Cel. {contrato.contratista.telefono}</Text>
            )}
          </View>

          {/* Supervisor receipt block */}
          <View style={s.sigBlock}>
            <Text style={s.receiptLabel}>
              Constancia de recibido del informe: La Alcaldía Municipal de {municipio.nombre}
              recibió el presente informe presentado por el contratista{' '}
              {contrato.contratista.nombre_completo}, en constancia:
            </Text>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{contrato.supervisor.nombre_completo}</Text>
            {contrato.supervisor.cargo && (
              <Text style={s.sigRole}>{contrato.supervisor.cargo}.</Text>
            )}
            <Text style={s.sigRole}>Supervisor — Contrato N.º {contrato.numero}-{contrato.anio}</Text>
            <Text style={s.sigCedula}>C.C. No. {contrato.supervisor.cedula}</Text>
          </View>
        </View>

        {/* ── Footer (fixed on every page) ─────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>DocGov · Alcaldía de {municipio.nombre}</Text>
          <Text style={s.footerText}>Generado el {data.fechaGeneracion}</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  )
}
