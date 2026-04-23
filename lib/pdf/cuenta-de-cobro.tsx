/**
 * Cuenta de Cobro PDF — matches the real Fredonia document exactly.
 *
 * Real document structure (extracted via coordinate analysis):
 * - Header: 3 centered bold lines (title, municipality, NIT)
 * - "DEBE A:" centered bold
 * - 12-row form table (label left ~40% | value right ~60%)
 * - Last table row has a nested 4-column sub-table for bank info
 * - Signature block: "Firma Contratista:" label → long space → underline
 *   → name / CC / Dirección / Teléfono all in BOLD
 * - VoBo. Supervisor: label + blank line (no name pre-printed)
 * - NO footer, NO page numbers
 */

import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { PDFData } from './types'
import { formatCedula } from '@/lib/format'

// Mismas reglas que el Informe de Actividades
const ESTADOS_FIRMA_CONTRATISTA = new Set(['enviado', 'revision', 'aprobado', 'radicado'])
const ESTADOS_FIRMA_SUPERVISOR  = new Set(['aprobado', 'radicado'])

// ─── Date helpers ─────────────────────────────────────────────

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]

/** "2026-02-28" → "FEBRERO 28 DE 2026" */
function fechaMayus(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${MESES[parseInt(m) - 1]} ${parseInt(d)} DE ${y}`
}

/** "2026-02-28" → "02" (no leading zero trim so "02" stays "02") */
function dd(iso: string): string { return iso.split('-')[2] }

/** "2026-02-28" → "FEBRERO" */
function mmNombre(iso: string): string { return MESES[parseInt(iso.split('-')[1]) - 1] }

/** "2026-02-28" → "2026" */
function yyyy(iso: string): string { return iso.split('-')[0] }

/** Calendar days between two ISO dates → e.g. "245 DÍAS" */
function calcDias(inicio?: string, fin?: string): string {
  if (!inicio || !fin) return '—'
  const diff = Math.round(
    (new Date(fin).getTime() - new Date(inicio).getTime()) / 86_400_000
  )
  return diff > 0 ? `${diff} DÍAS` : '—'
}

/** COP currency: $24.000.000 (Colombian dot separator) */
function formatCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(n)
}

/**
 * Elimina cualquier sufijo de moneda que ya venga en el texto
 * (e.g. "M/L", "M/CTE", "PESOS M/L", "DE PESOS M/CTE") antes de aplicar el estándar.
 */
function sinSufijoMoneda(texto: string): string {
  return texto.replace(/\s+(DE\s+PESOS\s+|PESOS\s+)?M\/[A-Z]+/gi, '').trim()
}

// ─── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: '#000',
    paddingTop: 30,
    paddingBottom: 30,
    paddingHorizontal: 44,
  },

  // ── Header (3 centered lines)
  h1: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 2,
  },
  h2: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    textAlign: 'center',
    marginBottom: 2,
  },
  h3: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 8,
  },
  debeA: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    textAlign: 'center',
    marginBottom: 6,
  },

  // ── Form table
  table: {
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  rowLast: {
    flexDirection: 'row',
  },
  lbl: {
    width: '40%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '3 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    lineHeight: 1.35,
  },
  val: {
    flex: 1,
    padding: '3 6',
    fontSize: 9.5,
    lineHeight: 1.35,
  },

  // ── Bank sub-row (nested 4 columns inside the last table row)
  bankCell: {
    flex: 1,
    flexDirection: 'row',
  },
  bankSubLbl: {
    width: '34%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '3 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    lineHeight: 1.35,
  },
  bankSubVal: {
    width: '30%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '3 6',
    fontSize: 9.5,
    lineHeight: 1.35,
  },
  bankNoLbl: {
    width: '10%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    padding: '3 4',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textAlign: 'center',
  },
  bankNoVal: {
    flex: 1,
    padding: '3 6',
    fontSize: 9.5,
  },

  // ── Signature section
  sigIntro: {
    fontSize: 10,
    marginBottom: 0,
  },
  sigSpace: {
    height: 38,
  },
  sigLine: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    width: '65%',
    marginBottom: 4,
  },
  // All sig details are BOLD in the real document
  sigName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  sigDetail: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginBottom: 2,
  },

  // ── Firma images
  firmaImgContratista: {
    width: '50%',
    height: 48,
    objectFit: 'contain',
    marginBottom: 0,
  },
  firmaImgSupervisor: {
    height: 40,
    width: 120,
    objectFit: 'contain',
    marginBottom: 3,
  },

  // ── Retención notice
  retencionNotice: {
    fontSize: 8.5,
    lineHeight: 1.35,
    textAlign: 'justify',
    marginBottom: 10,
    color: '#111',
  },

  // ── VoBo / supervisor block
  voBoSection: {
    marginTop: 10,
  },
  voBoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voBoLbl: {
    fontSize: 10,
    marginRight: 8,
    flexShrink: 0,
  },
  voBoLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  voBoUnderline: {
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    width: '65%',
    marginTop: 4,
    marginBottom: 4,
  },
  voBoName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  voBoDetail: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    marginBottom: 2,
  },
})

// ─── Component ────────────────────────────────────────────────

export function CuentaDeCobroPDF({ data }: { data: PDFData }) {
  const { municipio, contrato, periodo } = data

  const mostrarFirmaContratista =
    ESTADOS_FIRMA_CONTRATISTA.has(periodo.estado) && !!contrato.contratista.firma_url
  const mostrarFirmaSupervisor =
    ESTADOS_FIRMA_SUPERVISOR.has(periodo.estado) && !!contrato.supervisor.firma_url

  // Period value — "TRES MILLONES DE PESOS M/L ($ 3.000.000)"
  const valorLetras = periodo.valor_letras ?? contrato.valor_letras_mensual
  const valorPeriodo = valorLetras
    ? `${sinSufijoMoneda(valorLetras.toUpperCase())} DE PESOS M/L (${formatCOP(periodo.valor_cobro)})`
    : formatCOP(periodo.valor_cobro)

  // Total contract value — same standard
  const valorTotal = contrato.valor_letras_total
    ? `${sinSufijoMoneda(contrato.valor_letras_total.toUpperCase())} DE PESOS M/L (${formatCOP(contrato.valor_total)})`
    : formatCOP(contrato.valor_total)

  // Plazo — calendar days between contract start and end
  const plazo = calcDias(contrato.fecha_inicio_contrato, contrato.fecha_fin_contrato)

  // Period range — "DEL 02 AL 28 DE FEBRERO DE 2026"
  const periodoTexto = `DEL ${dd(periodo.fecha_inicio)} AL ${dd(periodo.fecha_fin)} DE ${mmNombre(periodo.fecha_fin)} DE ${yyyy(periodo.fecha_fin)}`

  // CC number (zero-padded)
  const ccNum = String(periodo.numero).padStart(2, '0')

  // Municipality header
  const municipioHeader = municipio.departamento
    ? `EL MUNICIPIO DE ${municipio.nombre.toUpperCase()} ${municipio.departamento.toUpperCase()}`
    : `EL MUNICIPIO DE ${municipio.nombre.toUpperCase()}`

  // Bank + account type on separate display lines
  const bancoNombre = contrato.banco.toUpperCase()
  const cuentaTipo = `CUENTA\n${contrato.tipo_cuenta.toUpperCase()}`

  return (
    <Document
      title={`Cuenta de Cobro N.º ${ccNum} — Contrato ${contrato.numero}-${contrato.anio}`}
      author={contrato.contratista.nombre_completo}
      subject="Cuenta de Cobro"
      creator="DocGov"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header ──────────────────────────────── */}
        <Text style={s.h1}>CUENTA DE COBRO No. {ccNum}</Text>
        <Text style={s.h2}>{municipioHeader}</Text>
        {municipio.nit
          ? <Text style={s.h3}>NIT {municipio.nit}</Text>
          : <Text style={s.h3}> </Text>}

        <Text style={s.debeA}>DEBE A:</Text>

        {/* ── Form table ──────────────────────────── */}
        <View style={s.table}>

          <View style={s.row}>
            <View style={s.lbl}><Text>Fecha:</Text></View>
            <View style={s.val}><Text>{fechaMayus(periodo.fecha_fin)}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Nombre contratista:</Text></View>
            <View style={s.val}><Text>{contrato.contratista.nombre_completo.toUpperCase()}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Número de identificación tributaria</Text></View>
            <View style={s.val}><Text>{formatCedula(contrato.contratista.cedula)}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Nº convenio o contrato:</Text></View>
            <View style={s.val}><Text>{contrato.numero}-{contrato.anio}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Objeto del contrato:</Text></View>
            <View style={s.val}><Text>{contrato.objeto.toUpperCase()}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Valor total del contrato:</Text></View>
            <View style={s.val}><Text>{valorTotal}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Plazo de ejecución:</Text></View>
            <View style={s.val}><Text>{plazo}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Dependencia:</Text></View>
            <View style={s.val}><Text>{contrato.dependencia.toUpperCase()}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Nombre del supervisor</Text></View>
            <View style={s.val}><Text>{contrato.supervisor.nombre_completo.toUpperCase()}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Valor de la cuenta de cobro:</Text></View>
            <View style={s.val}><Text>{valorPeriodo}</Text></View>
          </View>

          <View style={s.row}>
            <View style={s.lbl}><Text>Periodo:</Text></View>
            <View style={s.val}><Text>{periodoTexto}</Text></View>
          </View>

          {/* Last row — bank info as nested sub-table */}
          <View style={s.rowLast}>
            <View style={s.lbl}><Text>Cuenta bancaria autorizada:</Text></View>
            <View style={s.bankCell}>
              <View style={s.bankSubLbl}><Text>Banco Y Tipo De Cuenta</Text></View>
              <View style={s.bankSubVal}>
                <Text>{bancoNombre}{'\n'}{cuentaTipo}</Text>
              </View>
              <View style={s.bankNoLbl}><Text>No.</Text></View>
              <View style={s.bankNoVal}><Text>{contrato.numero_cuenta}</Text></View>
            </View>
          </View>

        </View>

        {/* ── Retención notice ────────────────────── */}
        <Text style={s.retencionNotice}>
          El contratista manifiesta que NO se acoge a la aplicación de costos y deducciones sobre las rentas de trabajo que no provienen de una relación laboral, legal o reglamentaria, para efectos de la retención en la fuente.
        </Text>

        {/* ── Signature block — indivisible, moves to next page if needed ── */}
        <View wrap={false}>

          {/* ── Contratista ── */}
          <Text style={s.sigIntro}>Firma Contratista:</Text>

          {/* Firma image when estado lo permite, espacio en blanco si no */}
          {mostrarFirmaContratista ? (
            <Image src={contrato.contratista.firma_url!} style={s.firmaImgContratista} />
          ) : (
            <View style={s.sigSpace} />
          )}

          {/* Underline */}
          <View style={s.sigLine} />

          {/* Name, CC, address, phone — all BOLD */}
          <Text style={s.sigName}>{contrato.contratista.nombre_completo.toUpperCase()}</Text>
          <Text style={s.sigDetail}>CC. {formatCedula(contrato.contratista.cedula)}</Text>
          {contrato.contratista.direccion && (
            <Text style={s.sigDetail}>Dirección: {contrato.contratista.direccion}</Text>
          )}
          {contrato.contratista.telefono && (
            <Text style={s.sigDetail}>Teléfono: {contrato.contratista.telefono}</Text>
          )}

          {/* ── VoBo Supervisor ── */}
          <View style={s.voBoSection}>
            {mostrarFirmaSupervisor ? (
              <>
                {/* Firma image del supervisor */}
                <Image src={contrato.supervisor.firma_url!} style={s.firmaImgSupervisor} />
                <View style={s.voBoUnderline} />
                <Text style={s.voBoName}>{contrato.supervisor.nombre_completo.toUpperCase()}</Text>
                {contrato.supervisor.cargo && (
                  <Text style={s.voBoDetail}>{contrato.supervisor.cargo}</Text>
                )}
                <Text style={s.voBoDetail}>VoBo. Supervisor</Text>
              </>
            ) : (
              /* Línea en blanco cuando no hay firma todavía */
              <View style={s.voBoRow}>
                <Text style={s.voBoLbl}>VoBo. Supervisor:</Text>
                <View style={s.voBoLine} />
              </View>
            )}
          </View>

        </View>

      </Page>
    </Document>
  )
}
