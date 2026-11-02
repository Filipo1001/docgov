'use server'

import ExcelJS from 'exceljs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { normalizeName } from '@/lib/format'
import { numerosALetras } from '@/lib/numero-letras'
import type { ActionResult } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FilaImport = {
  // Parsed from Excel
  numero: string
  anio: number
  nombre_contratista: string
  cedula: string
  tipo_documento: 'CC' | 'NIT'
  objeto: string
  tipo_contrato: string
  plazo_dias: number
  fecha_inicio: string          // YYYY-MM-DD
  fecha_fin: string             // YYYY-MM-DD
  valor_mensual: number
  valor_total: number
  cdp: string
  crp: string
  secop_url: string | null
  // Matching
  dependencia_nombre_excel: string
  supervisor_nombre_excel: string
  dependencia_id: string | null
  supervisor_id: string | null
  supervisor_nombre_resuelto: string | null
  // Status
  ok: boolean                   // can be imported without intervention
  advertencias: string[]        // warnings shown in preview
  errores_bloqueo: string[]     // hard errors that prevent import
}

export type ImportResult = {
  total: number
  usuarios_creados: number
  usuarios_existentes: number
  contratos_creados: number
  errores: { numero: string; nombre: string; error: string }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data } = await supabase
    .from('usuarios')
    .select('rol, municipio_id')
    .eq('id', session.user.id)
    .single()
  if (data?.rol !== 'admin') return null
  return { userId: session.user.id, municipioId: data.municipio_id as string }
}

/** Strip accents, lowercase, collapse spaces */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Word-overlap similarity: 1.0 = identical, 0 = no words in common */
function similitud(a: string, b: string): number {
  const wa = new Set(norm(a).split(' ').filter(Boolean))
  const wb = new Set(norm(b).split(' ').filter(Boolean))
  if (wa.size === 0 || wb.size === 0) return 0
  const comun = [...wa].filter(w => wb.has(w)).length
  return comun / Math.max(wa.size, wb.size)
}

/** Excel date serial → YYYY-MM-DD */
function serialToDate(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400_000)
  return d.toISOString().split('T')[0]
}

/** Date → YYYY-MM-DD usando componentes UTC (evita el desfase de un día por zona horaria) */
function dateToYMD(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Aplana una celda de ExcelJS a un valor primitivo, equivalente a lo que
 * devolvía XLSX.utils.sheet_to_json: string | number | Date.
 * ExcelJS envuelve hipervínculos ({text, hyperlink}), fórmulas ({result})
 * y texto enriquecido ({richText}); aquí los reducimos a su valor plano.
 */
function flattenCell(v: unknown): string | number | Date | '' {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('text' in o) return String(o.text)                    // hipervínculo
    if ('result' in o) return flattenCell(o.result)           // fórmula
    if ('richText' in o && Array.isArray(o.richText)) {        // texto enriquecido
      return o.richText.map((r: { text?: string }) => r.text ?? '').join('')
    }
    if ('error' in o) return ''                               // celda con error
    return ''
  }
  return v as string | number
}

/**
 * Lee la primera hoja de un .xlsx y devuelve filas como objetos
 * { encabezado: valor }, replicando el comportamiento de sheet_to_json
 * (defval: '' para celdas vacías). La primera fila se usa como encabezados.
 */
async function leerFilasExcel(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  // Encabezados desde la primera fila
  const headerRow = ws.getRow(1)
  const headers: string[] = []
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(flattenCell(cell.value)).trim()
  })

  const filas: Record<string, unknown>[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return // saltar encabezados
    const obj: Record<string, unknown> = {}
    let tieneAlgo = false
    for (let col = 1; col < headers.length; col++) {
      const key = headers[col]
      if (!key) continue
      const val = flattenCell(row.getCell(col).value)
      obj[key] = val === '' ? '' : val
      if (val !== '') tieneAlgo = true
    }
    if (tieneAlgo) filas.push(obj)
  })

  return filas
}

function readCell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== '') return String(v).trim()
  }
  return ''
}

// ─── Step 1: Parse & validate (no DB writes) ─────────────────────────────────

export async function parsearExcel(
  formData: FormData,
): Promise<ActionResult<{ filas: FilaImport[] }>> {
  const admin = await requireAdmin()
  if (!admin) return { error: 'No autorizado' }

  const file = formData.get('archivo') as File | null
  if (!file) return { error: 'No se encontró el archivo' }

  const buffer = Buffer.from(await file.arrayBuffer())
  const rows = await leerFilasExcel(buffer)

  if (rows.length === 0) return { error: 'El archivo está vacío o no tiene el formato esperado' }

  // Load supervisors and dependencias for matching
  const adminClient = createAdminSupabaseClient()
  const [{ data: supervisores }, { data: dependencias }] = await Promise.all([
    adminClient.from('usuarios').select('id, nombre_completo').eq('rol', 'supervisor'),
    adminClient.from('dependencias').select('id, nombre').eq('municipio_id', admin.municipioId),
  ])

  const filas: FilaImport[] = rows.map(row => {
    const advertencias: string[] = []
    const errores_bloqueo: string[] = []

    // ── Contract number ──────────────────────────────────
    const numRaw = readCell(row, 'NÚMERO DEL PROCESO -2025', 'NUMERO DEL PROCESO -2025', 'NÚMERO DEL PROCESO', 'NUMERO DE CONTRATO')
    const [numPart, anioPart] = numRaw.split('-')
    const numero = numPart?.trim() || ''
    const anio = parseInt(anioPart) || new Date().getFullYear()
    if (!numero) errores_bloqueo.push('Número de contrato vacío')

    // ── Contractor ───────────────────────────────────────
    const nombre_contratista = normalizeName(readCell(row, 'NOMBRE ó RAZÓN SOC. CONTRATISTA', 'NOMBRE O RAZON SOC. CONTRATISTA'))
    const cedula = readCell(row, 'DOCUMENTO')
    const figuraRaw = readCell(row, 'FIGURA JURÍDICA', 'FIGURA JURIDICA').toLowerCase()
    const tipo_documento: 'CC' | 'NIT' = figuraRaw.includes('juridic') ? 'NIT' : 'CC'

    if (!nombre_contratista) errores_bloqueo.push('Nombre del contratista vacío')
    if (!cedula) errores_bloqueo.push('Cédula / NIT vacío')

    // ── Contract fields ──────────────────────────────────
    const objeto = readCell(row, 'OBJETO DEL CONTRATO')
    const tipo_contrato = readCell(row, 'TIPO DE CONTRATO')
    const plazo_dias = Number(readCell(row, 'PLAZO (DÍAS)', 'PLAZO (DIAS)')) || 0

    if (!objeto) errores_bloqueo.push('Objeto del contrato vacío')

    // ── Dates ────────────────────────────────────────────
    // ExcelJS devuelve celdas de fecha como Date; toleramos también serial
    // numérico (compatibilidad) y texto. Para Date usamos componentes UTC
    // para no desplazar el día por la zona horaria del servidor.
    const fechaInicioRaw = row['FECHA DEL ACTA DE INICIO']
    const fechaFinRaw = row['FECHA FINALIZACIÓN (PROGRAMADA)'] ?? row['FECHA FINALIZACION (PROGRAMADA)']
    const parseFecha = (raw: unknown): string => {
      if (raw instanceof Date) return dateToYMD(raw)
      if (typeof raw === 'number') return serialToDate(raw)
      return String(raw || '')
    }
    const fecha_inicio = parseFecha(fechaInicioRaw)
    const fecha_fin = parseFecha(fechaFinRaw)

    if (!fecha_inicio || fecha_inicio.startsWith('NaN')) errores_bloqueo.push('Fecha de inicio inválida')
    if (!fecha_fin || fecha_fin.startsWith('NaN')) errores_bloqueo.push('Fecha de fin inválida')

    // ── Values ───────────────────────────────────────────
    const valor_mensual = Number(readCell(row, 'ASIGNACIÓN MENSUAL', 'ASIGNACION MENSUAL')) || 0
    const valor_total = Number(readCell(row, 'VALOR INICIAL DEL CONTRATO')) || 0
    if (!valor_total) advertencias.push('Valor total es 0')

    // ── CDP / CRP ────────────────────────────────────────
    const cdp = readCell(row, 'No. CDP')
    const crp = readCell(row, 'No. CRP')

    // ── SECOP link ───────────────────────────────────────
    const secopRaw = readCell(
      row,
      'LINK SECOP', 'Link SECOP', 'ENLACE SECOP', 'Enlace SECOP',
      'URL SECOP', 'URL SECOP II', 'LINK SECOP II', 'ENLACE', 'LINK',
    )
    const secop_url = secopRaw.startsWith('http') ? secopRaw : secopRaw ? `https://${secopRaw}` : null

    // ── Dependencia matching ─────────────────────────────
    const dep_excel = readCell(row, 'DEPENDENCIA')
    let dependencia_id: string | null = null
    if (dependencias && dep_excel) {
      const best = dependencias
        .map(d => ({ ...d, score: similitud(dep_excel, d.nombre) }))
        .sort((a, b) => b.score - a.score)[0]
      if (best && best.score >= 0.7) {
        dependencia_id = best.id
      } else {
        errores_bloqueo.push(`Dependencia no encontrada: "${dep_excel}"`)
      }
    } else if (!dep_excel) {
      errores_bloqueo.push('Dependencia vacía')
    }

    // ── Supervisor matching ──────────────────────────────
    const sup_excel = readCell(row, 'SUPERVISOR')
    let supervisor_id: string | null = null
    let supervisor_nombre_resuelto: string | null = null
    if (supervisores && sup_excel) {
      const best = supervisores
        .map(s => ({ ...s, score: similitud(sup_excel, s.nombre_completo) }))
        .sort((a, b) => b.score - a.score)[0]
      if (best && best.score >= 0.7) {
        supervisor_id = best.id
        supervisor_nombre_resuelto = best.nombre_completo
        if (best.score < 0.99) {
          advertencias.push(`Supervisor "${sup_excel}" resuelto como "${best.nombre_completo}"`)
        }
      } else {
        errores_bloqueo.push(`Supervisor no encontrado: "${sup_excel}"`)
      }
    } else if (!sup_excel) {
      errores_bloqueo.push('Supervisor vacío')
    }

    const ok = errores_bloqueo.length === 0

    return {
      numero,
      anio,
      nombre_contratista,
      cedula,
      tipo_documento,
      objeto,
      tipo_contrato,
      plazo_dias,
      fecha_inicio,
      fecha_fin,
      valor_mensual,
      valor_total,
      cdp,
      crp,
      secop_url,
      dependencia_nombre_excel: dep_excel,
      supervisor_nombre_excel: sup_excel,
      dependencia_id,
      supervisor_id,
      supervisor_nombre_resuelto,
      ok,
      advertencias,
      errores_bloqueo,
    }
  })

  return { data: { filas } }
}

// ─── Step 2: Confirm & create (DB writes) ────────────────────────────────────

export async function confirmarImportacion(
  filas: FilaImport[],
): Promise<ActionResult<ImportResult>> {
  const admin = await requireAdmin()
  if (!admin) return { error: 'No autorizado' }

  const adminClient = createAdminSupabaseClient()
  const { data: muni } = await adminClient.from('municipios').select('id').limit(1).single()
  if (!muni) return { error: 'No se encontró el municipio' }

  const result: ImportResult = {
    total: filas.length,
    usuarios_creados: 0,
    usuarios_existentes: 0,
    contratos_creados: 0,
    errores: [],
  }

  // Only process rows without blocking errors
  const filasValidas = filas.filter(f => f.ok)

  for (const fila of filasValidas) {
    try {
      // ── 1. Find or create user ───────────────────────
      let usuarioId: string

      const { data: existente } = await adminClient
        .from('usuarios')
        .select('id')
        .eq('cedula', fila.cedula)
        .maybeSingle()

      if (existente) {
        usuarioId = existente.id
        result.usuarios_existentes++
      } else {
        const emailPlaceholder = `${fila.cedula.replace(/[^a-zA-Z0-9]/g, '')}@pendiente.local`

        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email: emailPlaceholder,
          password: fila.cedula,
          email_confirm: true,
          user_metadata: { nombre_completo: fila.nombre_contratista },
        })

        if (authError || !authData?.user) {
          result.errores.push({
            numero: fila.numero,
            nombre: fila.nombre_contratista,
            error: authError?.message ?? 'Error creando cuenta de acceso',
          })
          continue
        }

        usuarioId = authData.user.id

        const { error: dbError } = await adminClient.from('usuarios').insert({
          id: usuarioId,
          email: emailPlaceholder,
          nombre_completo: fila.nombre_contratista,
          cedula: fila.cedula,
          tipo_documento: fila.tipo_documento,
          rol: 'contratista',
          dependencia_id: fila.dependencia_id,
          municipio_id: muni.id,
        })

        if (dbError) {
          await adminClient.auth.admin.deleteUser(usuarioId)
          result.errores.push({ numero: fila.numero, nombre: fila.nombre_contratista, error: dbError.message })
          continue
        }

        result.usuarios_creados++
      }

      // ── 2. Create contract ───────────────────────────
      const plazo_meses = Math.max(1, Math.round(fila.plazo_dias / 30))

      const { error: contratoError } = await adminClient.from('contratos').insert({
        municipio_id: muni.id,
        dependencia_id: fila.dependencia_id,
        contratista_id: usuarioId,
        supervisor_id: fila.supervisor_id,
        numero: fila.numero,
        anio: fila.anio,
        objeto: fila.objeto,
        modalidad_seleccion: 'Contratación Directa',
        valor_total: fila.valor_total,
        valor_mensual: fila.valor_mensual,
        valor_letras_total: numerosALetras(fila.valor_total),
        valor_letras_mensual: fila.valor_mensual ? numerosALetras(fila.valor_mensual) : '',
        plazo_dias: fila.plazo_dias,
        plazo_meses,
        fecha_inicio: fila.fecha_inicio,
        fecha_fin: fila.fecha_fin,
        cdp: fila.cdp || null,
        crp: fila.crp || null,
        secop_url: fila.secop_url || null,
      })

      if (contratoError) {
        result.errores.push({ numero: fila.numero, nombre: fila.nombre_contratista, error: contratoError.message })
        continue
      }

      result.contratos_creados++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error inesperado'
      result.errores.push({ numero: fila.numero, nombre: fila.nombre_contratista, error: msg })
    }
  }

  return { data: result }
}
