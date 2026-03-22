import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
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

/** "2026-02-02" → "02 de FEBRERO de 2026" (mixed case) */
function fechaContratoInicio(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d} de ${MESES_MAYUS[parseInt(m) - 1]} de ${y}`
}

/** "2026-02-02" → "02 al 28 de febrero del 2026" (for period range) */
function periodoRangoMinusc(inicio: string, fin: string): string {
  const [yi, mi, di] = inicio.split('-')
  const [, , df] = fin.split('-')
  return `Del ${di} al ${df} de ${MESES_MINUS[parseInt(mi) - 1]} del ${yi}`
}

/** "2026-02-28" → "28 de febrero de 2026" */
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

  // ── Top header title
  reportTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    padding: '7 10',
    marginBottom: 0,
    letterSpacing: 0.3,
  },

  // ── Info table (header section)
  infoTable: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    marginBottom: 14,
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
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    backgroundColor: '#f5f5f5',
  },
  infoValue: {
    flex: 1,
    padding: '4 6',
    fontSize: 9.5,
  },
  infoSectionHeader: {
    backgroundColor: '#e8e8e8',
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },

  // ── Activities heading
  activitiesHeading: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 10,
    paddingTop: 4,
  },

  // ── Main 3-column activities table
  mainTable: {
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    marginBottom: 16,
  },
  mainHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#e0e0e0',
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

  // Column 1: Obligaciones (35%)
  col1: {
    width: '34%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '5 6',
    justifyContent: 'flex-start',
  },
  // Column 2: Descripción (52%)
  col2: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '5 6',
  },
  // Column 3: Número (14%)
  col3: {
    width: '14%',
    padding: '5 4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  colHeaderText: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  oblText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.4,
  },
  actText: {
    fontSize: 9,
    lineHeight: 1.5,
    marginBottom: 3,
  },
  countText: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  permanenteText: {
    fontSize: 8.5,
    fontStyle: 'italic',
    color: '#555',
    textAlign: 'center',
  },

  // ── Closing & signatures
  closingText: {
    fontSize: 9.5,
    lineHeight: 1.6,
    marginBottom: 32,
  },
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  sigBlock: {
    width: '48%',
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
  },
  sigRole: {
    fontSize: 9,
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
    marginBottom: 16,
  },

  // ── Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderTopColor: '#bbb',
    borderTopStyle: 'solid',
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7.5,
    color: '#999',
  },
})

// ─── Info table helper ────────────────────────────────────────

function InfoRow({
  label,
  value,
  last = false,
}: {
  label: string
  value: string
  last?: boolean
}) {
  return (
    <View style={last ? s.infoRowLast : s.infoRow}>
      <View style={s.infoLabel}>
        <Text>{label}</Text>
      </View>
      <View style={s.infoValue}>
        <Text>{value}</Text>
      </View>
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

// ─── Obligation row ───────────────────────────────────────────

function ObligacionRow({
  obl,
  index,
  total,
}: {
  obl: PDFObligacion
  index: number
  total: number
}) {
  const isLast = index === total - 1
  const actCount = obl.actividades.reduce((s, a) => s + a.cantidad, 0)

  return (
    <View style={isLast ? s.mainRowLast : s.mainRow} wrap={false}>
      {/* Column 1 — Obligation */}
      <View style={s.col1}>
        <Text style={s.oblText}>{obl.descripcion}</Text>
      </View>

      {/* Column 2 — Activities */}
      <View style={s.col2}>
        {obl.es_permanente ? (
          <Text style={s.actText}>Permanente</Text>
        ) : obl.actividades.length === 0 ? (
          <Text style={s.actText}>Sin actividades registradas en este periodo.</Text>
        ) : (
          obl.actividades.map((act, i) => (
            <Text key={i} style={s.actText}>
              {i + 1}. {act.descripcion}
            </Text>
          ))
        )}
      </View>

      {/* Column 3 — Count */}
      <View style={s.col3}>
        {obl.es_permanente ? (
          <Text style={s.permanenteText}>Permanente</Text>
        ) : (
          <Text style={s.countText}>{actCount > 0 ? String(actCount) : '0'}</Text>
        )}
      </View>
    </View>
  )
}

// ─── Main component ───────────────────────────────────────────

export function InformeActividadesPDF({ data }: { data: PDFData }) {
  const { municipio, contrato, periodo, obligaciones } = data

  return (
    <Document
      title={`Informe de Actividades — Contrato ${contrato.numero}-${contrato.anio} — Periodo ${periodo.numero}`}
      author={contrato.contratista.nombre_completo}
      subject="Reporte de Actividades del Contratista"
      creator="DocGov"
    >
      <Page size="A4" style={s.page}>

        {/* ── Report title ─────────────────────────── */}
        <Text style={s.reportTitle}>REPORTE DE ACTIVIDADES DEL CONTRATISTA</Text>

        {/* ── Header info table ────────────────────── */}
        <View style={s.infoTable}>
          <InfoRow label="Modalidad de selección:" value={contrato.modalidad_seleccion} />
          <InfoRow
            label="Número y objeto del contrato:"
            value={`N.º ${contrato.numero}-${contrato.anio} del ${fechaContratoInicio(periodo.fecha_inicio)}. "${contrato.objeto}"`}
          />

          <SectionHeader>Contratante</SectionHeader>
          <InfoRow label="Alcaldía Municipal:" value={municipio.nombre} />
          {municipio.representante_legal ? (
            <InfoRow
              label="Representante legal:"
              value={municipio.representante_legal}
            />
          ) : null}
          {municipio.cedula_representante ? (
            <InfoRow
              label="Cedula de Ciudadanía:"
              value={municipio.cedula_representante}
            />
          ) : null}
          {municipio.nit ? (
            <InfoRow label="Nit:" value={municipio.nit} />
          ) : null}

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

        {/* ── Activities section heading ────────────── */}
        <Text style={s.activitiesHeading}>
          Descripción del desarrollo de actividades durante el mes para cumplimiento del objeto contractual
        </Text>

        {/* ── Main 3-column table ───────────────────── */}
        <View style={s.mainTable}>
          {/* Table header */}
          <View style={s.mainHeaderRow}>
            <View style={[s.col1, { backgroundColor: 'transparent' }]}>
              <Text style={s.colHeaderText}>OBLIGACIONES{'\n'}ESPECIFICAS</Text>
            </View>
            <View style={[s.col2, { backgroundColor: 'transparent' }]}>
              <Text style={s.colHeaderText}>
                DESCRIPCIÓN DE LA ACTIVIDAD{'\n'}
                (Descripción detallada de las actividades y logros realizados durante{'\n'}
                el periodo de ejecución de acuerdo con las obligaciones)
              </Text>
            </View>
            <View style={[s.col3, { backgroundColor: 'transparent' }]}>
              <Text style={s.colHeaderText}>NÚMERO DE{'\n'}ACTIVIDADES</Text>
            </View>
          </View>

          {/* Obligation rows */}
          {obligaciones.map((obl, i) => (
            <ObligacionRow
              key={i}
              obl={obl}
              index={i}
              total={obligaciones.length}
            />
          ))}
        </View>

        {/* ── Closing paragraph ─────────────────────── */}
        <Text style={s.closingText}>
          En constancia de lo anterior se firma el {fechaFirmaMinusc(periodo.fecha_fin)}.
        </Text>

        {/* ── Signatures ───────────────────────────── */}
        <View style={s.sigRow}>
          {/* Contratista */}
          <View style={s.sigBlock}>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{contrato.contratista.nombre_completo.toUpperCase()}</Text>
            {contrato.contratista.cargo ? (
              <Text style={s.sigRole}>CONTRATISTA {contrato.contratista.cargo.toUpperCase()}</Text>
            ) : (
              <Text style={s.sigRole}>CONTRATISTA</Text>
            )}
            <Text style={s.sigCedula}>C.C. No. {contrato.contratista.cedula}</Text>
            {contrato.contratista.telefono && (
              <Text style={s.sigTel}>Cel. {contrato.contratista.telefono}</Text>
            )}
          </View>

          {/* Supervisor — receipt block */}
          <View style={s.sigBlock}>
            <Text style={s.receiptLabel}>
              Constancia de recibido del informe: La Alcaldía municipal de {municipio.nombre},
              recibió el presente informe presentado por el contratista{' '}
              {contrato.contratista.nombre_completo}, en constancia:
            </Text>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{contrato.supervisor.nombre_completo.toUpperCase()}</Text>
            {contrato.supervisor.cargo && (
              <Text style={s.sigRole}>{contrato.supervisor.cargo}.</Text>
            )}
            <Text style={s.sigRole}>Supervisor contrato No {contrato.numero}-{contrato.anio}</Text>
            <Text style={s.sigCedula}>C.C. No. {contrato.supervisor.cedula}</Text>
          </View>
        </View>

        {/* ── Footer ────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>DocGov — Alcaldía de {municipio.nombre}</Text>
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
