/**
 * lib/pdf/verificacion-componentes.tsx — Componentes react-pdf de verificación.
 *
 * - SelloVerificacion: bloque QR + código para el pie de cada documento.
 * - FirmaSellada: la superficie de la firma ES el sello — el 100% del área
 *   bajo la tinta está tejida con microtexto diagonal repetido con los datos
 *   del documento (marca de agua inteligente). La firma (PNG con fondo
 *   transparente) se compone ENCIMA de esa textura: extraer la firma implica
 *   llevarse la información del documento al que pertenece.
 */

import { View, Text, Image } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { PDFVerificacion } from './types'

/** Pie de verificación: QR + código. Se inserta dentro del footer fixed. */
export function SelloVerificacion({ v }: { v?: PDFVerificacion }) {
  if (!v) return null
  // El texto impreso deriva de la misma URL que codifica el QR — una sola
  // fuente de verdad si el dominio cambia (se recorta el código final).
  const urlLegible = v.url.replace(/^https?:\/\//, '').replace(/\/[^/]*$/, '')
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingBottom: 4,
        marginBottom: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: '#e5e7eb',
      }}
    >
      <Image src={v.qr} style={{ width: 34, height: 34 }} />
      <View>
        <Text style={{ fontSize: 6, color: '#374151', fontFamily: 'Helvetica-Bold' }}>
          Documento verificable · Código {v.codigo}
        </Text>
        <Text style={{ fontSize: 5.5, color: '#6b7280' }}>
          Escanee el QR o visite {urlLegible}
        </Text>
      </View>
    </View>
  )
}

/** DD/MM/AAAA en hora de Colombia a partir de un ISO. */
function fmtFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

/**
 * Firma con fondo tejido (marca de agua inteligente).
 *
 * Composición: un contenedor con las dimensiones de la firma y overflow
 * oculto; dentro, una capa sobredimensionada rotada -10° con filas de
 * microtexto repetido (tono azul tenue, lenguaje visual de papel de
 * seguridad); encima, la imagen de la firma en posición absoluta.
 *
 * El microtexto (4pt) se percibe como textura a distancia de lectura y se
 * lee con zoom o de cerca. Sin marcos ni recuadros: la textura llena el
 * área y termina donde termina el espacio de la firma.
 */
export function FirmaSellada({
  src,
  style,
  v,
  documento,
  contratoNumero,
  firmante,
}: {
  src: string
  style: Style
  v?: PDFVerificacion
  /** Nombre completo del documento con artículo, ej. "EL ACTA DE PAGO N.° 05" */
  documento: string
  /** Ej. "023-2026" */
  contratoNumero: string
  /** Nombre del propietario de la firma */
  firmante: string
}) {
  if (!v) return <Image src={src} style={style} />

  // La fecha tejida es la de aprobación del informe (supervisor), no la de
  // apertura/descarga del PDF — el documento no cambia cada vez que se abre.
  const fechaTexto = v.fechaAprobacion ? `APROBADO ${fmtFecha(v.fechaAprobacion)}` : 'PENDIENTE DE APROBACIÓN'

  // Municipio dinámico (multi-alcaldía): viene de la BD, no del código
  const muni = v.municipio.toUpperCase().startsWith('MUNICIPIO')
    ? v.municipio.toUpperCase()
    : `MUNICIPIO DE ${v.municipio.toUpperCase()}`

  // Unidad de información que se repite tejida en el fondo
  const unidad =
    `FIRMA VÁLIDA ÚNICAMENTE PARA ${documento}, CORRESPONDIENTE AL CONTRATO ${contratoNumero}` +
    ` · ${firmante.toUpperCase()} · ${muni} · ${v.codigo} · ${fechaTexto} · `
  // Línea larga: cubre el ancho rotado sin importar el tamaño del área
  const linea = unidad.repeat(4)

  return (
    <View style={[style, { position: 'relative', overflow: 'hidden' }]}>
      {/* Capa de textura: sobredimensionada y rotada para cubrir el 100% del
          área incluso en las esquinas tras la rotación */}
      <View
        style={{
          position: 'absolute',
          top: -40,
          left: -80,
          width: 560,
          transform: 'rotate(-10deg)',
        }}
      >
        {Array.from({ length: 16 }).map((_, i) => (
          <Text
            key={i}
            style={{
              fontSize: 4,
              color: '#b6c6e0',
              marginBottom: 1.5,
              // Desfase alterno tipo ladrillo: evita columnas verticales de texto
              marginLeft: i % 2 === 0 ? 0 : -18,
            }}
          >
            {linea}
          </Text>
        ))}
      </View>
      {/* La tinta de la firma (PNG transparente) va ENCIMA de la textura */}
      <Image
        src={src}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, objectFit: 'contain' }}
      />
    </View>
  )
}
