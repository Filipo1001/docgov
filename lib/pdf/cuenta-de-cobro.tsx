import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { PDFData } from './types'

// ─── Date utilities ───────────────────────────────────────────

const MESES_ES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]

/** "2026-02-28" → "FEBRERO 28 DE 2026" */
function fechaLargaMayus(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${MESES_ES[parseInt(m) - 1]} ${d} DE ${y}`
}

/** "2026-02-02" → "02" */
function dia(iso: string): string {
  return iso.split('-')[2]
}

/** "2026-02-28" → "FEBRERO" */
function mes(iso: string): string {
  return MESES_ES[parseInt(iso.split('-')[1]) - 1]
}

/** "2026-02-28" → "2026" */
function anio(iso: string): string {
  return iso.split('-')[0]
}

/**
 * Calculates the number of calendar days between two ISO date strings.
 * Returns e.g. "245 DÍAS" or null if dates are missing/invalid.
 */
function calcularDiasContrato(inicio?: string, fin?: string): string | null {
  if (!inicio || !fin) return null
  const d1 = new Date(inicio)
  const d2 = new Date(fin)
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null
  const dias = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
  if (dias <= 0) return null
  return `${dias} DÍAS`
}

/** "$3,000,000" format for COP */
function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)
}

// ─── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#000',
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 52,
  },

  // ── Title block
  docTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  municipioLine: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  nitLine: {
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 12,
  },
  debeA: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.3,
  },

  // ── Bordered form table
  table: {
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    marginBottom: 20,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  tableRowLast: {
    flexDirection: 'row',
  },
  cellLabel: {
    width: '42%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '5 7',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    backgroundColor: '#f7f7f7',
  },
  cellValue: {
    flex: 1,
    padding: '5 7',
    fontSize: 9.5,
  },

  // ── Signatures
  sigSection: {
    marginTop: 36,
  },
  sigLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 24,
  },
  sigLine: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    width: '60%',
    marginBottom: 5,
  },
  sigName: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  sigDetail: {
    fontSize: 9,
    marginBottom: 1,
  },
  voBoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  voBoLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginRight: 8,
  },
  voBoLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },

  // ── Footer
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 52,
    right: 52,
    borderTopWidth: 0.5,
    borderTopColor: '#bbb',
    borderTopStyle: 'solid',
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7.5,
    color: '#999',
  },
})

// ─── Table row helper ─────────────────────────────────────────

function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? s.tableRowLast : s.tableRow}>
      <View style={s.cellLabel}>
        <Text>{label}</Text>
      </View>
      <View style={s.cellValue}>
        <Text>{value}</Text>
      </View>
    </View>
  )
}

// ─── Component ────────────────────────────────────────────────

export function CuentaDeCobroPDF({ data }: { data: PDFData }) {
  const { municipio, contrato, periodo } = data

  // Period value in words — use stored letras or fall back to contract's letras
  const valorLetras = periodo.valor_letras ?? contrato.valor_letras_mensual
  const valorTexto = valorLetras
    ? `${valorLetras} (${formatCOP(periodo.valor_cobro)})`
    : formatCOP(periodo.valor_cobro)

  // Total contract value in words
  const totalLetras = contrato.valor_letras_total
    ? `${contrato.valor_letras_total} (${formatCOP(contrato.valor_total)})`
    : formatCOP(contrato.valor_total)

  // Contract duration — calculated as calendar days between start and end
  const plazoTexto =
    calcularDiasContrato(contrato.fecha_inicio_contrato, contrato.fecha_fin_contrato) ?? '—'

  // Period date range: "DEL 02 AL 28 DE FEBRERO DE 2026"
  const periodoTexto = `DEL ${dia(periodo.fecha_inicio)} AL ${dia(periodo.fecha_fin)} DE ${mes(periodo.fecha_fin)} DE ${anio(periodo.fecha_fin)}`

  // Bank display
  const bancoCuenta = `${contrato.banco.toUpperCase()} / CUENTA ${contrato.tipo_cuenta.toUpperCase()}`

  // Numero de la cuenta de cobro zero-padded (01, 02, ...)
  const ccNumero = String(periodo.numero).padStart(2, '0')

  // Municipality header line
  const municipioHeader = municipio.departamento
    ? `EL MUNICIPIO DE ${municipio.nombre.toUpperCase()} ${municipio.departamento.toUpperCase()}`
    : `EL MUNICIPIO DE ${municipio.nombre.toUpperCase()}`

  return (
    <Document
      title={`Cuenta de Cobro N.º ${ccNumero} — Contrato ${contrato.numero}-${contrato.anio}`}
      author={contrato.contratista.nombre_completo}
      subject="Cuenta de Cobro"
      creator="DocGov"
    >
      <Page size="A4" style={s.page}>

        {/* ── Title block ───────────────────────────── */}
        <Text style={s.docTitle}>CUENTA DE COBRO No. {ccNumero}</Text>
        <Text style={s.municipioLine}>{municipioHeader}</Text>
        {municipio.nit && (
          <Text style={s.nitLine}>NIT {municipio.nit}</Text>
        )}
        <Text style={s.debeA}>DEBE A:</Text>

        {/* ── Form table ────────────────────────────── */}
        <View style={s.table}>
          <Row label="Fecha:" value={fechaLargaMayus(periodo.fecha_fin)} />
          <Row
            label="Nombre contratista:"
            value={contrato.contratista.nombre_completo.toUpperCase()}
          />
          <Row
            label="Número de identificación tributaria:"
            value={contrato.contratista.cedula}
          />
          <Row
            label="Nº convenio o contrato:"
            value={`${contrato.numero}-${contrato.anio}`}
          />
          <Row label="Objeto del contrato:" value={contrato.objeto.toUpperCase()} />
          <Row label="Valor total del contrato:" value={totalLetras.toUpperCase()} />
          <Row label="Plazo de ejecución:" value={plazoTexto} />
          <Row
            label="Dependencia:"
            value={contrato.dependencia.toUpperCase()}
          />
          <Row
            label="Nombre del supervisor:"
            value={contrato.supervisor.nombre_completo.toUpperCase()}
          />
          <Row
            label="Valor de la cuenta de cobro:"
            value={valorTexto.toUpperCase()}
          />
          <Row label="Periodo:" value={periodoTexto} />
          <Row
            label="Cuenta bancaria autorizada — Banco y Tipo de Cuenta:"
            value={bancoCuenta}
          />
          <Row label="No.:" value={contrato.numero_cuenta} last />
        </View>

        {/* ── Signature block ────────────────────────── */}
        <View style={s.sigSection}>
          <Text style={s.sigLabel}>Firma Contratista:</Text>

          <View style={s.sigLine} />
          <Text style={s.sigName}>{contrato.contratista.nombre_completo.toUpperCase()}</Text>
          <Text style={s.sigDetail}>CC. {contrato.contratista.cedula}</Text>
          {contrato.contratista.direccion && (
            <Text style={s.sigDetail}>Dirección: {contrato.contratista.direccion}</Text>
          )}
          {contrato.contratista.telefono && (
            <Text style={s.sigDetail}>Teléfono: {contrato.contratista.telefono}</Text>
          )}

          <View style={s.voBoRow}>
            <Text style={s.voBoLabel}>VoBo. Supervisor:</Text>
            <View style={s.voBoLine} />
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
