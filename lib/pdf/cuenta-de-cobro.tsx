import React from 'react'
import { Document, Page, Text, View } from '@react-pdf/renderer'
import { shared } from './styles'
import type { PDFData } from './types'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function CuentaDeCobroPDF({ data }: { data: PDFData }) {
  const { municipio, contrato, periodo, fechaGeneracion } = data

  return (
    <Document
      title={`Cuenta de Cobro — Contrato ${contrato.numero}-${contrato.anio} — Periodo ${periodo.numero}`}
      author={contrato.contratista.nombre_completo}
      subject="Cuenta de Cobro"
      creator="DocGov"
    >
      <Page size="A4" style={shared.page}>

        {/* ── Header ─────────────────────────────────── */}
        <View style={shared.headerBox}>
          <Text style={shared.headerTitle}>Alcaldía Municipal de {municipio}</Text>
          <Text style={shared.headerSubtitle}>{contrato.dependencia}</Text>
          <Text style={shared.documentTitle}>Cuenta de Cobro</Text>
          <Text style={shared.documentNumber}>
            Contrato N.º {contrato.numero}-{contrato.anio} — Periodo {periodo.numero} — {periodo.mes} {periodo.anio}
          </Text>
        </View>

        {/* ── Declaration ────────────────────────────── */}
        <View style={shared.section}>
          <Text style={{ ...shared.value, lineHeight: 1.6 }}>
            Yo, <Text style={{ fontFamily: 'Helvetica-Bold' }}>{contrato.contratista.nombre_completo}</Text>,
            identificado(a) con Cédula de Ciudadanía N.º{' '}
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{contrato.contratista.cedula}</Text>,
            me permito presentar la presente cuenta de cobro al municipio de {municipio} por concepto de
            honorarios correspondientes al periodo{' '}
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{periodo.mes} {periodo.anio}</Text>,
            en cumplimiento del Contrato de Prestación de Servicios N.º{' '}
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{contrato.numero}-{contrato.anio}</Text>.
          </Text>
        </View>

        {/* ── Contract object ────────────────────────── */}
        <View style={shared.section}>
          <Text style={shared.sectionTitle}>Objeto del Contrato</Text>
          <Text style={{ ...shared.value, lineHeight: 1.5 }}>{contrato.objeto}</Text>
        </View>

        {/* ── Value ──────────────────────────────────── */}
        <View style={shared.section}>
          <Text style={shared.sectionTitle}>Valor a Cobrar</Text>
          <View style={shared.amountBox}>
            <Text style={shared.amountLabel}>Valor del periodo</Text>
            <Text style={shared.amountValue}>{formatCurrency(periodo.valor_cobro)}</Text>
            <Text style={shared.amountWords}>{contrato.valor_letras_mensual}</Text>
          </View>
        </View>

        {/* ── Period details ─────────────────────────── */}
        <View style={shared.section}>
          <Text style={shared.sectionTitle}>Periodo de Ejecución</Text>
          <View style={shared.row}>
            <View style={shared.col2}>
              <Text style={shared.label}>Fecha de inicio</Text>
              <Text style={shared.value}>{formatDate(periodo.fecha_inicio)}</Text>
            </View>
            <View style={shared.col2}>
              <Text style={shared.label}>Fecha de fin</Text>
              <Text style={shared.value}>{formatDate(periodo.fecha_fin)}</Text>
            </View>
            <View style={shared.col2}>
              <Text style={shared.label}>Periodo N.º</Text>
              <Text style={shared.value}>{periodo.numero}</Text>
            </View>
          </View>
        </View>

        {/* ── Banking info ───────────────────────────── */}
        <View style={shared.section}>
          <Text style={shared.sectionTitle}>Información de Pago</Text>
          <View style={shared.row}>
            <View style={shared.col2}>
              <Text style={shared.label}>Banco</Text>
              <Text style={shared.value}>{contrato.banco}</Text>
            </View>
            <View style={shared.col2}>
              <Text style={shared.label}>Tipo de cuenta</Text>
              <Text style={shared.value} render={() =>
                contrato.tipo_cuenta === 'ahorros' ? 'Cuenta de Ahorros' : 'Cuenta Corriente'
              } />
            </View>
            <View style={shared.col2}>
              <Text style={shared.label}>N.º de cuenta</Text>
              <Text style={shared.value}>{contrato.numero_cuenta}</Text>
            </View>
          </View>
        </View>

        {/* ── Supervisor ─────────────────────────────── */}
        <View style={shared.section}>
          <Text style={shared.sectionTitle}>Supervisor del Contrato</Text>
          <View style={shared.row}>
            <View style={shared.col2}>
              <Text style={shared.label}>Nombre</Text>
              <Text style={shared.value}>{contrato.supervisor.nombre_completo}</Text>
            </View>
            <View style={shared.col2}>
              <Text style={shared.label}>Cédula</Text>
              <Text style={shared.value}>{contrato.supervisor.cedula}</Text>
            </View>
          </View>
        </View>

        {/* ── Signatures ─────────────────────────────── */}
        <View style={shared.signaturesRow}>
          <View style={shared.signatureBlock}>
            <View style={{ height: 40 }} />
            <View style={shared.signatureLine} />
            <Text style={shared.signatureName}>{contrato.contratista.nombre_completo}</Text>
            <Text style={shared.signatureRole}>Contratista</Text>
            <Text style={shared.signatureCedula}>C.C. {contrato.contratista.cedula}</Text>
          </View>

          <View style={shared.signatureBlock}>
            <View style={{ height: 40 }} />
            <View style={shared.signatureLine} />
            <Text style={shared.signatureName}>{contrato.supervisor.nombre_completo}</Text>
            <Text style={shared.signatureRole}>Supervisor del Contrato</Text>
            <Text style={shared.signatureCedula}>C.C. {contrato.supervisor.cedula}</Text>
          </View>
        </View>

        {/* ── Footer ─────────────────────────────────── */}
        <View style={shared.footer} fixed>
          <Text style={shared.footerText}>DocGov — Alcaldía de {municipio}</Text>
          <Text style={shared.footerText}>Generado el {fechaGeneracion}</Text>
          <Text
            style={shared.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  )
}
