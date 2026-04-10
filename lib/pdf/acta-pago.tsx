/**
 * Acta de Pago PDF — F-AM-011
 *
 * Exact replica of the Fredonia "FORMATO ACTOS ADMINISTRATIVOS - ACTA DE PAGO" document.
 * 2-page document with contract info, CONSIDERANDO bullets,
 * payment history table, ACUERDAN section, and supervisor signature.
 */

import React from 'react'
import path from 'path'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { PDFData, PDFPagoHistorial } from './types'

const HEADER_PATH = path.join(process.cwd(), 'public', 'header-acta-pago.png')

// ─── Helpers ──────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatCOP(n: number): string {
  return `$ ${n.toLocaleString('es-CO')}`
}

function fechaTexto(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)} de ${MESES[parseInt(m) - 1]} de ${y}`
}

function mesAnio(iso: string): string {
  const [y, m] = iso.split('-')
  return `${MESES[parseInt(m) - 1].toLowerCase()} de ${y}`
}

// ── Número a letras (días, 0-999) ─────────────────────────────
const _UNIT = [
  '', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO',
  'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
]
const _DEC  = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const _CENT = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function numerosALetras(n: number): string {
  if (n === 0)   return 'CERO'
  if (n < 30)    return _UNIT[n]
  if (n < 100)   return n % 10 === 0 ? _DEC[Math.floor(n / 10)] : `${_DEC[Math.floor(n / 10)]} Y ${_UNIT[n % 10]}`
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100); const r = n % 100
  return r === 0 ? _CENT[c] : `${_CENT[c]} ${numerosALetras(r)}`
}

function calcDias(inicio: string, fin: string): number {
  return Math.round((new Date(fin + 'T00:00:00').getTime() - new Date(inicio + 'T00:00:00').getTime()) / 86_400_000)
}

// ─── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#000',
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 50,
  },
  // Title
  actaTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  // Fecha row
  fechaRow: {
    flexDirection: 'row',
    marginBottom: 12,
    justifyContent: 'center',
  },
  fechaLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginRight: 8,
  },
  fechaVal: {
    fontSize: 10,
  },
  // Responsibility
  responsabilidad: {
    borderWidth: 1,
    borderColor: '#000',
    padding: '6 8',
    marginBottom: 10,
  },
  responsabilidadTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 4,
  },
  responsabilidadText: {
    fontSize: 9,
    lineHeight: 1.4,
    textAlign: 'justify',
  },
  // Info table
  infoTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#000',
    padding: '4 6',
    backgroundColor: '#e8e8e8',
  },
  infoTable: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    minHeight: 20,
  },
  infoRowLast: {
    flexDirection: 'row',
    minHeight: 20,
  },
  infoLabel: {
    width: '30%',
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  infoVal: {
    flex: 1,
    padding: '4 6',
    fontSize: 9.5,
    lineHeight: 1.5,
  },
  // CONSIDERANDO
  considerandoTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#000',
    padding: '4 6',
    backgroundColor: '#e8e8e8',
    marginBottom: 8,
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  bulletDot: {
    width: 14,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    lineHeight: 1.6,
    textAlign: 'justify',
  },
  // Payment table
  payTable: {
    borderWidth: 1,
    borderColor: '#000',
    marginVertical: 8,
    marginHorizontal: 20,
  },
  payHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#e8e8e8',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  payHeaderCell: {
    flex: 1,
    padding: '3 4',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  payHeaderCellLast: {
    flex: 1,
    padding: '3 4',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textAlign: 'center',
  },
  payDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#aaa',
  },
  payDataCell: {
    flex: 1,
    padding: '3 4',
    fontSize: 9,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  payDataCellLast: {
    flex: 1,
    padding: '3 4',
    fontSize: 9,
    textAlign: 'center',
  },
  // ACUERDAN
  acuerdanTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#000',
    padding: '4 6',
    backgroundColor: '#e8e8e8',
    marginTop: 8,
    marginBottom: 8,
  },
  acuerdanText: {
    fontSize: 10,
    lineHeight: 1.7,
    textAlign: 'justify',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  // Signature
  sigBlock: {
    marginTop: 30,
    alignItems: 'center',
  },
  sigSpace: {
    height: 50,
  },
  sigLine: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    width: '50%',
    marginBottom: 4,
  },
  sigName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textAlign: 'center',
  },
  sigCargo: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 2,
  },
})

// ─── Component ────────────────────────────────────────────────

export function ActaPagoPDF({ data }: { data: PDFData }) {
  const { contrato, periodo, pagosHistorial = [] } = data

  const valorContratoTexto = contrato.valor_letras_total
    ? `${contrato.valor_letras_total} (${formatCOP(contrato.valor_total)})`
    : formatCOP(contrato.valor_total)

  const valorMensualTexto = contrato.valor_letras_mensual
    ? `${contrato.valor_letras_mensual.toUpperCase()} (${formatCOP(contrato.valor_mensual)})`
    : formatCOP(contrato.valor_mensual)

  let plazoTexto = '—'
  if (contrato.fecha_inicio_contrato && contrato.fecha_fin_contrato) {
    const dias = calcDias(contrato.fecha_inicio_contrato, contrato.fecha_fin_contrato)
    plazoTexto = `${numerosALetras(dias)} DÍAS (${dias})`
  } else if (contrato.plazo_meses) {
    plazoTexto = `${contrato.duracion_letras || contrato.plazo_meses} MESES (${contrato.plazo_meses})`
  }

  const periodoNum = String(periodo.numero).padStart(2, '0')

  return (
    <Document
      title={`Acta de Pago No. ${periodoNum} — Contrato ${contrato.numero}-${contrato.anio}`}
      author={contrato.supervisor.nombre_completo}
      subject="Acta de Pago"
      creator="DocGov"
    >
      <Page size="A4" style={s.page}>

        {/* Header */}
        <Image src={HEADER_PATH} style={{ width: '100%', marginBottom: 12 }} />

        {/* Title + Date */}
        <Text style={s.actaTitle}>ACTA DE PAGO No. {periodoNum}</Text>
        <View style={s.fechaRow}>
          <Text style={s.fechaLabel}>Fecha:</Text>
          <Text style={s.fechaVal}>{fechaTexto(periodo.fecha_fin)}</Text>
        </View>

        {/* Responsibility */}
        <View style={s.responsabilidad}>
          <Text style={s.responsabilidadTitle}>GRADO DE RESPONSABILIDAD</Text>
          <Text style={s.responsabilidadText}>
            Mediante la suscripción de la presente acta, el supervisor asume plena responsabilidad por la veracidad de la información en ella contenida
          </Text>
        </View>

        {/* Contract Info */}
        <Text style={s.infoTitle}>INFORMACIÓN GENERAL DEL CONTRATO</Text>
        <View style={s.infoTable}>
          <View style={s.infoRow}>
            <View style={s.infoLabel}><Text>Contrato número:</Text></View>
            <View style={s.infoVal}><Text>{contrato.numero}-{contrato.anio}</Text></View>
          </View>
          <View style={s.infoRow}>
            <View style={s.infoLabel}><Text>Objeto del Contrato:</Text></View>
            <View style={s.infoVal}><Text>"{contrato.objeto.toUpperCase()}"</Text></View>
          </View>
          <View style={s.infoRow}>
            <View style={s.infoLabel}><Text>Supervisor:</Text></View>
            <View style={s.infoVal}><Text>{contrato.supervisor.nombre_completo.toUpperCase()}</Text></View>
          </View>
          <View style={s.infoRow}>
            <View style={s.infoLabel}><Text>Contratista:</Text></View>
            <View style={s.infoVal}>
              <Text>{contrato.contratista.nombre_completo.toUpperCase()} C.C. {contrato.contratista.cedula}</Text>
            </View>
          </View>
          <View style={s.infoRow}>
            <View style={s.infoLabel}><Text>Valor Contrato</Text></View>
            <View style={s.infoVal}><Text>{valorContratoTexto}</Text></View>
          </View>
          <View style={s.infoRow}>
            <View style={s.infoLabel}><Text>Duración</Text></View>
            <View style={s.infoVal}><Text>{plazoTexto}</Text></View>
          </View>
          <View style={s.infoRow}>
            <View style={s.infoLabel}><Text>No. CDP</Text></View>
            <View style={s.infoVal}><Text>{contrato.cdp || '—'}</Text></View>
          </View>
          <View style={s.infoRowLast}>
            <View style={s.infoLabel}><Text>No. CRP</Text></View>
            <View style={s.infoVal}><Text>{contrato.crp || '—'}</Text></View>
          </View>
        </View>

        {/* CONSIDERANDO */}
        {/* minPresenceAhead: break before title if less than 100pt remain */}
        <Text style={s.considerandoTitle} minPresenceAhead={100}>CONSIDERANDO:</Text>

        {/* wrap={false} on each bullet prevents dot/text from splitting */}
        <View style={s.bullet} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>
            Que, entre el Municipio de Fredonia, Antioquia y {contrato.contratista.nombre_completo}, se celebró el contrato: {contrato.numero}-{contrato.anio}, por un valor de: {valorContratoTexto.toUpperCase()} y un plazo de {plazoTexto}.
          </Text>
        </View>

        <View style={s.bullet} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>
            Que el Contratista presentó informe de los trabajos ejecutados como parte de las obligaciones contempladas en el contrato, los cuales fueron recibidos a satisfacción por parte de la supervisión.
          </Text>
        </View>

        <View style={s.bullet} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>
            Que el Contratista aportó los documentos que acreditan que se encuentra a paz y salvo por concepto del pago de aportes a los sistemas de seguridad social en salud, pensiones, ARP y parafiscales, de él, de conformidad con lo dispuesto en el Artículo 23 de la Ley 1150 de 2007. (Si se trata de un contrato suscrito con persona natural, el ingreso base de cotización equivaldrá al 40% del valor mensual del contrato).
          </Text>
        </View>

        <View style={s.bullet} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>
            Que en el desarrollo del contrato se efectuará el siguiente pago:
          </Text>
        </View>

        {/* Payment table — each data row is indivisible */}
        <View style={s.payTable}>
          <View style={s.payHeaderRow} wrap={false}>
            <Text style={s.payHeaderCell}>Acta de{'\n'}Pago</Text>
            <Text style={s.payHeaderCell}>Valor Contrato</Text>
            <Text style={s.payHeaderCell}>Valor Pagado{'\n'}Acumulado</Text>
            <Text style={s.payHeaderCell}>Valor Acta</Text>
            <Text style={s.payHeaderCellLast}>Saldo Pendiente</Text>
          </View>
          {pagosHistorial.map((p, i) => (
            <View key={i} style={s.payDataRow} wrap={false}>
              <Text style={s.payDataCell}>{String(p.acta_numero).padStart(2, '0')}</Text>
              <Text style={s.payDataCell}>{formatCOP(p.valor_contrato)}</Text>
              <Text style={s.payDataCell}>{formatCOP(p.valor_pagado_acumulado)}</Text>
              <Text style={s.payDataCell}>{formatCOP(p.valor_acta)}</Text>
              <Text style={s.payDataCellLast}>{formatCOP(p.saldo_pendiente)}</Text>
            </View>
          ))}
        </View>

        {/* ACUERDAN + signature are indivisible: they always appear on the same page.
            If they don't fit together, the whole block moves to the next page. */}
        <View wrap={false}>
          <Text style={s.acuerdanTitle}>ACUERDAN</Text>
          <Text style={s.acuerdanText}>
            Pagar al Contratista la suma de {valorMensualTexto} correspondientes al acta de pago No. {periodoNum} del contrato No. {contrato.numero}-{contrato.anio}. Periodo de actividades del mes de {mesAnio(periodo.fecha_inicio)}.
          </Text>

          {/* Signature */}
          <View style={s.sigBlock}>
            {contrato.supervisor.firma_url ? (
              <Image src={contrato.supervisor.firma_url} style={{ width: 150, height: 50, objectFit: 'contain' }} />
            ) : (
              <View style={s.sigSpace} />
            )}
            <View style={s.sigLine} />
            <Text style={s.sigName}>{contrato.supervisor.nombre_completo.toUpperCase()}</Text>
            {contrato.supervisor.cargo && (
              <Text style={s.sigCargo}>{contrato.supervisor.cargo}</Text>
            )}
            <Text style={s.sigCargo}>Supervisor</Text>
          </View>
        </View>


      </Page>
    </Document>
  )
}
