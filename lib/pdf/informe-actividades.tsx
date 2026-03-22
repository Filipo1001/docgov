/**
 * Informe de Actividades PDF
 *
 * Exact layout from the real document:
 * - Single 3-column table that spans ALL pages (never interrupted)
 * - COL1: obligation text (shown only on the first activity row of each obligation)
 * - COL2: activity description text + evidence photos stacked vertically below
 * - COL3: total action count (shown only on the first activity row of each obligation)
 * - One table row per activity (not per obligation) — cleaner page breaks
 * - Thick bottom border separates obligation groups
 * - No photo captions (matching the real document)
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

// ─── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: '#000',
    paddingTop: 36,
    paddingBottom: 48,
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

  // ── Activities sub-heading (italic only — no bold+italic: react-pdf has no such built-in font)
  activitiesHeading: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 6,
    marginTop: 2,
  },

  // ── Main 3-column table ──────────────────────────────────────
  //
  // Column widths (A4 content = 507pt):
  //   COL1 — Obligaciones: 32% ≈ 162pt
  //   COL2 — Descripción:  flex 1 (≈ 278pt)
  //   COL3 — Número:       13% ≈  66pt
  //
  mainTable: {
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
  },
  // Header row
  mainHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#d0d0d0',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  // Regular row — thin bottom border between activities within same obligation
  mainRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#aaa',
    borderBottomStyle: 'solid',
  },
  // Thick border row — marks the end of an obligation group
  mainRowObligEnd: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  // Last row — no bottom border (table outer border handles it)
  mainRowLast: {
    flexDirection: 'row',
  },

  // COL1 — obligation
  col1: {
    width: '32%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '6 7',
  },
  // COL2 — description + photos
  col2: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '6 7',
  },
  // COL3 — count
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

  // COL1 content
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

  // COL2 content — activity text
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

  // COL2 content — evidence photo (full width of cell, stacked vertically)
  photo: {
    width: '100%',
    height: 190,
    objectFit: 'cover',
    marginBottom: 4,
  },

  // COL3 content
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

  // ── Closing & signatures
  closingText: {
    fontSize: 9.5,
    lineHeight: 1.7,
    marginTop: 14,
    marginBottom: 28,
  },
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sigBlock: {
    width: '47%',
  },
  sigLine: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    marginBottom: 5,
    width: '80%',
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
  },

  // ── Fixed footer (every page)
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 44,
    right: 44,
    borderTopWidth: 0.5,
    borderTopColor: '#aaa',
    borderTopStyle: 'solid',
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
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

// ─── Activity row (one row per activity in the main table) ───

interface ActivityRowProps {
  obl: PDFObligacion
  oblIndex: number
  act: PDFActividad
  actIndex: number
  showOblInfo: boolean   // only true for the first activity of each obligation
  totalAcciones: number  // sum of all activity counts for this obligation
  rowStyle: object
}

function ActivityRow({
  obl,
  oblIndex,
  act,
  actIndex,
  showOblInfo,
  totalAcciones,
  rowStyle,
}: ActivityRowProps) {
  return (
    <View style={rowStyle}>
      {/* COL1 — Obligation info (shown only on first activity of each obligation) */}
      <View style={s.col1}>
        {showOblInfo && (
          <>
            <Text style={s.oblIndex}>Obligación {oblIndex + 1}</Text>
            <Text style={s.oblText}>{obl.descripcion}</Text>
          </>
        )}
      </View>

      {/* COL2 — Activity text + evidence photos stacked vertically */}
      <View style={s.col2}>
        <Text style={s.actText}>{act.descripcion}</Text>
        {act.evidencias.map((ev, ei) => (
          <Image
            key={ei}
            src={ev.url}
            style={s.photo}
          />
        ))}
      </View>

      {/* COL3 — Total action count (shown only on first activity of each obligation) */}
      <View style={s.col3}>
        {showOblInfo && (
          <Text style={s.countText}>{totalAcciones}</Text>
        )}
      </View>
    </View>
  )
}

// ─── Permanent obligation row ─────────────────────────────────

function PermanentRow({ obl, oblIndex, rowStyle }: { obl: PDFObligacion; oblIndex: number; rowStyle: object }) {
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

  // Build a flat list of table rows across all obligations
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

        {/* ── Main 3-column table (contains ALL content including photos) ── */}
        <View style={s.mainTable}>

          {/* Table header row */}
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

          {/* Activity rows — one per activity, photos embedded inside COL2 */}
          {rows.map((row, ri) =>
            row.type === 'permanent' ? (
              <PermanentRow
                key={ri}
                obl={row.obl}
                oblIndex={row.oblIndex}
                rowStyle={rowStyle(row)}
              />
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
        </View>

        {/* ── Closing paragraph ─────────────────────────── */}
        <Text style={s.closingText}>
          En constancia de lo anterior se firma el {fechaFirmaMinusc(periodo.fecha_fin)}.
        </Text>

        {/* ── Signatures ────────────────────────────────── */}
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

          {/* Supervisor — receipt block */}
          <View style={s.sigBlock}>
            <Text style={s.receiptLabel}>
              Constancia de recibido del informe: La Alcaldía Municipal de {municipio.nombre}{' '}
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

        {/* ── Footer (fixed — appears on every page) ────── */}
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
