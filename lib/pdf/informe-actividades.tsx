/**
 * Informe de Actividades PDF
 *
 * Layout (refactored):
 * - Flat list of sub-rows:  text sub-row (obligation label + activity text + count)
 *   followed by one photo sub-row per evidence image.
 * - Every sub-row carries its own left/right border → no border loss on page breaks.
 * - Every sub-row is wrap={false} → no sub-row is split across pages.
 * - Obligation label appears on the first text row of each obligation (full) and as a
 *   small compact tag on every following sub-row (photo rows) of that obligation.
 * - Photos use objectFit:'contain' + maxHeight → no cropping, proportional scaling.
 * - Closing + signature block lives *outside* the main table so it paginates cleanly.
 * - Footer (page number) is fixed on every page.
 *
 * Signature rules:
 * - Contratista firma: shown when periodo.estado is enviado/revision/aprobado/radicado
 *   AND contrato.contratista.firma_url is set
 * - Supervisor firma: shown only when estado is aprobado/radicado
 *   AND contrato.supervisor.firma_url is set
 * - If firma_url is absent → blank space, never fails
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

// Estados en los que el contratista ya firmó digitalmente
const ESTADOS_FIRMA_CONTRATISTA = new Set(['enviado', 'revision', 'aprobado', 'radicado'])
// Estados en los que la secretaria ya aprobó
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

  // ── Main table container — no outer border; rows own their side borders
  mainTable: {},

  // ── Table header row — full border (top + sides + bottom)
  mainHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#d0d0d0',
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    borderLeftWidth: 1,
    borderLeftColor: '#000',
    borderLeftStyle: 'solid',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
  },

  // ── Base for all data rows: left + right outer border
  tableRow: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderLeftColor: '#000',
    borderLeftStyle: 'solid',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
  },

  // Row bottom-border variants
  rowBorderNone:   {},
  rowBorderLight:  { borderBottomWidth: 0.5, borderBottomColor: '#eee', borderBottomStyle: 'solid' },
  rowBorderMedium: { borderBottomWidth: 0.5, borderBottomColor: '#aaa', borderBottomStyle: 'solid' },
  rowBorderHeavy:  { borderBottomWidth: 1.5, borderBottomColor: '#000', borderBottomStyle: 'solid' },

  // ── Column definitions
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
  // col2 variant for photo rows — reduced vertical padding
  col2Photo: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '4 7',
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

  // ── Obligation label — full (first activity of obligation)
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
  // ── Obligation label — compact (photo continuation rows)
  oblContinuacion: {
    fontSize: 7,
    fontFamily: 'Helvetica',
    fontStyle: 'italic',
    color: '#bbb',
  },

  // ── Activity text inside col2
  actRow: {
    flexDirection: 'row',
  },
  actNumber: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#333',
    width: 16,
    lineHeight: 1.6,
  },
  actText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.6,
    color: '#111',
  },
  actTextPermanente: {
    fontSize: 9,
    lineHeight: 1.5,
    fontStyle: 'italic',
    color: '#444',
  },

  // ── Evidence photo — contain (no cropping), proportional scaling
  photo: {
    width: '100%',
    maxHeight: 210,
    objectFit: 'contain',
  },

  // ── Count in col3
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

  // ── Closing + Signature block — outside main table
  closingAndSig: {
    borderTopWidth: 1.5,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
  },
  closingRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    padding: '12 10',
  },
  closingText: {
    fontSize: 10,
    lineHeight: 1.8,
  },

  // Block 1: Contratista
  sigContratistaBlock: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    padding: '12 14 10 14',
  },
  // Block 2: Supervisor
  sigSupervisorBlock: {
    padding: '10 14 12 14',
  },

  sigSpace: { height: 65 },

  firmaImgContratista: {
    width: '55%',
    height: 65,
    objectFit: 'contain',
  },
  firmaImgSupervisor: {
    height: 46,
    width: 130,
    objectFit: 'contain',
    marginLeft: 4,
  },
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
  sigTag: {
    fontSize: 9.5,
    width: 52,
  },
  sigFirmaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 20,
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

  // ── Footer
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

// ─── Sub-row types ────────────────────────────────────────────

type BorderType = 'none' | 'light' | 'medium' | 'heavy'

type SubRow =
  | {
      type: 'text'
      obl: PDFObligacion
      oblIndex: number
      act: PDFActividad
      actIndex: number
      isFirstOfObl: boolean
      totalAcciones: number
      border: BorderType
    }
  | {
      type: 'photo'
      oblIndex: number
      ev: { url: string; nombre_archivo: string }
      border: BorderType
    }
  | {
      type: 'permanent'
      obl: PDFObligacion
      oblIndex: number
      border: BorderType
    }

function rowBorderStyle(b: BorderType) {
  if (b === 'light')  return s.rowBorderLight
  if (b === 'medium') return s.rowBorderMedium
  if (b === 'heavy')  return s.rowBorderHeavy
  return s.rowBorderNone
}

// ─── Main component ───────────────────────────────────────────

export function InformeActividadesPDF({ data }: { data: PDFData }) {
  const { municipio, contrato, periodo, obligaciones } = data

  const mostrarFirmaContratista =
    ESTADOS_FIRMA_CONTRATISTA.has(periodo.estado) && !!contrato.contratista.firma_url

  const mostrarFirmaSupervisor =
    ESTADOS_FIRMA_SUPERVISOR.has(periodo.estado) && !!contrato.supervisor.firma_url

  // ── Build flat sub-row list ──────────────────────────────────

  const subRows: SubRow[] = []

  obligaciones.forEach((obl, oi) => {
    const isLastObl = oi === obligaciones.length - 1

    if (obl.es_permanente || obl.actividades.length === 0) {
      subRows.push({
        type: 'permanent',
        obl,
        oblIndex: oi,
        border: isLastObl ? 'none' : 'heavy',
      })
      return
    }

    const totalAcciones = obl.actividades.reduce((sum, a) => sum + a.cantidad, 0)

    obl.actividades.forEach((act, ai) => {
      const isLastAct   = ai === obl.actividades.length - 1
      const isAbsLast   = isLastAct && isLastObl
      // Border that terminates this activity group
      const actEndBorder: BorderType = isAbsLast ? 'none' : isLastAct ? 'heavy' : 'medium'
      const hasPhotos   = act.evidencias.length > 0

      // Text sub-row — no bottom border when photos follow (they continue the cell)
      subRows.push({
        type:        'text',
        obl,
        oblIndex:    oi,
        act,
        actIndex:    ai,
        isFirstOfObl: ai === 0,
        totalAcciones,
        border:      hasPhotos ? 'none' : actEndBorder,
      })

      // One photo sub-row per evidence image
      act.evidencias.forEach((ev, ei) => {
        const isLastPhoto = ei === act.evidencias.length - 1
        subRows.push({
          type:     'photo',
          oblIndex: oi,
          ev,
          border:   isLastPhoto ? actEndBorder : 'light',
        })
      })
    })
  })

  // ─────────────────────────────────────────────────────────────

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

          {/* Table header — full border on all sides */}
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

          {/* Sub-rows — each is wrap={false} so it never splits across pages */}
          {subRows.map((row, ri) => {
            // ── Permanent obligation row
            if (row.type === 'permanent') {
              return (
                <View key={ri} wrap={false} style={[s.tableRow, rowBorderStyle(row.border)]}>
                  <View style={s.col1}>
                    <Text style={s.oblIndex}>Obligación {row.oblIndex + 1}</Text>
                    <Text style={s.oblText}>{row.obl.descripcion}</Text>
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

            // ── Photo sub-row
            if (row.type === 'photo') {
              return (
                <View key={ri} wrap={false} style={[s.tableRow, rowBorderStyle(row.border)]}>
                  {/* col1: compact obligation tag so context is always visible */}
                  <View style={s.col1}>
                    <Text style={s.oblContinuacion}>Obl. {row.oblIndex + 1}</Text>
                  </View>
                  {/* col2: single photo, scaled proportionally */}
                  <View style={s.col2Photo}>
                    <Image src={row.ev.url} style={s.photo} />
                  </View>
                  <View style={s.col3} />
                </View>
              )
            }

            // ── Activity text sub-row
            return (
              <View key={ri} wrap={false} style={[s.tableRow, rowBorderStyle(row.border)]}>
                {/* col1: full label on first activity, compact tag on subsequent */}
                <View style={s.col1}>
                  {row.isFirstOfObl ? (
                    <>
                      <Text style={s.oblIndex}>Obligación {row.oblIndex + 1}</Text>
                      <Text style={s.oblText}>{row.obl.descripcion}</Text>
                    </>
                  ) : (
                    <Text style={s.oblContinuacion}>Obl. {row.oblIndex + 1}</Text>
                  )}
                </View>
                {/* col2: numbered activity description */}
                <View style={s.col2}>
                  <View style={s.actRow}>
                    <Text style={s.actNumber}>{row.actIndex + 1}.</Text>
                    <Text style={s.actText}>{row.act.descripcion}</Text>
                  </View>
                </View>
                {/* col3: total actions — shown only once, on first activity */}
                <View style={s.col3}>
                  {row.isFirstOfObl && (
                    <Text style={s.countText}>{row.totalAcciones}</Text>
                  )}
                </View>
              </View>
            )
          })}

        </View>{/* end mainTable */}

        {/* ── Closing + Signature — outside mainTable, indivisible ── */}
        <View wrap={false}>
          <View style={s.closingAndSig}>

            {/* "En constancia..." closing line */}
            <View style={s.closingRow}>
              <Text style={s.closingText}>
                En constancia de lo anterior se firma el {fechaFirmaMinusc(periodo.fecha_fin)}.
              </Text>
            </View>

            {/* Block 1: Contratista */}
            <View style={s.sigContratistaBlock}>
              {mostrarFirmaContratista ? (
                <Image src={contrato.contratista.firma_url!} style={s.firmaImgContratista} />
              ) : (
                <View style={s.sigSpace} />
              )}
              <View style={s.sigUnderline} />
              <Text style={s.sigName}>{contrato.contratista.nombre_completo}</Text>
              <Text style={s.sigDetail}>
                CONTRATISTA{contrato.contratista.cargo ? ` ${contrato.contratista.cargo.toUpperCase()}` : ''}
              </Text>
              <View style={s.sigLabelRow}>
                <Text style={s.sigTag}>C.C.</Text>
                <Text style={s.sigDetail}>No. {contrato.contratista.cedula}</Text>
              </View>
              {contrato.contratista.telefono && (
                <View style={s.sigLabelRow}>
                  <Text style={s.sigTag}>Cel.</Text>
                  <Text style={s.sigDetail}>{contrato.contratista.telefono}</Text>
                </View>
              )}
            </View>

            {/* Block 2: Supervisor receipt */}
            <View style={s.sigSupervisorBlock}>
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

              <View style={s.sigFirmaRow}>
                <Text style={s.sigTag}>Firma:</Text>
                {mostrarFirmaSupervisor ? (
                  <Image src={contrato.supervisor.firma_url!} style={s.firmaImgSupervisor} />
                ) : (
                  <View style={s.sigFirmaLine} />
                )}
              </View>

              <View style={s.sigNombreRow}>
                <Text style={s.sigTag}>Nombre:</Text>
                <Text style={s.sigName}>{contrato.supervisor.nombre_completo}</Text>
              </View>

              {contrato.supervisor.cargo && (
                <View style={s.sigNombreRow}>
                  <Text style={{ width: 52 }} />
                  <Text style={s.sigDetail}>{contrato.supervisor.cargo}.</Text>
                </View>
              )}

              <View style={s.sigNombreRow}>
                <Text style={{ width: 52 }} />
                <Text style={s.sigDetail}>
                  Supervisor contrato No {contrato.numero}-{contrato.anio}
                </Text>
              </View>

              <View style={s.sigLabelRow}>
                <Text style={s.sigTag}>C.C.</Text>
                <Text style={s.sigDetail}>No. {contrato.supervisor.cedula}</Text>
              </View>
            </View>

          </View>
        </View>{/* end wrap={false} closing+signature */}

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
