import { resumir, tipoResponsable, type Indicador } from './plan'
import { VINCULOS } from './vinculos'
import { resumirContratos, type ContratoFila } from './contrato'
import {
  nombrePropio,
  type Directorio, type GrupoVista, type MotivoSinVincular, type PersonaDirectorio, type PersonaFicha,
  type SecretariaPlan, type SinUsuario,
} from './personas'

/**
 * De las filas de la base al directorio. Pura: no lee nada, así que se prueba con
 * filas reales sin necesitar sesión ni servidor.
 *
 * La lectura vive en `directorio.ts` (que es `server-only`); esto no, para poder
 * ejercitarlo fuera de Next.
 *
 * ── De dónde sale «quién lleva qué» ──────────────────────────────────────
 *
 * De las ASIGNACIONES que traen los propios indicadores, que son las de la base.
 * Antes salía de una tabla de nombres escrita en el código (`vinculos.ts`); esa
 * tabla ya cumplió su papel (fue la semilla de las asignaciones) y hoy solo sirve
 * para explicar por qué alguien que figura en el Excel no tiene usuario.
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

/** El nombre con que el Excel llamaba a esta persona: el texto de origen más repetido entre sus indicadores, si nombra a una persona. */
function comoFiguraEnElExcel(suyos: Indicador[]): string | null {
  const cuenta = new Map<string, number>()
  for (const i of suyos) {
    if (tipoResponsable(i.responsable) === 'persona') cuenta.set(i.responsable, (cuenta.get(i.responsable) ?? 0) + 1)
  }
  let mejor: string | null = null
  let max = 0
  for (const [texto, n] of cuenta) if (n > max) { mejor = texto; max = n }
  return mejor
}

export function armarDirectorio(
  usuarios: FilaUsuario[],
  contratos: FilaContrato[],
  indicadores: Indicador[],
  hoy: string,
  grupos: GrupoVista[] = [],
  secretarias: SecretariaPlan[] = [],
): Directorio {
  const contratosDe = new Map<string, ContratoFila[]>()
  for (const c of contratos) {
    const lista = contratosDe.get(c.contratista_id) ?? []
    lista.push({ numero: c.numero, anio: c.anio, estado: c.estado, fecha_fin: c.fecha_fin })
    contratosDe.set(c.contratista_id, lista)
  }

  // Los indicadores de cada persona, según las asignaciones.
  const asignadosA = new Map<string, Indicador[]>()
  for (const i of indicadores) {
    for (const a of i.asignados) {
      const lista = asignadosA.get(a.usuarioId) ?? []
      lista.push(i)
      asignadosA.set(a.usuarioId, lista)
    }
  }

  const personas: PersonaDirectorio[] = usuarios.map(u => {
    const dep = Array.isArray(u.dependencia) ? u.dependencia[0] : u.dependencia
    const suyos = asignadosA.get(u.id) ?? []
    return {
      id: u.id,
      nombre: nombrePropio(u.nombre_completo),
      rol: u.rol,
      fotoUrl: u.foto_url,
      secretaria: dep?.nombre ?? null,
      contrato: resumirContratos(contratosDe.get(u.id) ?? [], u.rol, hoy),
      excel: comoFiguraEnElExcel(suyos),
      indicadores: suyos.length,
      resumen: suyos.length ? resumir(suyos) : null,
    }
  })

  // Más carga primero; a igual carga, orden alfabético.
  personas.sort((a, b) => b.indicadores - a.indicadores || a.nombre.localeCompare(b.nombre, 'es'))

  const porId = new Map(personas.map(p => [p.id, p]))
  const fichas: Record<number, PersonaFicha> = {}
  const sinAsignar = new Map<string, { motivo: MotivoSinVincular; lista: Indicador[] }>()

  for (const i of indicadores) {
    // 1. Asignado en la plataforma: el principal, o el primero si no hay principal.
    if (i.asignados.length > 0) {
      const elegido = i.asignados.find(a => a.principal) ?? i.asignados[0]
      const p = porId.get(elegido.usuarioId)
      if (p) {
        fichas[i.id] = { nombre: p.nombre, fotoUrl: p.fotoUrl, secretaria: p.secretaria, contrato: p.contrato }
        continue
      }
      // Asignado a alguien que ya no figura entre los usuarios activos: se trata como sin asignar.
    }

    // 2. Sin asignar. Si el Excel nombraba a UNA persona, se dice por qué no tiene usuario.
    if (tipoResponsable(i.responsable) !== 'persona') continue
    const v = VINCULOS[i.responsable]
    let motivo: MotivoSinVincular | null
    if (!v) motivo = 'pendiente'                        // un nombre nuevo en el Excel: nadie lo ha confirmado
    else if ('sinUsuario' in v) motivo = v.sinUsuario   // personal de planta sin usuario, o pendiente
    else motivo = porId.has(v.usuarioId) ? null : 'no_encontrado' // tiene usuario y nadie lo ha asignado, o el usuario ya no existe
    if (!motivo) continue

    fichas[i.id] = { sinUsuario: motivo }
    const acum = sinAsignar.get(i.responsable) ?? { motivo, lista: [] }
    acum.lista.push(i)
    sinAsignar.set(i.responsable, acum)
  }

  const sinUsuario: SinUsuario[] = [...sinAsignar.entries()]
    .map(([nombre, { motivo, lista }]) => ({ nombre, motivo, indicadores: lista.length, resumen: resumir(lista) }))
    .sort((a, b) => b.indicadores - a.indicadores || a.nombre.localeCompare(b.nombre, 'es'))

  return { ok: true, personas, sinUsuario, fichas, grupos, secretarias }
}
