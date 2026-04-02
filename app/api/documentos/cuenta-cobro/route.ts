import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { formatCedula } from '@/lib/format'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType,
} from 'docx'

const border = { style: BorderStyle.SINGLE, size: 1, color: '000000' }
const borders = { top: border, bottom: border, left: border, right: border }
const cellMargins = { top: 40, bottom: 40, left: 80, right: 80 }

function cell(text: string, opts: any = {}) {
  return new TableCell({
    borders,
    margins: cellMargins,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    columnSpan: opts.colSpan,
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({
        text: text,
        size: opts.size || 20,
        font: 'Arial',
        bold: !!opts.bold,
      })]
    })]
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const periodoId = searchParams.get('periodoId')

  if (!periodoId) {
    return NextResponse.json({ error: 'periodoId requerido' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  // Cargar datos del periodo con contrato y relaciones
  const { data: periodo } = await supabase
    .from('periodos')
    .select(`
      *,
      contrato:contratos(
        *,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula, telefono),
        supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo, cedula),
        dependencia:dependencias(nombre)
      )
    `)
    .eq('id', periodoId)
    .single()

  if (!periodo) {
    return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })
  }

  const { data: municipio } = await supabase
    .from('municipios')
    .select('*')
    .single()

  const contrato = periodo.contrato
  const contratista = contrato.contratista
  const supervisor = contrato.supervisor

  // Formatear fecha
  const fechaDoc = `${periodo.mes} ${periodo.fecha_fin?.split('-')[2]} DE ${periodo.anio}`

  const colWidths = [3200, 6160]
  const tableWidth = 9360

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: [
        // Título
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [new TextRun({
            text: `CUENTA DE COBRO No. ${String(periodo.numero_periodo).padStart(2, '0')}`,
            bold: true, size: 24, font: 'Arial'
          })]
        }),

        // Municipio
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({
            text: `EL MUNICIPIO DE ${municipio?.nombre?.toUpperCase()} ${municipio?.departamento?.toUpperCase()}`,
            bold: true, size: 22, font: 'Arial'
          })]
        }),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({
            text: `NIT ${municipio?.nit}`,
            size: 20, font: 'Arial'
          })]
        }),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [new TextRun({
            text: 'DEBE A:',
            bold: true, size: 22, font: 'Arial'
          })]
        }),

        // Tabla de datos
        new Table({
          width: { size: tableWidth, type: WidthType.DXA },
          columnWidths: colWidths,
          rows: [
            new TableRow({ children: [
              cell('Fecha:', { width: colWidths[0], bold: true }),
              cell(fechaDoc, { width: colWidths[1] }),
            ]}),
            new TableRow({ children: [
              cell('Nombre contratista:', { bold: true }),
              cell(contratista?.nombre_completo?.toUpperCase() || ''),
            ]}),
            new TableRow({ children: [
              cell('Número de identificación tributaria', { bold: true }),
              cell(formatCedula(contratista?.cedula) || ''),
            ]}),
            new TableRow({ children: [
              cell('Nº convenio o contrato:', { bold: true }),
              cell(contrato.numero),
            ]}),
            new TableRow({ children: [
              cell('Objeto del contrato:', { bold: true }),
              cell(contrato.objeto),
            ]}),
            new TableRow({ children: [
              cell('Valor total del contrato:', { bold: true }),
              cell(`${contrato.valor_letras_total || ''} ($${contrato.valor_total?.toLocaleString('es-CO')})`),
            ]}),
            new TableRow({ children: [
              cell('Plazo de ejecución:', { bold: true }),
              cell(`${contrato.plazo_meses} MESES`),
            ]}),
            new TableRow({ children: [
              cell('Dependencia:', { bold: true }),
              cell(contrato.dependencia?.nombre?.toUpperCase() || ''),
            ]}),
            new TableRow({ children: [
              cell('Nombre del supervisor', { bold: true }),
              cell(supervisor?.nombre_completo?.toUpperCase() || ''),
            ]}),
            new TableRow({ children: [
              cell('Valor de la cuenta de cobro:', { bold: true }),
              cell(`${contrato.valor_letras_mensual || ''} ($${periodo.valor_cobro?.toLocaleString('es-CO')})`),
            ]}),
            new TableRow({ children: [
              cell('Periodo:', { bold: true }),
              cell(`DEL ${periodo.fecha_inicio?.split('-')[2]} AL ${periodo.fecha_fin?.split('-')[2]} DE ${periodo.mes} DE ${periodo.anio}`),
            ]}),
            new TableRow({ children: [
              cell('Cuenta bancaria autorizada:', { bold: true }),
              cell(`${contrato.banco || ''} - ${contrato.tipo_cuenta || ''} - No. ${contrato.numero_cuenta || ''}`),
            ]}),
          ]
        }),

        // Espaciado
        new Paragraph({ spacing: { before: 600 }, children: [] }),

        // Firma contratista
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: 'Firma Contratista:', size: 20, font: 'Arial' })]
        }),
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: '_____________________________________', size: 20, font: 'Arial' })]
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({
            text: contratista?.nombre_completo?.toUpperCase() || '',
            bold: true, size: 20, font: 'Arial'
          })]
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({
            text: `CC. ${formatCedula(contratista?.cedula) || ''}`,
            size: 20, font: 'Arial'
          })]
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({
            text: `Teléfono: ${contratista?.telefono || ''}`,
            size: 20, font: 'Arial'
          })]
        }),

        // VoBo Supervisor
        new Paragraph({ spacing: { before: 400 }, children: [] }),
        new Paragraph({
          children: [new TextRun({
            text: `VoBo. Supervisor: ______________________`,
            size: 20, font: 'Arial'
          })]
        }),
      ]
    }]
  })

  const buffer = await Packer.toBuffer(doc)

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename=Cuenta_Cobro_${contrato.numero}_${periodo.mes}_${periodo.anio}.docx`,
    }
  })
}