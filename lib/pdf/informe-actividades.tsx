/**
 * Informe de Actividades PDF
 *
 * Layout:
 * - Single 3-column table spanning all pages
 * - COL1: obligation text (shown only on first activity of each obligation)
 * - COL2: activity description + evidence photos stacked vertically
 * - COL3: total action count (shown only on first activity of each obligation)
 * - One table row per activity — clean page breaks
 * - Thick bottom border separates obligation groups
 * - Closing + signature block kept together (wrap={false})
 *
 * Signature rules:
 * - Contratista firma: shown when periodo.estado is enviado/revision/aprobado/radicado
 *   AND contrato.contratista.firma_url is set
 * - Supervisor firma: shown only when estado is aprobado/radicado
 *   AND contrato.supervisor.firma_url is set
 * - If firma_url is absent → blank space, never fails
 *
 * Footer: page number only (centered)
 */

import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { PDFData, PDFObligacion, PDFActividad } from './types'

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
  const [, mi, di] = inicio.split('-')
  const [yf, , df] = fin.split('-')
  return `Del ${di} al ${df} de ${MESES_MINUS[parseInt(mi) - 1]} del ${yf}`
}

function fechaFirmaMinusc(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d} de ${MESES_MINUS[parseInt(m) - 1]} de ${y}`
}

// Estados en los que el contratista ya firmó digitalmente (envío = acto de firma)
const ESTADOS_FIRMA_CONTRATISTA = new Set(['enviado', 'revision', 'aprobado', 'radicado'])
// Estados en los que la secretaria ya aprobó (firma del supervisor visible)
const ESTADOS_FIRMA_SUPERVISOR  = new Set(['aprobado', 'radicado'])

// ─── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: '#000',
    paddingTop: 36,
    paddingBottom: 52,
    paddingHorizontal: 44,
  },

  // ── Report title
  reportTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    padding: '7 10',
  },

  // ── Header info table (2-col: label | value)
  infoTable: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    minHeight: 17,
  },
  infoRowLast: {
    flexDirection: 'row',
    minHeight: 17,
  },
  infoLabel: {
    width: '38%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '3 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    backgroundColor: '#f0f0f0',
  },
  infoValue: {
    flex: 1,
    padding: '3 6',
    fontSize: 9.5,
    lineHeight: 1.4,
  },
  infoSectionHeader: {
    width: '100%',
    backgroundColor: '#d5d5d5',
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },

  // ── Activities sub-heading
  activitiesHeading: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 6,
    marginTop: 2,
  },

  // ── Main 3-column table
  mainTable: {
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
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
    borderBottomWidth: 0.5,
    borderBottomColor: '#aaa',
    borderBottomStyle: 'solid',
  },
  mainRowObligEnd: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  mainRowLast: {
    flexDirection: 'row',
  },

  col1: {
    width: '32%',
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
    justifyContent: 'flex-start',
  },
  colHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 1.4,
  },

  oblIndex: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#555',
    textTransform: 'uppercase',
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  oblText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.5,
  },
  actText: {
    fontSize: 9,
    lineHeight: 1.6,
    color: '#111',
    marginBottom: 6,
  },
  actTextPermanente: {
    fontSize: 9,
    lineHeight: 1.5,
    fontStyle: 'italic',
    color: '#444',
  },
  photo: {
    width: '100%',
    height: 190,
    objectFit: 'cover',
    marginBottom: 4,
  },
  countText: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 2,
  },
  permanenteText: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#666',
    textAlign: 'center',
  },

  // ── Closing row
  closingRow: {
    borderTopWidth: 1.5,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    padding: '12 10',
  },
  closingText: {
    fontSize: 10,
    lineHeight: 1.8,
  },

  // ── Signature section — stacked vertically inside the main table

  // Block 1: Contratista (full width)
  sigContratistaBlock: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    padding: '12 14 10 14',
  },

  // Block 2: Supervisor receipt (full width, thick top border)
  sigSupervisorBlock: {
    borderTopWidth: 1.5,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    padding: '10 14 12 14',
  },

  // Blank space when no firma image is available
  sigSpace: {
    height: 65,
  },

  // Contratista firma image
  firmaImgContratista: {
    width: '55%',
    height: 65,
    objectFit: 'contain',
    marginBottom: 0,
  },

  // Supervisor firma image — inline after "Firma:"
  firmaImgSupervisor: {
    height: 46,
    width: 130,
    objectFit: 'contain',
    marginLeft: 4,
  },

  // Underline below firma space / image
  sigUnderline: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    width: '55%',
    marginBottom: 5,
  },

  sigName: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sigDetail: {
    fontSize: 9.5,
    lineHeight: 1.5,
    marginBottom: 1,
  },
  sigLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  // Fixed-width label column — sized for the widest label ("Nombre:")
  sigTag: {
    fontSize: 9.5,
    width: 52,
  },

  // "Firma: ___" row in supervisor block
  sigFirmaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 20,   // breathing room between receipt text and firma line
  },
  sigFirmaLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    height: 14,
    marginLeft: 2,
  },

  sigNombreRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },

  receiptParagraph: {
    fontSize: 9.5,
    lineHeight: 1.65,
    marginBottom: 4,
    textAlign: 'justify',
  },
  receiptBold: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
  },

  // ── Footer — page number only, centered
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 44,
    right: 44,
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    borderTopStyle: 'solid',
    paddingTop: 4,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 7.5,
    color: '#888',
  },
})

// ─── Info table helpers ───────────────────────────────────────

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? s.infoRowLast : s.infoRow}>
      <View style={s.infoLabel}><Text>{label}</Text></View>
      <View style={s.infoValue}><Text>{value}</Text></View>
    </View>
  )
}

function InfoSectionHeader({ children }: { children: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoSectionHeader}>{children}</Text>
    </View>
  )
}

// ─── Activity row ─────────────────────────────────────────────

interface ActivityRowProps {
  obl: PDFObligacion
  oblIndex: number
  act: PDFActividad
  actIndex: number
  showOblInfo: boolean
  totalAcciones: number
  rowStyle: any
}

function ActivityRow({ obl, oblIndex, act, showOblInfo, totalAcciones, rowStyle }: ActivityRowProps) {
  return (
    <View style={rowStyle}>
      <View style={s.col1}>
        {showOblInfo && (
          <>
            <Text style={s.oblIndex}>Obligación {oblIndex + 1}</Text>
            <Text style={s.oblText}>{obl.descripcion}</Text>
          </>
        )}
      </View>
      <View style={s.col2}>
        <Text style={s.actText}>{act.descripcion}</Text>
        {act.evidencias.map((ev, ei) => (
          <View key={ei} wrap={false}>
            <Image src={ev.url} style={s.photo} />
          </View>
        ))}
      </View>
      <View style={s.col3}>
        {showOblInfo && <Text style={s.countText}>{totalAcciones}</Text>}
      </View>
    </View>
  )
}

// ─── Permanent obligation row ─────────────────────────────────

function PermanentRow({ obl, oblIndex, rowStyle }: { obl: PDFObligacion; oblIndex: number; rowStyle: any }) {
  return (
    <View style={rowStyle}>
      <View style={s.col1}>
        <Text style={s.oblIndex}>Obligación {oblIndex + 1}</Text>
        <Text style={s.oblText}>{obl.descripcion}</Text>
      </View>
      <View style={s.col2}>
        <Text style={s.actTextPermanente}>Permanente</Text>
      </View>
      <View style={s.col3}>
        <Text style={s.permanenteText}>Perm.</Text>
      </View>
    </View>
  )
}

// ─── Main component ───────────────────────────────────────────

export function InformeActividadesPDF({ data }: { data: PDFData }) {
  const { municipio, contrato, periodo, obligaciones } = data

  // Signature visibility based on workflow state
  const mostrarFirmaContratista =
    ESTADOS_FIRMA_CONTRATISTA.has(periodo.estado) &&
    !!contrato.contratista.firma_url

  const mostrarFirmaSupervisor =
    ESTADOS_FIRMA_SUPERVISOR.has(periodo.estado) &&
    !!contrato.supervisor.firma_url

  // Build flat row list
  type RowDef =
    | { type: 'activity'; obl: PDFObligacion; oblIndex: number; act: PDFActividad; actIndex: number; showOblInfo: boolean; totalAcciones: number; isObligEnd: boolean; isLast: boolean }
    | { type: 'permanent'; obl: PDFObligacion; oblIndex: number; isLast: boolean }

  const rows: RowDef[] = []

  obligaciones.forEach((obl, oi) => {
    const isLastObl = oi === obligaciones.length - 1

    if (obl.es_permanente || obl.actividades.length === 0) {
      rows.push({ type: 'permanent', obl, oblIndex: oi, isLast: isLastObl })
      return
    }

    const totalAcciones = obl.actividades.reduce((sum, a) => sum + a.cantidad, 0)
    obl.actividades.forEach((act, ai) => {
      const isLastAct = ai === obl.actividades.length - 1
      rows.push({
        type: 'activity',
        obl,
        oblIndex: oi,
        act,
        actIndex: ai,
        showOblInfo: ai === 0,
        totalAcciones,
        isObligEnd: isLastAct,
        isLast: isLastAct && isLastObl,
      })
    })
  })

  function rowStyle(row: RowDef): object {
    if (row.isLast) return s.mainRowLast
    if (row.type === 'permanent') return s.mainRowObligEnd
    if (row.type === 'activity' && row.isObligEnd) return s.mainRowObligEnd
    return s.mainRow
  }

  return (
    <Document
      title={`Informe de Actividades — Contrato ${contrato.numero}-${contrato.anio} — Periodo ${periodo.numero}`}
      author={contrato.contratista.nombre_completo}
      subject="Reporte de Actividades del Contratista"
      creator="DocGov"
    >
      <Page size="A4" style={s.page}>

        {/* ── Title ─────────────────────────────────────── */}
        <Text style={s.reportTitle}>REPORTE DE ACTIVIDADES DEL CONTRATISTA</Text>

        {/* ── Header info table ─────────────────────────── */}
        <View style={s.infoTable}>
          <InfoRow label="Modalidad de selección:" value={contrato.modalidad_seleccion} />
          <InfoRow
            label="Número y objeto del contrato:"
            value={`N.º ${contrato.numero}-${contrato.anio} del ${fechaContratoInicio(periodo.fecha_inicio)}. "${contrato.objeto}"`}
          />

          <InfoSectionHeader>Contratante</InfoSectionHeader>
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

          <InfoSectionHeader>Supervisor</InfoSectionHeader>
          <InfoRow label="Supervisor:" value={contrato.supervisor.nombre_completo} />
          <InfoRow label="Cédula de Ciudadanía:" value={contrato.supervisor.cedula} />

          <InfoSectionHeader>Contratista</InfoSectionHeader>
          <InfoRow label="Si es persona natural:" value="" />
          <InfoRow label="Nombre:" value={contrato.contratista.nombre_completo} />
          <InfoRow label="Cédula de ciudadanía:" value={contrato.contratista.cedula} />
          <InfoRow
            label="Periodo para reportar la actividad:"
            value={periodoRangoMinusc(periodo.fecha_inicio, periodo.fecha_fin)}
            last
          />
        </View>

        {/* ── Activities sub-heading ────────────────────── */}
        <Text style={s.activitiesHeading}>
          Descripción del desarrollo de actividades durante el mes para cumplimiento del objeto contractual
        </Text>

        {/* ── Main 3-column table ────────────────────────── */}
        <View style={s.mainTable}>

          {/* Table header */}
          <View style={s.mainHeaderRow}>
            <View style={s.col1}>
              <Text style={s.colHeaderText}>OBLIGACIONES{'\n'}ESPECIFICAS</Text>
            </View>
            <View style={s.col2}>
              <Text style={s.colHeaderText}>
                DESCRIPCIÓN DE LA ACTIVIDAD{'\n'}
                {'(descripción detallada de las actividades y logros realizados\n'}
                {'durante el periodo de ejecución de acuerdo con las obligaciones)'}
              </Text>
            </View>
            <View style={s.col3}>
              <Text style={s.colHeaderText}>NÚMERO{'\n'}DE{'\n'}ACCION.</Text>
            </View>
          </View>

          {/* Activity rows */}
          {rows.map((row, ri) =>
            row.type === 'permanent' ? (
              <PermanentRow key={ri} obl={row.obl} oblIndex={row.oblIndex} rowStyle={rowStyle(row)} />
            ) : (
              <ActivityRow
                key={ri}
                obl={row.obl}
                oblIndex={row.oblIndex}
                act={row.act}
                actIndex={row.actIndex}
                showOblInfo={row.showOblInfo}
                totalAcciones={row.totalAcciones}
                rowStyle={rowStyle(row)}
              />
            )
          )}

          {/* ── Closing + Signature — indivisible block ── */}
          <View wrap={false}>

            {/* "En constancia..." closing line */}
            <View style={s.closingRow}>
              <Text style={s.closingText}>
                En constancia de lo anterior se firma el {fechaFirmaMinusc(periodo.fecha_fin)}.
              </Text>
            </View>

            {/* ── Block 1: Contratista — full width ── */}
            <View style={s.sigContratistaBlock}>
              {/* Firma image or blank space */}
              {mostrarFirmaContratista ? (
                <Image src={contrato.contratista.firma_url!} style={s.firmaImgContratista} />
              ) : (
                <View style={s.sigSpace} />
              )}
              {/* Underline */}
              <View style={s.sigUnderline} />
              {/* Bold name */}
              <Text style={s.sigName}>{contrato.contratista.nombre_completo}</Text>
              {/* Role */}
              <Text style={s.sigDetail}>
                CONTRATISTA{contrato.contratista.cargo ? ` ${contrato.contratista.cargo.toUpperCase()}` : ''}
              </Text>
              {/* C.C. */}
              <View style={s.sigLabelRow}>
                <Text style={s.sigTag}>C.C.</Text>
                <Text style={s.sigDetail}>No. {contrato.contratista.cedula}</Text>
              </View>
              {/* Cel. */}
              {contrato.contratista.telefono && (
                <View style={s.sigLabelRow}>
                  <Text style={s.sigTag}>Cel.</Text>
                  <Text style={s.sigDetail}>{contrato.contratista.telefono}</Text>
                </View>
              )}
            </View>

            {/* ── Block 2: Supervisor receipt — full width, thick top border ── */}
            <View style={s.sigSupervisorBlock}>
              {/* Receipt paragraph */}
              <Text style={s.receiptParagraph}>
                <Text style={s.receiptBold}>Constancia de recibido del informe</Text>
                {': La Alcaldía municipal de '}
                {municipio.nombre}
                {', recibió el presente informe presentado por el contratista '}
                <Text style={s.receiptBold}>
                  {contrato.contratista.nombre_completo
                    .toLowerCase()
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </Text>
                {', en constancia:'}
              </Text>

              {/* Firma — image when approved, blank line otherwise */}
              <View style={s.sigFirmaRow}>
                <Text style={s.sigTag}>Firma:</Text>
                {mostrarFirmaSupervisor ? (
                  <Image src={contrato.supervisor.firma_url!} style={s.firmaImgSupervisor} />
                ) : (
                  <View style={s.sigFirmaLine} />
                )}
              </View>

              {/* Underline above name */}
              <View style={s.sigUnderline} />

              {/* Nombre: SUPERVISOR NAME */}
              <View style={s.sigNombreRow}>
                <Text style={s.sigTag}>Nombre:</Text>
                <Text style={s.sigName}>{contrato.supervisor.nombre_completo}</Text>
              </View>

              {/* Cargo — indented */}
              {contrato.supervisor.cargo && (
                <View style={s.sigNombreRow}>
                  <Text style={{ width: 52 }} />
                  <Text style={s.sigDetail}>{contrato.supervisor.cargo}.</Text>
                </View>
              )}

              {/* "Supervisor contrato No ..." — indented */}
              <View style={s.sigNombreRow}>
                <Text style={{ width: 52 }} />
                <Text style={s.sigDetail}>
                  Supervisor contrato No {contrato.numero}-{contrato.anio}
                </Text>
              </View>

              {/* C.C. */}
              <View style={s.sigLabelRow}>
                <Text style={s.sigTag}>C.C.</Text>
                <Text style={s.sigDetail}>No. {contrato.supervisor.cedula}</Text>
              </View>
            </View>
          </View>{/* end wrap={false} closing+signature */}

        </View>{/* end mainTable */}

        {/* ── Footer — page number only (centered) ──────── */}
        <View style={s.footer} fixed>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  )
}
