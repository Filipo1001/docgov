/**
 * Acta de Supervisión PDF — F-AM-040
 *
 * Exact replica of the Fredonia "FORMATO INFORME DE SUPERVISIÓN" document.
 * 2-page document with contract info, acceptance text, payment tracking,
 * CONSIDERANDO section, and supervisor signature.
 */

import React from 'react'
import path from 'path'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { PDFData, PDFPagoHistorial } from './types'

const HEADER_PATH = path.join(process.cwd(), 'public', 'header-infor-super.png')

// ─── Helpers ──────────────────────────────────────────────────

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function formatCOP(n: number): string {
  return `$ ${n.toLocaleString('es-CO')}`
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fechaFirmaTexto(iso: string): string {
  const [y, m, d] = iso.split('-')
  const dia = parseInt(d)
  const mes = MESES[parseInt(m) - 1]
  return `los ${dia} días del mes de ${mes} de ${y}`
}

function mesNombre(iso: string): string {
  const m = parseInt(iso.split('-')[1])
  return MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)
}

function baseCotizacion(valorMensual: number): { texto: string; valor: number } {
  const base = Math.round(valorMensual * 0.4)
  return {
    valor: base,
    texto: formatCOP(base),
  }
}

// ─── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: '#000',
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 44,
  },
  // Responsibility
  responsabilidad: {
    borderWidth: 1,
    borderColor: '#000',
    padding: '6 8',
    marginBottom: 4,
  },
  responsabilidadTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textAlign: 'center',
    marginBottom: 4,
  },
  responsabilidadText: {
    fontSize: 8.5,
    lineHeight: 1.4,
  },
  // Table
  table: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    minHeight: 20,
  },
  rowLast: {
    flexDirection: 'row',
    minHeight: 20,
  },
  lbl: {
    width: '30%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    backgroundColor: '#f5f5f5',
  },
  val: {
    flex: 1,
    padding: '4 6',
    fontSize: 9,
    lineHeight: 1.4,
  },
  // Info header row (INFORME No. | FECHA | CONTRATO | CDP | CRP)
  infoHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    backgroundColor: '#e8e8e8',
  },
  infoHeaderCell: {
    flex: 1,
    padding: '3 4',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  infoHeaderCellLast: {
    flex: 1,
    padding: '3 4',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    textAlign: 'center',
  },
  infoDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  infoDataCell: {
    flex: 1,
    padding: '3 4',
    fontSize: 9,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  infoDataCellLast: {
    flex: 1,
    padding: '3 4',
    fontSize: 9,
    textAlign: 'center',
  },
  // Contratista/Supervisor row
  personRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  personLabel: {
    width: '50%',
    padding: '3 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
    backgroundColor: '#e8e8e8',
  },
  personIdLabel: {
    width: '50%',
    padding: '3 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textAlign: 'center',
    backgroundColor: '#e8e8e8',
  },
  personName: {
    width: '50%',
    padding: '3 6',
    fontSize: 9,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  personId: {
    width: '50%',
    padding: '3 6',
    fontSize: 9,
    textAlign: 'center',
  },
  // Periodo row
  periodoRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  periodoLabel: {
    width: '30%',
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  periodoDesde: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    padding: '4 6',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  periodoVal: {
    padding: '4 6',
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  // Payment table
  payRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  payLabel: {
    width: '30%',
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  paySubLabel: {
    width: '35%',
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textAlign: 'right',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  paySubVal: {
    width: '35%',
    padding: '4 6',
    fontSize: 9,
    textAlign: 'right',
  },
  // Considerando
  considerando: {
    marginTop: 10,
    paddingHorizontal: 6,
  },
  considerandoTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 8,
  },
  considerandoText: {
    fontSize: 9,
    lineHeight: 1.6,
    marginBottom: 6,
    textAlign: 'justify',
  },
  considerandoItalic: {
    fontSize: 8.5,
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 12,
    fontSize: 9,
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.5,
  },
  // Signature
  sigBlock: {
    marginTop: 30,
    paddingLeft: 6,
  },
  sigSpace: {
    height: 40,
  },
  sigLine: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    width: '55%',
    marginBottom: 4,
  },
  sigName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginBottom: 2,
  },
  sigCargo: {
    fontSize: 9,
    marginBottom: 2,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 44,
    right: 44,
    borderTopWidth: 0.5,
    borderTopColor: '#aaa',
    paddingTop: 3,
  },
  footerText: {
    fontSize: 7,
    color: '#666',
    lineHeight: 1.4,
  },
  footerPage: {
    position: 'absolute',
    bottom: 14,
    right: 44,
    fontSize: 7.5,
    color: '#000',
  },
})

// ─── Component ────────────────────────────────────────────────

export function ActaSupervisionPDF({ data }: { data: PDFData }) {
  const { contrato, periodo, pagosHistorial } = data

  const plazoTexto = contrato.plazo_meses
    ? `${contrato.duracion_letras || contrato.plazo_meses} (${contrato.plazo_meses}) meses`
    : '—'

  const valorContratoTexto = contrato.valor_letras_total
    ? `${contrato.valor_letras_total.toUpperCase()} (${formatCOP(contrato.valor_total)})`
    : formatCOP(contrato.valor_total)

  const base = baseCotizacion(contrato.valor_mensual)
  const saldo = contrato.valor_total - (periodo.numero * contrato.valor_mensual)

  const periodoNum = String(periodo.numero).padStart(2, '0')

  return (
    <Document
      title={`Acta de Supervisión — Contrato ${contrato.numero}-${contrato.anio} — Periodo ${periodo.numero}`}
      author={contrato.supervisor.nombre_completo}
      subject="Informe de Supervisión"
      creator="DocGov"
    >
      <Page size="A4" style={s.page}>

        {/* Header */}
        <Image src={HEADER_PATH} style={{ width: '100%', marginBottom: 8 }} />

        {/* Grado de Responsabilidad */}
        <View style={s.responsabilidad}>
          <Text style={s.responsabilidadTitle}>GRADO DE RESPONSABILIDAD</Text>
          <Text style={s.responsabilidadText}>
            Mediante la suscripción de la presente acta, el supervisor asume plena responsabilidad por la veracidad de la información en ella contenida
          </Text>
        </View>

        {/* Info Header */}
        <View style={s.table}>
          <View style={{ ...s.row, backgroundColor: '#e8e8e8' }}>
            <Text style={{ ...s.val, fontFamily: 'Helvetica-Bold', fontSize: 9, textAlign: 'center' }}>
              INFORMACIÓN GENERAL DEL CONTRATO
            </Text>
          </View>

          {/* Row: INFORME No. | FECHA | CONTRATO | CDP | CRP */}
          <View style={s.infoHeaderRow}>
            <Text style={s.infoHeaderCell}>INFORME{'\n'}No.</Text>
            <Text style={s.infoHeaderCell}>FECHA INFORME{'\n'}(DD/MM/AA)</Text>
            <Text style={s.infoHeaderCell}>CONTRATO NÚMERO</Text>
            <Text style={s.infoHeaderCell}>CDP</Text>
            <Text style={s.infoHeaderCellLast}>CRP</Text>
          </View>
          <View style={s.infoDataRow}>
            <Text style={s.infoDataCell}>{periodoNum}</Text>
            <Text style={s.infoDataCell}>{formatDate(periodo.fecha_fin)}</Text>
            <Text style={s.infoDataCell}>{contrato.numero}-{contrato.anio}</Text>
            <Text style={s.infoDataCell}>{contrato.cdp || '—'}</Text>
            <Text style={s.infoDataCellLast}>{contrato.crp || '—'}</Text>
          </View>

          {/* CONTRATISTA */}
          <View style={s.personRow}>
            <Text style={s.personLabel}>CONTRATISTA</Text>
            <Text style={s.personIdLabel}>IDENTIFICACIÓN</Text>
          </View>
          <View style={s.personRow}>
            <Text style={s.personName}>{contrato.contratista.nombre_completo.toUpperCase()}</Text>
            <Text style={s.personId}>{contrato.contratista.cedula}</Text>
          </View>

          {/* SUPERVISOR */}
          <View style={s.personRow}>
            <Text style={s.personLabel}>SUPERVISOR</Text>
            <Text style={s.personIdLabel}>IDENTIFICACIÓN</Text>
          </View>
          <View style={s.personRow}>
            <Text style={s.personName}>{contrato.supervisor.nombre_completo.toUpperCase()}</Text>
            <Text style={s.personId}>{contrato.supervisor.cedula || '—'}</Text>
          </View>

          {/* OBJETO */}
          <View style={{ ...s.row, backgroundColor: '#e8e8e8' }}>
            <Text style={{ ...s.val, fontFamily: 'Helvetica-Bold', fontSize: 8.5, textAlign: 'center' }}>
              OBJETO DEL CONTRATO
            </Text>
          </View>
          <View style={s.row}>
            <Text style={{ ...s.val, fontSize: 9, textAlign: 'center', lineHeight: 1.5 }}>
              "{contrato.objeto.toUpperCase()}"
            </Text>
          </View>

          {/* Contract details */}
          <View style={s.row}>
            <View style={s.lbl}><Text>Fecha de inicio contrato</Text></View>
            <View style={s.val}><Text>{contrato.fecha_inicio_contrato ? formatDate(contrato.fecha_inicio_contrato).split('/').reverse().join(' de ') : '—'}</Text></View>
          </View>

          <View style={s.periodoRow}>
            <View style={s.periodoLabel}><Text>Período del informe</Text></View>
            <Text style={s.periodoDesde}>Desde</Text>
            <Text style={s.periodoVal}>{formatDate(periodo.fecha_inicio)}</Text>
            <Text style={s.periodoDesde}>Hasta</Text>
            <Text style={{ ...s.periodoVal, borderRightWidth: 0 }}>{formatDate(periodo.fecha_fin)}</Text>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Valor del contrato</Text></View>
            <View style={s.val}><Text>{valorContratoTexto}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Plazo de ejecución del contrato</Text></View>
            <View style={s.val}><Text>{plazoTexto}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Número del contrato</Text></View>
            <View style={s.val}><Text>{contrato.numero}-{contrato.anio}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Aceptación de las actividades realizadas</Text></View>
            <View style={s.val}>
              <Text style={{ lineHeight: 1.5 }}>
                El/La contratista cumplió satisfactoriamente con todas las responsabilidades asignadas y dedicó toda su capacidad en la realización de las actividades en el periodo, por lo cual su aporte en el componente de gestión del talento humano permitió que la entidad generara capacidades para el desarrollo de las acciones misionales.
              </Text>
              <Text style={{ marginTop: 6, lineHeight: 1.5 }}>
                Además acreditó el pago de la seguridad social
              </Text>
            </View>
          </View>

          {/* Modifications */}
          <View style={s.row}>
            <View style={s.lbl}><Text>Modificaciones o adiciones efectuadas al contrato</Text></View>
            <View style={s.val}>
              <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, flex: 1, textAlign: 'center' }}>TIPO DE MODIFICACIÓN</Text>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, flex: 1, textAlign: 'center' }}>Prórroga</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, flex: 1, textAlign: 'center' }}>Adición</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, flex: 1, textAlign: 'center' }}>Modificatorio</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, flex: 1, textAlign: 'center' }}>Aclaratorio</Text>
              </View>
              <Text style={{ textAlign: 'center' }}>Ninguna</Text>
            </View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Dificultades técnicas</Text></View>
            <View style={s.val}><Text>Ninguna</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Base de cotización a la Seguridad Social</Text></View>
            <View style={s.val}><Text>{base.texto}</Text></View>
          </View>

          {/* Planilla */}
          <View style={s.row}>
            <View style={s.lbl}><Text>Numero de planilla</Text></View>
            <View style={{ width: '35%', padding: '4 6', borderRightWidth: 1, borderRightColor: '#000', fontSize: 9 }}>
              <Text>{periodo.numero_planilla || '—'}</Text>
            </View>
            <View style={{ padding: '4 6', fontFamily: 'Helvetica-Bold', fontSize: 8.5, borderRightWidth: 1, borderRightColor: '#000', backgroundColor: '#f5f5f5' }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5 }}>Periodo de cotización</Text>
            </View>
            <View style={{ padding: '4 6', fontSize: 9, flex: 1 }}>
              <Text>{mesNombre(periodo.fecha_inicio)}</Text>
            </View>
          </View>

          {/* Payments */}
          <View style={s.payRow}>
            <View style={s.payLabel}><Text>Pagos realizados en virtud del contrato</Text></View>
            <View style={s.paySubLabel}><Text>Valor total contrato</Text></View>
            <View style={s.paySubVal}><Text>{formatCOP(contrato.valor_total)}</Text></View>
          </View>
          <View style={s.payRow}>
            <View style={s.payLabel}><Text> </Text></View>
            <View style={s.paySubLabel}><Text>Saldo por ejecutar</Text></View>
            <View style={s.paySubVal}><Text>{formatCOP(Math.max(0, saldo))}</Text></View>
          </View>

          <View style={s.rowLast}>
            <View style={s.lbl}><Text>Conclusiones y recomendaciones por parte del supervisor</Text></View>
            <View style={s.val}><Text>Ninguna</Text></View>
          </View>
        </View>

        {/* CONSIDERANDO */}
        <View style={s.considerando}>
          <Text style={s.considerandoTitle}>CONSIDERANDO</Text>

          <Text style={s.considerandoText}>
            Se firma la presente acta en virtud de que las actividades efectuadas como parte de las obligaciones contempladas en el contrato fueron recibidas a entera satisfacción por parte del supervisor.
          </Text>

          <Text style={s.considerandoText}>Se anexa para el correspondiente pago:</Text>

          <View style={s.bullet}>
            <Text style={s.bulletDot}>■</Text>
            <Text style={s.bulletText}>
              Documento que acredita que el contratista se encuentra a paz y salvo por concepto del pago de aportes a los sistemas de seguridad social en salud, pensiones, ARP y parafiscales, de él y de sus trabajadores, cuando a ello haya lugar, de conformidad con lo dispuesto en el Artículo 23 de la Ley 1150 de 2007.{' '}
              <Text style={s.considerandoItalic}>
                (Si se trata de un contrato suscrito con persona natural, el ingreso base de cotización equivaldrá al 40% del valor mensual del contrato, sin que la cotización sea inferior a un IBC, del SMLMV).
              </Text>
            </Text>
          </View>

          <View style={s.bullet}>
            <Text style={s.bulletDot}>■</Text>
            <Text style={s.bulletText}>
              Informe de actividades y/o cuenta de cobro presentado por el contratista.
            </Text>
          </View>

          <Text style={s.considerandoText}>
            Para constancia de lo anterior, firma el presente informe de supervisión a {fechaFirmaTexto(periodo.fecha_fin)}
          </Text>
        </View>

        {/* Signature */}
        <View style={s.sigBlock}>
          {contrato.supervisor.firma_url ? (
            <Image src={contrato.supervisor.firma_url} style={{ width: 150, height: 50, objectFit: 'contain' }} />
          ) : (
            <View style={s.sigSpace} />
          )}
          <View style={s.sigLine} />
          <Text style={s.sigName}>Nombre: {contrato.supervisor.nombre_completo.toUpperCase()}</Text>
          {contrato.supervisor.cargo && (
            <Text style={s.sigCargo}>{contrato.supervisor.cargo}</Text>
          )}
          <Text style={s.sigCargo}>Supervisor Contrato No {contrato.numero}-{contrato.anio}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Municipio de Fredonia – Centro Administrativo Municipal "Rodrigo Arenas Betancourt"
          </Text>
          <Text style={s.footerText}>
            Teléfono: 8401264 / Dirección: Calle 50 N°50-58 / Código Postal: 055070
          </Text>
          <Text style={s.footerText}>
            Email: contactenos@fredonia-antioquia.gov.co / Sitio web: www.fredonia-antioquia.gov.co
          </Text>
        </View>
        <Text
          style={s.footerPage}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />

      </Page>
    </Document>
  )
}
