/**
 * Acta de Supervisión PDF — F-AM-040
 *
 * Exact replica of the Fredonia "FORMATO INFORME DE SUPERVISIÓN" document.
 * 2-page document with contract info, acceptance text, payment tracking,
 * CONSIDERANDO section, and supervisor signature.
 */

import React from 'react'
import path from 'path'
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import type { PDFData, PDFPagoHistorial } from './types'
import { calcularBaseCotizacionSS } from '@/lib/constants'
import { formatCedula } from '@/lib/format'

// Disable automatic hyphenation — prevents words being split mid-line
Font.registerHyphenationCallback(word => [word])

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

const MESES_LARGO = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]

/** '2026-02-02' → '02 de febrero de 2026' */
function formatDateLargo(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d} de ${MESES_LARGO[parseInt(m, 10) - 1]} de ${y}`
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

/** 'ENERO' → 'Enero' */
function capitalizeMes(mes: string): string {
  return mes.charAt(0).toUpperCase() + mes.slice(1).toLowerCase()
}

// ── Número a letras (días, 0-999) ──────────────────────────────
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
  const c = Math.floor(n / 100)
  const r = n % 100
  return r === 0 ? _CENT[c] : `${_CENT[c]} ${numerosALetras(r)}`
}

/**
 * Convierte un número entero (hasta 9.999.999) a texto en español en mayúsculas.
 * Usado para expresar la base de cotización a la seguridad social.
 * Ejemplos:
 *   1_800_000 → "UN MILLÓN OCHOCIENTOS MIL"
 *   1_750_905 → "UN MILLÓN SETECIENTOS CINCUENTA MIL NOVECIENTOS CINCO"
 */
function numeroALetrasLargo(n: number): string {
  if (n === 0) return 'CERO'
  const millones = Math.floor(n / 1_000_000)
  const resto    = n % 1_000_000
  const miles    = Math.floor(resto / 1_000)
  const centenas = resto % 1_000

  const partes: string[] = []
  if (millones > 0) partes.push(millones === 1 ? 'UN MILLÓN' : `${numerosALetras(millones)} MILLONES`)
  if (miles    > 0) partes.push(miles    === 1 ? 'MIL'       : `${numerosALetras(miles)} MIL`)
  if (centenas > 0) partes.push(numerosALetras(centenas))
  return partes.join(' ')
}

function calcDias(inicio: string, fin: string): number {
  const d1 = new Date(inicio + 'T00:00:00')
  const d2 = new Date(fin   + 'T00:00:00')
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000)
}

function pad5(val: string | number | null | undefined): string {
  if (!val && val !== 0) return '—'
  return String(val).padStart(5, '0')
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
    marginBottom: 4,
  },
  responsabilidadTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textAlign: 'center',
    padding: '3 8',
    backgroundColor: '#e8e8e8',
  },
  responsabilidadBody: {
    padding: '4 8 4 8',
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
    padding: '3 5',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    backgroundColor: '#f5f5f5',
  },
  val: {
    flex: 1,
    padding: '3 5',
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
  // Celda dividida (CDP/CRP con otrosí): original | otrosí
  infoSplitCell: {
    flex: 1,
    flexDirection: 'row',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  infoSplitSub: {
    flex: 1,
    padding: '3 2',
    fontSize: 9,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  infoSplitSubLast: {
    flex: 1,
    padding: '3 2',
    fontSize: 9,
    textAlign: 'center',
  },
  infoSplitSubHeader: {
    flex: 1,
    padding: '3 2',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  infoSplitSubHeaderLast: {
    flex: 1,
    padding: '3 2',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
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
    padding: '3 5',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  periodoDesde: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    padding: '3 5',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  periodoVal: {
    padding: '3 5',
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  // Celda izquierda combinada (planilla + pagos) — StyleSheet para que padding shorthand funcione
  mergedLbl: {
    width: '30%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    padding: '3 5',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  mergedRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    minHeight: 20,
  },
  // Payment table
  payRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  payLabel: {
    width: '30%',
    padding: '3 5',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  paySubLabel: {
    width: '30%',
    padding: '3 5',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textAlign: 'right',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  payDateCol: {
    width: '15%',
    padding: '3 5',
    fontSize: 9,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  paySubVal: {
    width: '25%',
    padding: '3 5',
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
    borderTopStyle: 'solid',
    paddingTop: 3,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  footerLeft: {
    flex: 1,
  },
  footerText: {
    fontSize: 7,
    color: '#666',
    lineHeight: 1.4,
  },
  footerPage: {
    fontSize: 7.5,
    color: '#000',
    textAlign: 'right',
    marginLeft: 8,
  },
})

// ─── Component ────────────────────────────────────────────────

export function ActaSupervisionPDF({ data }: { data: PDFData }) {
  const { contrato, periodo, pagosHistorial, obligaciones } = data

  // Plazo en días
  let plazoTexto = '—'
  if (contrato.fecha_inicio_contrato && contrato.fecha_fin_contrato) {
    const dias = calcDias(contrato.fecha_inicio_contrato, contrato.fecha_fin_contrato)
    plazoTexto = `${numerosALetras(dias)} (${dias}) DIAS`
  } else if (contrato.plazo_meses) {
    plazoTexto = `${contrato.duracion_letras || contrato.plazo_meses} (${contrato.plazo_meses}) MESES`
  }

  const ot = contrato.otrosi
  const fmtValorOt = (letras: string, monto: number) => `${letras.toUpperCase()} (${formatCOP(monto)})`
  // Con otrosí, "Valor del contrato" es el total con adición.
  const valorContratoTexto = ot
    ? fmtValorOt(ot.valor_total_letras, ot.valor_total_con_adicion)
    : contrato.valor_letras_total
      ? `${contrato.valor_letras_total.toUpperCase()} (${formatCOP(contrato.valor_total)})`
      : formatCOP(contrato.valor_total)

  // Base de cotización (IBC) = 40% del valor mensual del periodo, con piso SMLMV.
  // Prioridad:
  //  1) base_cotizacion_ss manual del periodo (si el admin la fijó en Avanzados).
  //  2) 40% del valor mensual EFECTIVO del periodo: el mayor entre valor_cobro
  //     (refleja el otrosí: $5.800.000 → IBC $2.320.000) y valor_mensual (evita
  //     que un mes proporcional baje el IBC por debajo del valor mensual real).
  const valorMensualEfectivo = Math.max(periodo.valor_cobro, contrato.valor_mensual)
  const baseValor = periodo.base_cotizacion_ss ?? calcularBaseCotizacionSS(valorMensualEfectivo)
  const baseCotizacionTexto = `${numeroALetrasLargo(baseValor)} PESOS ($ ${baseValor.toLocaleString('es-CO')})`

  // Pagos anteriores al mes actual → filas de la tabla de pagos
  const pagosAnteriores = (pagosHistorial ?? []).filter(p => p.acta_numero < periodo.numero)

  // Saldo por ejecutar: incluye el mes actual para descontarlo del total
  const pagosHastaAhora = (pagosHistorial ?? []).filter(p => p.acta_numero <= periodo.numero)
  const saldo = pagosHastaAhora.length > 0
    ? pagosHastaAhora[pagosHastaAhora.length - 1].saldo_pendiente
    : contrato.valor_total - (periodo.numero * contrato.valor_mensual)

  const periodoNum = String(periodo.numero).padStart(2, '0')

  return (
    <Document
      title={`Acta de Supervisión — Contrato ${contrato.numero}-${contrato.anio} — Periodo ${periodo.numero}`}
      author={contrato.supervisor.nombre_completo}
      subject="Informe de Supervisión"
      creator="Contratista Digital"
    >
      <Page size="A4" style={s.page}>

        {/* Header — fixed para que aparezca en todas las páginas */}
        <Image src={HEADER_PATH} style={{ width: '100%', marginBottom: 8 }} fixed />

        {/* Grado de Responsabilidad */}
        <View style={s.responsabilidad}>
          <Text style={s.responsabilidadTitle}>GRADO DE RESPONSABILIDAD</Text>
          <View style={s.responsabilidadBody}>
            <Text style={s.responsabilidadText}>
              Mediante la suscripción de la presente acta, el supervisor asume plena responsabilidad por la veracidad de la información en ella contenida
            </Text>
          </View>
        </View>

        {/* Info Header */}
        <View style={s.table}>
          <View style={{ ...s.row, backgroundColor: '#e8e8e8' }}>
            <Text style={{ ...s.val, fontFamily: 'Helvetica-Bold', fontSize: 9, textAlign: 'center' }}>
              INFORMACIÓN GENERAL DEL CONTRATO
            </Text>
          </View>

          {/* Row: INFORME No. | FECHA | CONTRATO | CDP | CRP
              Cuando hay otrosí, CDP y CRP se dividen en dos columnas
              (contrato | otrosí). Cabecera y datos comparten EXACTAMENTE la
              misma estructura de celdas/bordes para que las columnas alineen. */}
          <View style={s.infoHeaderRow}>
            <Text style={s.infoHeaderCell}>INFORME{'\n'}No.</Text>
            <Text style={s.infoHeaderCell}>FECHA INFORME{'\n'}(DD/MM/AA)</Text>
            <Text style={s.infoHeaderCell}>CONTRATO NÚMERO</Text>
            {ot && ot.cdp ? (
              <View style={s.infoSplitCell}>
                <Text style={s.infoSplitSubHeader}>CDP</Text>
                <Text style={s.infoSplitSubHeaderLast}>CDP{'\n'}OTROSÍ</Text>
              </View>
            ) : (
              <Text style={s.infoHeaderCell}>CDP</Text>
            )}
            {ot && ot.crp ? (
              <View style={{ ...s.infoSplitCell, borderRightWidth: 0 }}>
                <Text style={s.infoSplitSubHeader}>CRP</Text>
                <Text style={s.infoSplitSubHeaderLast}>CRP{'\n'}OTROSÍ</Text>
              </View>
            ) : (
              <Text style={s.infoHeaderCellLast}>CRP</Text>
            )}
          </View>
          <View style={s.infoDataRow}>
            <Text style={s.infoDataCell}>{periodoNum}</Text>
            <Text style={s.infoDataCell}>{formatDate(periodo.fecha_fin)}</Text>
            <Text style={s.infoDataCell}>{contrato.numero}-{contrato.anio}</Text>
            {ot && ot.cdp ? (
              <View style={s.infoSplitCell}>
                <Text style={s.infoSplitSub}>{pad5(contrato.cdp)}</Text>
                <Text style={s.infoSplitSubLast}>{pad5(ot.cdp)}</Text>
              </View>
            ) : (
              <Text style={s.infoDataCell}>{pad5(contrato.cdp)}</Text>
            )}
            {ot && ot.crp ? (
              <View style={{ ...s.infoSplitCell, borderRightWidth: 0 }}>
                <Text style={s.infoSplitSub}>{pad5(contrato.crp)}</Text>
                <Text style={s.infoSplitSubLast}>{pad5(ot.crp)}</Text>
              </View>
            ) : (
              <Text style={s.infoDataCellLast}>{pad5(contrato.crp)}</Text>
            )}
          </View>

          {/* CONTRATISTA */}
          <View style={s.personRow}>
            <Text style={s.personLabel}>CONTRATISTA</Text>
            <Text style={s.personIdLabel}>IDENTIFICACIÓN</Text>
          </View>
          <View style={s.personRow}>
            <Text style={s.personName}>{contrato.contratista.nombre_completo.toUpperCase()}</Text>
            <Text style={s.personId}>{formatCedula(contrato.contratista.cedula)}</Text>
          </View>

          {/* SUPERVISOR */}
          <View style={s.personRow}>
            <Text style={s.personLabel}>SUPERVISOR</Text>
            <Text style={s.personIdLabel}>IDENTIFICACIÓN</Text>
          </View>
          <View style={s.personRow}>
            <Text style={s.personName}>{contrato.supervisor.nombre_completo.toUpperCase()}</Text>
            <Text style={s.personId}>{contrato.supervisor.cedula ? formatCedula(contrato.supervisor.cedula) : '—'}</Text>
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
            <View style={s.val}><Text>{contrato.fecha_inicio_contrato ? formatDateLargo(contrato.fecha_inicio_contrato) : '—'}</Text></View>
          </View>

          {ot && (
            <View style={s.row}>
              <View style={s.lbl}><Text>Fecha de inicio otrosí</Text></View>
              <View style={s.val}><Text>{formatDateLargo(ot.fecha_inicio)}</Text></View>
            </View>
          )}

          <View style={s.periodoRow}>
            <View style={s.periodoLabel}><Text>Período del informe</Text></View>
            <Text style={s.periodoDesde}>Desde</Text>
            <Text style={s.periodoVal}>{formatDate(periodo.fecha_inicio)}</Text>
            <Text style={s.periodoDesde}>Hasta</Text>
            <Text style={{ ...s.periodoVal, borderRightWidth: 0 }}>{formatDate(periodo.fecha_fin)}</Text>
          </View>

          {ot ? (
            <>
              <View style={s.row}>
                <View style={s.lbl}><Text>Valor inicial del contrato</Text></View>
                <View style={s.val}><Text>{fmtValorOt(ot.valor_inicial_letras, ot.valor_inicial)}</Text></View>
              </View>
              <View style={s.row}>
                <View style={s.lbl}><Text>Valor Adición</Text></View>
                <View style={s.val}><Text>{fmtValorOt(ot.valor_adicion_letras, ot.valor_adicion)}.</Text></View>
              </View>
              <View style={s.row}>
                <View style={s.lbl}><Text>Valor Total del Contrato</Text></View>
                <View style={s.val}><Text>{valorContratoTexto}.</Text></View>
              </View>
            </>
          ) : (
            <View style={s.row}>
              <View style={s.lbl}><Text>Valor del contrato</Text></View>
              <View style={s.val}><Text>{valorContratoTexto}</Text></View>
            </View>
          )}

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
              {obligaciones.length === 0 ? (
                <Text style={{ lineHeight: 1.3, fontStyle: 'italic', color: '#555' }}>
                  El contrato no tiene obligaciones registradas para este periodo.
                </Text>
              ) : (
                obligaciones.map((obl, i) => {
                  const nota = obl.nota?.trim()
                  // Precedencia: nota → aprobada (default) → desmarcada (neutro).
                  const textoSupervision = nota
                    ? nota
                    : obl.aprobada
                      ? `De acuerdo con la verificación realizada por la supervisión, el contratista dio cumplimiento a la obligación contractual relacionada con "${obl.descripcion}".`
                      : `La obligación contractual relacionada con "${obl.descripcion}" se encuentra pendiente de verificación por parte de la supervisión.`
                  return (
                    <View
                      key={i}
                      wrap={false}
                      style={{ marginBottom: i === obligaciones.length - 1 ? 0 : 5 }}
                    >
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5, lineHeight: 1.3 }}>
                        {i + 1}. {obl.descripcion}
                      </Text>
                      <Text style={{ marginTop: 1, lineHeight: 1.3 }}>
                        <Text style={{ fontFamily: 'Helvetica-Bold' }}>Supervisión: </Text>
                        <Text style={nota ? { fontStyle: 'italic' } : undefined}>{textoSupervision}</Text>
                      </Text>
                    </View>
                  )
                })
              )}

              <Text style={{ marginTop: 6, lineHeight: 1.3 }}>
                Además acreditó el pago de la seguridad social.
              </Text>

              {periodo.observacion_supervisor ? (
                <View style={{ marginTop: 6, borderTopWidth: 0.5, borderTopColor: '#bbb', paddingTop: 5 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#444', marginBottom: 2 }}>
                    Observación del supervisor:
                  </Text>
                  <Text style={{ fontSize: 8.5, fontStyle: 'italic', lineHeight: 1.4, color: '#222' }}>
                    {periodo.observacion_supervisor}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Modifications */}
          <View style={s.row}>
            <View style={s.lbl}><Text>Modificaciones o adiciones efectuadas al contrato</Text></View>
            <View style={s.val}>
              {/* Header label */}
              <View style={{ borderWidth: 1, borderColor: '#000', marginBottom: 3 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, textAlign: 'center', padding: '2 4', backgroundColor: '#e8e8e8' }}>
                  TIPO DE MODIFICACIÓN
                </Text>
                {/* Option cells */}
                <View style={{ flexDirection: 'row' }}>
                  {(['Prórroga', 'Adición', 'Modificatorio', 'Aclaratorio'] as const).map((opt, i) => (
                    <Text
                      key={opt}
                      style={{
                        flex: 1,
                        fontSize: 7.5,
                        textAlign: 'center',
                        padding: '3 2',
                        borderTopWidth: 1,
                        borderTopColor: '#000',
                        borderRightWidth: i < 3 ? 1 : 0,
                        borderRightColor: '#000',
                      } as any}
                    >
                      {opt}
                    </Text>
                  ))}
                </View>
                {/* Value row — marca "X" en el tipo del otrosí si existe */}
                <View style={{ flexDirection: 'row' }}>
                  {(['prorroga', 'adicion', 'modificatorio', 'aclaratorio'] as const).map((tipoOpt, i) => (
                    <View
                      key={i}
                      style={{
                        flex: 1,
                        minHeight: 10,
                        borderTopWidth: 1,
                        borderTopColor: '#000',
                        borderRightWidth: i < 3 ? 1 : 0,
                        borderRightColor: '#000',
                        alignItems: 'center',
                        justifyContent: 'center',
                      } as any}
                    >
                      {ot && ot.tipo === tipoOpt && (
                        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5 }}>(X)</Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
              <Text style={{ textAlign: 'center', fontSize: 8.5 }}>{ot ? '' : 'Ninguna'}</Text>
            </View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Dificultades técnicas</Text></View>
            <View style={{ ...s.val, justifyContent: 'center' } as any}><Text style={{ textAlign: 'center' }}>Ninguna</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Base de cotización a la Seguridad Social</Text></View>
            <View style={s.val}><Text>{baseCotizacionTexto}</Text></View>
          </View>

          {/* Planilla — cada fila es independiente y auto-contenida.
               El patrón anterior (celda izquierda fija + N sub-filas a la derecha dentro
               de flex:1) hace que @react-pdf/renderer recorte las filas intermedias al
               calcular la altura del contenedor flex-row externo. La solución es renderizar
               cada periodo como una fila completa, mostrando la etiqueta sólo en la primera
               para simular visualmente la celda combinada. */}
          {(pagosHistorial ?? []).map((pago, idx, arr) => {
            const esUltima = idx === arr.length - 1
            return (
              <View
                key={pago.acta_numero}
                wrap={false}
                style={{
                  flexDirection: 'row',
                  borderBottomWidth: esUltima ? 1 : 1,
                  borderBottomColor: '#000',
                  minHeight: 20,
                }}
              >
                {/* Columna izquierda: etiqueta solo en la primera fila */}
                <View style={{
                  ...s.mergedLbl,
                  justifyContent: 'center',
                  borderBottomWidth: 0,
                }}>
                  {idx === 0 && (
                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5 }}>Numero de planilla</Text>
                  )}
                </View>
                {/* Número de planilla */}
                <View style={{ flex: 1, padding: '3 5', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9 }}>{pago.numero_planilla ?? '—'}</Text>
                </View>
                {/* Periodo de Cotización */}
                <View style={{ width: '32%', padding: '3 5', backgroundColor: '#f5f5f5', borderLeftWidth: 1, borderLeftColor: '#000', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5 }}>Periodo de Cotización</Text>
                </View>
                {/* Mes de cotización (puede diferir del mes del informe por "mes vencido") */}
                <View style={{ width: '18%', padding: '3 5', borderLeftWidth: 1, borderLeftColor: '#000', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9 }}>{capitalizeMes(pago.cotizacion_mes ?? pago.mes)}</Text>
                </View>
              </View>
            )
          })}

          {/* Pagos realizados — wrap=false para no partir entre páginas */}
          <View style={s.mergedRow} wrap={false}>
            {/* Etiqueta izquierda — usa StyleSheet para que justifyContent funcione */}
            <View style={s.mergedLbl}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5 }}>Pagos realizados en virtud del contrato</Text>
            </View>
            {/* Sub-filas derechas */}
            <View style={{ flex: 1 }}>
              {/* Valor total — desc+fecha fusionados (64%), Valor+monto fusionados (36%) */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', minHeight: 20 }}>
                <View style={{ width: '64%', padding: '3 5', fontFamily: 'Helvetica-Bold', fontSize: 8.5, borderRightWidth: 1, borderRightColor: '#000' }}>
                  <Text>Valor total contrato</Text>
                </View>
                <View style={{ width: '36%', padding: '3 5', fontSize: 9, textAlign: 'right' }}>
                  <Text>{formatCOP(ot ? ot.valor_total_con_adicion : contrato.valor_total)}</Text>
                </View>
              </View>
              {/* Pago N — solo pagos anteriores al informe actual */}
              {pagosAnteriores.map((pago) => (
                <View key={pago.acta_numero} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', minHeight: 20 }}>
                  <View style={{ width: '42%', padding: '3 5', fontSize: 9, borderRightWidth: 1, borderRightColor: '#000' }}>
                    <Text>Pago {pago.acta_numero}</Text>
                  </View>
                  <View style={{ width: '22%', padding: '3 5', fontSize: 9, textAlign: 'center', borderRightWidth: 1, borderRightColor: '#000' }}>
                    <Text>{pago.fecha_pago}</Text>
                  </View>
                  <View style={{ width: '12%', padding: '3 5', fontFamily: 'Helvetica-Bold', fontSize: 8, textAlign: 'center', borderRightWidth: 1, borderRightColor: '#000', backgroundColor: '#f5f5f5' }}>
                    <Text>Valor</Text>
                  </View>
                  <View style={{ width: '24%', padding: '3 5', fontSize: 9, textAlign: 'right' }}>
                    <Text>{formatCOP(pago.valor_acta)}</Text>
                  </View>
                </View>
              ))}
              {/* Saldo — desc+fecha+Valor fusionados (76%), monto (24%) */}
              <View style={{ flexDirection: 'row', minHeight: 20 }}>
                <View style={{ width: '76%', padding: '3 5', fontFamily: 'Helvetica-Bold', fontSize: 8.5, borderRightWidth: 1, borderRightColor: '#000' }}>
                  <Text>Saldo por ejecutar</Text>
                </View>
                <View style={{ width: '24%', padding: '3 5', fontSize: 9, textAlign: 'right' }}>
                  <Text>{formatCOP(Math.max(0, saldo))}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={s.rowLast}>
            <View style={s.lbl}><Text>Conclusiones y recomendaciones por parte del supervisor</Text></View>
            <View style={s.val}>
              <Text style={{ fontStyle: periodo.observacion_supervisor ? 'italic' : 'normal', lineHeight: 1.4 }}>
                {periodo.observacion_supervisor ?? 'Ninguna'}
              </Text>
            </View>
          </View>
        </View>

        {/* CONSIDERANDO — flows naturally to page 2 */}
        <View style={s.considerando}>
          <Text style={s.considerandoTitle}>CONSIDERANDO</Text>

          <Text style={s.considerandoText}>
            Se firma la presente acta en virtud de que las actividades efectuadas como parte de las obligaciones contempladas en el contrato fueron recibidas a entera satisfacción por parte del supervisor.
          </Text>

          <Text style={s.considerandoText}>Se anexa para el correspondiente pago:</Text>

          {/* wrap={false} on each bullet: the dot and its text always stay together */}
          <View style={s.bullet} wrap={false}>
            <Text style={s.bulletDot}>■</Text>
            <Text style={s.bulletText}>
              Documento que acredita que el contratista se encuentra a paz y salvo por concepto del pago de aportes a los sistemas de seguridad social en salud, pensiones, ARP y parafiscales, de él y de sus trabajadores, cuando a ello haya lugar, de conformidad con lo dispuesto en el Artículo 23 de la Ley 1150 de 2007.{' '}
              <Text style={s.considerandoItalic}>
                (Si se trata de un contrato suscrito con persona natural, el ingreso base de cotización equivaldrá al 40% del valor mensual del contrato, sin que la cotización sea inferior a un IBC, del SMLMV).
              </Text>
            </Text>
          </View>

          <View style={s.bullet} wrap={false}>
            <Text style={s.bulletDot}>■</Text>
            <Text style={s.bulletText}>
              Informe de actividades y/o cuenta de cobro presentado por el contratista.
            </Text>
          </View>

          {/* "Para constancia..." + signature block are indivisible:
              if they don't fit together they move as a unit to the next page. */}
          <View wrap={false}>
            <Text style={s.considerandoText}>
              Para constancia de lo anterior, firma el presente informe de supervisión a {fechaFirmaTexto(periodo.fecha_fin)}
            </Text>

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
          </View>
        </View>

        {/* Footer — único elemento fixed para garantizar repetición en todas las páginas */}
        <View style={s.footer} fixed>
          <View style={s.footerRow}>
            <View style={s.footerLeft}>
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
            />
          </View>
        </View>

      </Page>
    </Document>
  )
}
