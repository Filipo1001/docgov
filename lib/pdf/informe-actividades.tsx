import React from 'react'
import { Document, Page, Text, View } from '@react-pdf/renderer'
import { shared } from './styles'
import type { PDFData, PDFObligacion } from './types'

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function ObligacionSection({ obl, index }: { obl: PDFObligacion; index: number }) {
  const total = obl.actividades.reduce((s, a) => s + a.cantidad, 0)

  return (
    <View style={shared.obligacionRow} wrap={false}>
      <Text style={shared.obligacionNum}>{index + 1}.</Text>
      <View style={shared.obligacionBody}>
        <Text style={shared.obligacionText}>
          {obl.descripcion}
          {obl.es_permanente ? (
            <Text style={{ fontSize: 8, color: '#666', fontFamily: 'Helvetica' }}> (Permanente)</Text>
          ) : null}
        </Text>

        {obl.actividades.length === 0 ? (
          <Text style={{ fontSize: 8.5, color: '#999', fontStyle: 'italic', paddingLeft: 8 }}>
            Sin actividades registradas
          </Text>
        ) : (
          <>
            {/* Column headers */}
            <View style={{ flexDirection: 'row', paddingLeft: 8, marginBottom: 3 }}>
              <Text style={{ flex: 1, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#666', textTransform: 'uppercase' }}>
                Actividad
              </Text>
              <Text style={{ width: 50, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#666', textAlign: 'right', textTransform: 'uppercase' }}>
                Acciones
              </Text>
            </View>

            {obl.actividades.map((act, i) => (
              <View key={i} style={shared.actividadRow}>
                <Text style={shared.actividadBullet}>›</Text>
                <Text style={shared.actividadText}>{act.descripcion}</Text>
                <Text style={shared.actividadCantidad}>{act.cantidad}</Text>
              </View>
            ))}

            {/* Obligation subtotal */}
            <View style={{ flexDirection: 'row', paddingLeft: 8, marginTop: 3, paddingTop: 3, borderTop: '0.5px solid #ddd' }}>
              <Text style={{ flex: 1, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555' }}>
                Subtotal
              </Text>
              <Text style={{ width: 50, fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'right' }}>
                {total}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  )
}

export function InformeActividadesPDF({ data }: { data: PDFData }) {
  const { municipio, contrato, periodo, obligaciones, fechaGeneracion } = data

  const totalActividades = obligaciones.reduce((s, o) => s + o.actividades.length, 0)
  const totalAcciones = obligaciones.reduce(
    (s, o) => s + o.actividades.reduce((as, a) => as + a.cantidad, 0),
    0
  )

  return (
    <Document
      title={`Informe de Actividades — Contrato ${contrato.numero}-${contrato.anio} — Periodo ${periodo.numero}`}
      author={contrato.contratista.nombre_completo}
      subject="Informe de Actividades"
      creator="DocGov"
    >
      <Page size="A4" style={shared.page}>

        {/* ── Header ─────────────────────────────────── */}
        <View style={shared.headerBox}>
          <Text style={shared.headerTitle}>Alcaldía Municipal de {municipio}</Text>
          <Text style={shared.headerSubtitle}>{contrato.dependencia}</Text>
          <Text style={shared.documentTitle}>Informe de Actividades</Text>
          <Text style={shared.documentNumber}>
            Contrato N.º {contrato.numero}-{contrato.anio} — Periodo {periodo.numero} — {periodo.mes} {periodo.anio}
          </Text>
        </View>

        {/* ── Parties ────────────────────────────────── */}
        <View style={shared.section}>
          <Text style={shared.sectionTitle}>Información del Contrato</Text>
          <View style={shared.row}>
            <View style={shared.col2}>
              <Text style={shared.label}>Contratista</Text>
              <Text style={shared.value}>{contrato.contratista.nombre_completo}</Text>
              <Text style={{ ...shared.value, fontSize: 8.5, color: '#666' }}>
                C.C. {contrato.contratista.cedula}
              </Text>
            </View>
            <View style={shared.col2}>
              <Text style={shared.label}>Supervisor</Text>
              <Text style={shared.value}>{contrato.supervisor.nombre_completo}</Text>
              <Text style={{ ...shared.value, fontSize: 8.5, color: '#666' }}>
                C.C. {contrato.supervisor.cedula}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 6 }}>
            <Text style={shared.label}>Objeto del contrato</Text>
            <Text style={{ ...shared.value, lineHeight: 1.5 }}>{contrato.objeto}</Text>
          </View>
        </View>

        {/* ── Period ─────────────────────────────────── */}
        <View style={shared.section}>
          <Text style={shared.sectionTitle}>Periodo de Ejecución</Text>
          <View style={shared.row}>
            <View style={shared.col2}>
              <Text style={shared.label}>Periodo</Text>
              <Text style={shared.value}>{periodo.mes} {periodo.anio} (N.º {periodo.numero})</Text>
            </View>
            <View style={shared.col2}>
              <Text style={shared.label}>Fechas</Text>
              <Text style={shared.value}>
                {formatDate(periodo.fecha_inicio)} al {formatDate(periodo.fecha_fin)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Activities ─────────────────────────────── */}
        <View style={shared.section}>
          <Text style={shared.sectionTitle}>
            Obligaciones y Actividades Ejecutadas ({obligaciones.length} obligaciones)
          </Text>

          {obligaciones.map((obl, i) => (
            <ObligacionSection key={i} obl={obl} index={i} />
          ))}
        </View>

        {/* ── Summary ────────────────────────────────── */}
        <View style={{ ...shared.amountBox, marginTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={shared.amountLabel}>Total actividades registradas</Text>
              <Text style={{ ...shared.amountValue, fontSize: 13 }}>{totalActividades}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={shared.amountLabel}>Total acciones ejecutadas</Text>
              <Text style={{ ...shared.amountValue, fontSize: 13 }}>{totalAcciones}</Text>
            </View>
          </View>
        </View>

        {/* ── Certification ──────────────────────────── */}
        <View style={{ ...shared.section, marginTop: 12 }}>
          <Text style={{ ...shared.value, lineHeight: 1.6, fontStyle: 'italic', color: '#555' }}>
            Yo, <Text style={{ fontFamily: 'Helvetica-Bold', fontStyle: 'normal', color: '#1a1a1a' }}>
              {contrato.contratista.nombre_completo}
            </Text>, certifico que las actividades descritas en el presente informe fueron ejecutadas
            a satisfacción durante el periodo {periodo.mes} {periodo.anio}, en cumplimiento de las
            obligaciones establecidas en el Contrato de Prestación de Servicios N.º {contrato.numero}-{contrato.anio}.
          </Text>
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
