import { INDICADORES, REPORTANTES, resumir } from './plan'
import { VINCULOS } from './vinculos'
import { resumirContratos, type ContratoFila } from './contrato'
import {
  nombrePropio,
  type Directorio, type PersonaDirectorio, type PersonaFicha, type SinUsuario,
} from './personas'

/**
 * De las filas de la base al directorio. Pura: no lee nada, así que se prueba con
 * filas reales sin necesitar sesión ni servidor.
 *
 * La lectura vive en `directorio.ts` (que es `server-only`); esto no, para poder
 * ejercitarlo fuera de Next.
 */

export interface FilaUsuario {
  id: string
  nombre_completo: string
  rol: string
  foto_url: string | null
  dependencia: { nombre: string } | { nombre: string }[] | null
}

export interface FilaContrato {
  contratista_id: string
  numero: string
  anio: number | null
  estado: string
  fecha_fin: string
}

export function armarDirectorio(usuarios: FilaUsuario[], contratos: FilaContrato[], hoy: string): Directorio {
  const contratosDe = new Map<string, ContratoFila[]>()
  for (const c of contratos) {
    const lista = contratosDe.get(c.contratista_id) ?? []
    lista.push({ numero: c.numero, anio: c.anio, estado: c.estado, fecha_fin: c.fecha_fin })
    contratosDe.set(c.contratista_id, lista)
  }

  // Cada usuario vinculado sabe cómo figura en el Excel.
  const excelDe = new Map<string, string>()
  for (const [nombre, v] of Object.entries(VINCULOS)) {
    if ('usuarioId' in v) excelDe.set(v.usuarioId, nombre)
  }

  const indicadoresDe = (excel: string) => INDICADORES.filter(i => i.responsable === excel)

  const personas: PersonaDirectorio[] = usuarios.map(u => {
    const dep = Array.isArray(u.dependencia) ? u.dependencia[0] : u.dependencia
    const excel = excelDe.get(u.id) ?? null
    const suyos = excel ? indicadoresDe(excel) : []
    return {
      id: u.id,
      nombre: nombrePropio(u.nombre_completo),
      rol: u.rol,
      fotoUrl: u.foto_url,
      secretaria: dep?.nombre ?? null,
      contrato: resumirContratos(contratosDe.get(u.id) ?? [], u.rol, hoy),
      excel,
      indicadores: suyos.length,
      resumen: suyos.length ? resumir(suyos) : null,
    }
  })

  // Más carga primero; a igual carga, orden alfabético.
  personas.sort((a, b) => b.indicadores - a.indicadores || a.nombre.localeCompare(b.nombre, 'es'))

  const porId = new Map(personas.map(p => [p.id, p]))
  const fichas: Record<string, PersonaFicha> = {}
  const sinUsuario: SinUsuario[] = []

  for (const { nombre } of REPORTANTES) {
    const v = VINCULOS[nombre]
    const persona = v && 'usuarioId' in v ? porId.get(v.usuarioId) : undefined
    if (persona) {
      fichas[nombre] = { nombre: persona.nombre, fotoUrl: persona.fotoUrl, secretaria: persona.secretaria, contrato: persona.contrato }
      continue
    }
    // Sin entrada, o con un identificador que ya no existe: no se adivina.
    const motivo = !v ? 'pendiente' : 'usuarioId' in v ? 'no_encontrado' : v.sinUsuario
    const suyos = indicadoresDe(nombre)
    fichas[nombre] = { sinUsuario: motivo }
    sinUsuario.push({ nombre, motivo, indicadores: suyos.length, resumen: resumir(suyos) })
  }
  sinUsuario.sort((a, b) => b.indicadores - a.indicadores || a.nombre.localeCompare(b.nombre, 'es'))

  return { ok: true, personas, sinUsuario, fichas }
}
