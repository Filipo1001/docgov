/**
 * La CONSTANCIA en PDF de una versión de reporte: una hoja A4 con los datos del reporte, la lista de sus archivos con su huella
 * SHA-256 y el QR que lleva a la página pública (`/verificar/PDM-XXXX-XXXX`), donde se ve el estado VIVO.
 *
 * Solo PINTA lo que entrega la base por `pdm_constancia_publica` (el MISMO dato que enseña la página pública): aquí no se calcula
 * ni se añade nada. Por eso no lleva nombres de archivo, el texto del reporte, comentarios ni motivos.
 *
 * El QR no va dentro de los archivos del reporte (cambiarlos cambiaría su huella): va aquí, en la constancia, que es lo que se
 * adjunta o se imprime. El estado impreso es el de la FECHA en que se generó; el vigente se consulta con el QR, y la hoja lo dice.
 */

import React from 'react'
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { PLAN } from './identidad'
import { esVersionAnterior, etiquetaDeTipo, fraseDeEstado, rotuloDeConstancia, type ConstanciaPublica, type EstadoDeConstancia } from './constancia'
import { fechaHoraBogota } from './historial'
import { nombrePropio } from './personas'

const TINTA = '#192031'
const SUAVE = '#556072'
const TENUE = '#667085'
const REGLA = '#E6E9EF'

const COLOR_DE_ESTADO: Record<EstadoDeConstancia, { fondo: string; borde: string; texto: string }> = {
  aprobado: { fondo: '#ECFDF3', borde: '#A6D8BE', texto: '#1F5D43' },
  pendiente: { fondo: '#FFFAEB', borde: '#F2D08A', texto: '#7A4A06' },
  devuelto: { fondo: '#FFF4ED', borde: '#F3B994', texto: '#8A3B0C' },
  anulado: { fondo: '#FEF3F2', borde: '#F2B8B5', texto: '#912018' },
}

const NEUTRO = { fondo: '#F4F5F8', borde: '#C5CBD6', texto: '#2D3648' }

const s = StyleSheet.create({
  pagina: { fontFamily: 'Helvetica', fontSize: 9, color: TINTA, paddingTop: 40, paddingHorizontal: 44, paddingBottom: 54, backgroundColor: '#FFFFFF' },
  rotulo: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', color: TENUE },
  negrita: { fontFamily: 'Helvetica-Bold' },
})

const numero = (n: number): string => n.toLocaleString('es-CO', { maximumFractionDigits: 2 })
const tamano = (b: number): string => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`)

function Fila({ etiqueta, children, sub }: { etiqueta: string; children: string; sub?: string }) {
  return (
    <View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5.5, borderBottomWidth: 0.5, borderBottomColor: REGLA }}>
      <Text style={{ width: 120, fontSize: 8.6, color: SUAVE }}>{etiqueta}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right' }}>{children}</Text>
        {sub ? <Text style={{ fontSize: 7.6, color: SUAVE, marginTop: 1, textAlign: 'right' }}>{sub}</Text> : null}
      </View>
    </View>
  )
}

export function ConstanciaDeReporte({ c, qr, url, generadaEn }: { c: ConstanciaPublica; qr: string; url: string; generadaEn: string }) {
  const ind = c.indicador
  const unidad = ind.unidad.trim()
  const conUnidad = (n: number) => `${numero(n)}${unidad ? ` ${unidad}` : ''}`
  const color = esVersionAnterior(c) ? NEUTRO : COLOR_DE_ESTADO[c.estado]
  return (
    <Document title={`Constancia ${c.codigo}`} author="Contratista Digital" subject={`${PLAN.denominacion} ${PLAN.nombre}`}>
      <Page size="A4" style={s.pagina}>
        {/* Encabezado */}
        <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.4, borderBottomColor: TINTA, paddingBottom: 9, marginBottom: 14 }}>
          <View style={{ width: 26, height: 26, borderRadius: 5, backgroundColor: TINTA, alignItems: 'center', justifyContent: 'center', marginRight: 9 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontFamily: 'Helvetica-Bold' }}>CD</Text>
          </View>
          <View>
            <Text style={[s.rotulo, { color: TENUE }]}>{PLAN.denominacion} · {PLAN.nombre}</Text>
            <Text style={{ fontSize: 12.5, fontFamily: 'Helvetica-Bold', marginTop: 1 }}>Constancia de reporte</Text>
          </View>
        </View>

        {/* Código y QR */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.rotulo}>Código de verificación</Text>
            <Text style={{ fontFamily: 'Courier-Bold', fontSize: 21, marginTop: 3, letterSpacing: 1 }}>{c.codigo}</Text>
            <Text style={{ fontSize: 8.4, color: SUAVE, marginTop: 7, lineHeight: 1.45 }}>
              Escanee el código QR, o entre a <Text style={s.negrita}>{url.replace(/\/verificar\/.*/, '/verificar')}</Text> y escriba el código, para ver el
              estado actual de este reporte y comprobar sus archivos.
            </Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Image src={qr} style={{ width: 104, height: 104 }} />
          </View>
        </View>

        {/* Estado al generar la constancia */}
        <View wrap={false} style={{ borderWidth: 0.8, borderColor: color.borde, backgroundColor: color.fondo, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 11, marginBottom: 12 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: color.texto }}>{rotuloDeConstancia(c)}</Text>
          <Text style={{ fontSize: 8.6, color: color.texto, marginTop: 3, lineHeight: 1.4 }}>{fraseDeEstado(c)}</Text>
          <Text style={{ fontSize: 7.4, color: color.texto, marginTop: 4, opacity: 0.85 }}>
            Estado al {generadaEn}. El estado de hoy se consulta con el código QR: puede haber cambiado.
          </Text>
        </View>

        {/* Datos del reporte */}
        <View>
          <Fila etiqueta="Secretaría">{ind.dependencia}</Fila>
          <Fila etiqueta="Indicador">{`${ind.codigo ? `${ind.codigo} · ` : ''}${ind.nombre}`}</Fila>
          <Fila etiqueta="Año">{String(ind.anio)}</Fila>
          {ind.meta !== null && <Fila etiqueta={`Meta ${ind.anio}`}>{conUnidad(ind.meta)}</Fila>}
          <Fila etiqueta="Valor reportado" sub={c.reporte.valorAnterior !== null ? `el anterior era ${numero(c.reporte.valorAnterior)}` : undefined}>{conUnidad(c.reporte.valor)}</Fila>
          <Fila etiqueta="Reportado" sub={`por ${nombrePropio(c.reporte.autor)}${c.reporte.esCorreccion ? ' · es una corrección' : ''}`}>{fechaHoraBogota(c.reporte.reportadoEn)}</Fila>
          {c.validacion
            ? <Fila etiqueta={c.validacion.estado === 'aprobado' ? 'Aprobado' : 'Devuelto'} sub={`por ${nombrePropio(c.validacion.validador)}`}>{fechaHoraBogota(c.validacion.fecha)}</Fila>
            : <Fila etiqueta="Validación">Todavía no ha sido validado</Fila>}
          {c.anulacion && <Fila etiqueta={c.anulacion.accion === 'anular' ? 'Anulado' : 'Restaurado'}>{fechaHoraBogota(c.anulacion.fecha)}</Fila>}
          <Fila etiqueta="Constancia emitida">{fechaHoraBogota(c.creadaEn)}</Fila>
        </View>

        {/* Archivos */}
        <Text style={[s.rotulo, { marginTop: 16, marginBottom: 6 }]}>Archivos de esta versión{c.archivos.length > 0 ? ` (${c.archivos.length})` : ''}</Text>
        {c.archivos.length === 0 ? (
          <Text style={{ fontSize: 8.6, color: SUAVE }}>Esta versión no tiene archivos.</Text>
        ) : c.archivos.map((a, i) => (
          <View key={i} wrap={false} style={{ borderWidth: 0.5, borderColor: REGLA, borderRadius: 3, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 8.8, fontFamily: 'Helvetica-Bold' }}>
              {etiquetaDeTipo(a.tipo)} <Text style={{ fontFamily: 'Helvetica', color: SUAVE }}>· {tamano(a.bytes)}</Text>
            </Text>
            {a.sha256
              ? <Text style={{ fontFamily: 'Courier', fontSize: 7.4, marginTop: 2, color: '#2D3648' }}>SHA-256  {a.sha256}</Text>
              : <Text style={{ fontSize: 7.6, color: SUAVE, marginTop: 2 }}>Sin huella registrada para este archivo.</Text>}
          </View>
        ))}
        <Text style={{ fontSize: 7.4, color: SUAVE, marginTop: 4, lineHeight: 1.45 }}>
          La huella SHA-256 identifica el contenido exacto de cada archivo: si se cambia un solo byte, la huella cambia. Para comprobar
          que un archivo que usted recibió es el registrado, entre a la página de verificación y suéltelo allí: su archivo no se sube,
          la huella se calcula en su propio dispositivo. Los nombres de los archivos no se publican.
        </Text>

        {/* Pie */}
        <View fixed style={{ position: 'absolute', left: 44, right: 44, bottom: 22, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: REGLA, paddingTop: 5 }}>
          <Text style={{ fontSize: 6.6, color: SUAVE }}>Generada por Contratista Digital el {generadaEn}. Esta constancia no reemplaza el reporte: da fe de él.</Text>
          <Text style={{ fontSize: 6.6, color: SUAVE }} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
