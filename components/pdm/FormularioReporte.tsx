'use client'

/**
 * El formulario con que quien tiene un indicador reporta su avance en un año. Nadie tiene que abrir nada: el
 * año ya empezó y se reporta cuando haya algo que reportar, las veces que haga falta.
 *
 * Cuatro situaciones, según lo último que haya en el año:
 *
 *   nuevo       nadie ha reportado: se reporta.
 *   corregir    el último está esperando validación: se puede corregir (el formulario arranca
 *               cerrado: es la excepción), y la corrección dice qué se corrige.
 *   responder   la secretaría lo devolvió: se responde con un reporte nuevo que dice qué cambió.
 *   aprobado    ya lo validaron: ese avance cuenta. Si el responsable lleva más, reporta un avance
 *               nuevo (el formulario arranca cerrado); no se corrige lo aprobado.
 *
 * Un reporte nunca se reescribe: corregir crea una versión nueva y la anterior queda en el historial.
 * La evidencia es obligatoria, como en la base: sin al menos un archivo el botón no se activa.
 *
 * ── Al corregir, nada de lo que estaba bien se vuelve a subir ────────────
 *
 * El formulario muestra los archivos de la versión anterior. Los que la secretaría no objetó pasan solos a la
 * nueva (se pueden quitar uno a uno); los que devolvió NO se conservan: se reemplazan con uno nuevo o se dejan
 * fuera, y cada uno trae la nota de quien lo devolvió. Entre lo conservado y lo nuevo hay al menos uno (y un máximo que no se dice).
 */

import { useEffect, useRef, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { fmt, type Indicador } from '@/lib/pdm/plan'
import {
  MAX_MOTIVO_CORRECCION, MAX_TEXTO_REPORTE, MIN_TEXTO,
  describirTamano, errorEnArchivos, errorEnArchivosDelBorrador, errorEnBorrador, errorEnReporte, leerNumero,
  type AccionesSeguimiento, type BorradorArchivo, type BorradorVista, type ReporteDetalle,
} from '@/lib/pdm/seguimiento-acciones'
import { aplicarSituacion, firmaDelFormulario, quienGuardo } from '@/lib/pdm/borradores'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import { clasificarSeleccion, entradaNueva, esImagenDibujable, mensajeDeFallos, resumenDeSubida, type ArchivoEnCola, type Rechazo } from '@/lib/pdm/evidencias-cola'
import { subirEvidencia } from '@/lib/pdm/subir-evidencia'
import { crearMiniatura } from '@/lib/pdm/miniatura'
import { categoriaDeMime } from '@/lib/pdm/evidencias-armar'
import { GLIFO_DE_CATEGORIA } from './iconos-tipo'
import { limpio, marcar } from '@/lib/pdm/diagnostico'
import { subirCola } from '@/lib/pdm/subir-cola'
import { Seccion } from './ui'
import BotonAccion, { Despliegue, useConfirmar } from './Movimiento'
import ZonaEvidencias from './ZonaEvidencias'
import { T } from './tema'
import { nombrePropio } from '@/lib/pdm/personas'

/** El borde rojo de un campo al que le falta algo. `!` porque el campo ya trae su borde gris. */
const CAMPO_MAL = '!border-[#B42318] focus:!ring-[#B42318]'

export default function FormularioReporte({ indicador, vigente, borrador, yoId, acciones, onHecho }: {
  /** El indicador visto en el año en que se reporta (`indicador.anio`). */
  indicador: Indicador
  /** Lo último que se reportó de este indicador en este año, si ya hay algo. */
  vigente: ReporteDetalle | null
  /** Lo que alguien dejó a medias de este reporte (migración 076), si hay algo. Solo se lee al abrir el formulario. */
  borrador: BorradorVista | null
  /** Quién mira (para decir «por ti» en el aviso del borrador). */
  yoId: string
  acciones: AccionesSeguimiento
  /** Se llama con el aviso de lo que pasó, para que quien lo monta recargue. */
  onHecho: (mensaje: string) => void
}) {
  const modo = !vigente ? 'nuevo' : vigente.estado === 'aprobado' ? 'aprobado' : vigente.estado === 'devuelto' ? 'responder' : 'corregir'
  const correccion = modo === 'corregir' || modo === 'responder'
  const anio = indicador.anio

  // Lo que se conserva de la versión anterior: por defecto todo lo que la secretaría no devolvió.
  const anteriores = correccion && vigente ? vigente.evidencias : []
  const observados = new Set(anteriores.filter(a => a.observacion).map(a => a.id))
  const porDefecto = () => new Set(anteriores.filter(a => !a.observacion).map(a => a.id))
  // Un borrador guardado cuando se corregía un reporte puede abrirse cuando la situación ya cambió (lo aprobaron, devolvieron un
  // archivo): se queda con lo que sigue valiendo y se dice qué se quitó.
  const [situacionBorrador] = useState(() => (borrador ? aplicarSituacion(borrador, anteriores, observados, correccion) : null))

  const [abierto, setAbierto] = useState(modo === 'nuevo' || modo === 'responder' || borrador !== null)
  const [valor, setValor] = useState(borrador ? (borrador.valor !== null ? String(borrador.valor).replace('.', ',') : '') : correccion && vigente ? String(vigente.valor).replace('.', ',') : '')
  const [texto, setTexto] = useState(borrador ? borrador.texto : correccion && vigente ? vigente.texto : '')
  const [motivo, setMotivo] = useState(situacionBorrador ? situacionBorrador.motivo : '')
  // Lo que se va a subir: cada archivo con su estado y su avance. Se conserva aunque falle algo, para no volver a elegirlos.
  const [cola, setCola] = useState<ArchivoEnCola<File>[]>([])
  const [avisos, setAvisos] = useState<Rechazo[]>([])
  // Dónde quedó en el almacenamiento cada archivo ya subido (por su clave): lo que se registra y lo que no se repite al reintentar.
  const subidas = useRef(new Map<string, { ruta: string; tipo: string }>())
  const [conservar, setConservar] = useState<ReadonlySet<string>>(() => (situacionBorrador ? new Set(situacionBorrador.conservar) : porDefecto()))
  // Lo que ya está guardado en el borrador (archivos subidos que esperan el envío) y cómo quedó el último guardado.
  const [guardados, setGuardados] = useState<BorradorArchivo[]>(borrador ? borrador.archivos : [])
  const [borradorGuardado, setBorradorGuardado] = useState<BorradorVista | null>(borrador)
  // La firma del formulario en el último guardado: si cambia, hay cambios sin guardar. Se toma tras el primer pintado.
  const [firmaBase, setFirmaBase] = useState<string | null>(null)
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)
  // El botón cuenta lo que pasa: subiendo (con cuántos archivos y qué tanto) → registrando → enviado. Lo mismo al guardar el borrador.
  const { fase, correr, ocupado: enviando } = useConfirmar()
  const { fase: faseBorrador, correr: correrBorrador, ocupado: guardandoBorrador } = useConfirmar()
  const { correr: correrDescarte, ocupado: descartando } = useConfirmar()
  const ocupado = enviando || guardandoBorrador || descartando
  const [etapa, setEtapa] = useState<'subiendo' | 'registrando'>('subiendo')
  const [error, setError] = useState<string | null>(null)
  // Tras el primer intento de enviar con algo incompleto, cada campo dice lo que le falta (antes no: no se riñe a quien aún escribe).
  const [intento, setIntento] = useState(false)

  // Las direcciones temporales de las vistas previas de las fotos: se crean al elegir y se liberan al quitar o al cerrar.
  const vistas = useRef(new Set<string>())
  // Las miniaturas se hacen una a una (cada una decodifica su foto reducida y la libera antes de seguir con la otra).
  const cadenaMiniaturas = useRef<Promise<void>>(Promise.resolve())
  const vivo = useRef(true)
  const colaRef = useRef<ArchivoEnCola<File>[]>([])
  useEffect(() => { colaRef.current = cola })
  useEffect(() => {
    vivo.current = true
    const creadas = vistas.current
    return () => { vivo.current = false; creadas.forEach(u => URL.revokeObjectURL(u)); creadas.clear() }
  }, [])

  // El rastro de la subida (ver `lib/pdm/diagnostico.ts`): abrir el formulario, cualquier error de la página mientras está abierto, y
  // si la página se oculta o se descarga a media subida (una recarga, el sistema cerrando la pestaña).
  useEffect(() => {
    if (!abierto) return
    marcar('abre', { modo })
    const error = (e: ErrorEvent) => marcar('error-js', { mensaje: limpio(e.message) })
    const rechazo = (e: PromiseRejectionEvent) => marcar('rechazo-js', { mensaje: limpio((e.reason as Error | undefined)?.message ?? e.reason) })
    const oculta = () => marcar(document.visibilityState === 'hidden' ? 'pagina-oculta' : 'pagina-visible')
    const sale = () => marcar('pagina-se-descarga')
    window.addEventListener('error', error)
    window.addEventListener('unhandledrejection', rechazo)
    document.addEventListener('visibilitychange', oculta)
    window.addEventListener('pagehide', sale)
    return () => {
      window.removeEventListener('error', error)
      window.removeEventListener('unhandledrejection', rechazo)
      document.removeEventListener('visibilitychange', oculta)
      window.removeEventListener('pagehide', sale)
    }
  }, [abierto, modo])

  // Mientras se sube o se guarda, cerrar la pestaña perdería el trabajo: el navegador pregunta antes.
  useEffect(() => {
    if (!ocupado) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [ocupado])

  // Lo que hay en el formulario ahora, y lo que había cuando se guardó el borrador: si difieren, hay cambios sin guardar.
  const firma = firmaDelFormulario({ valor, texto, motivo, conservar, guardados: guardados.map(g => g.ruta), porSubir: cola.map(c => c.clave) })
  useEffect(() => { if (borrador) setFirmaBase(firma) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const hayCambiosSinGuardar = borradorGuardado !== null && firmaBase !== null && firma !== firmaBase

  if (!abierto) {
    return (
      <Seccion rotulo={`Reporte de ${anio}`}>
        {modo === 'aprobado' && vigente ? (
          <div className={`flex flex-wrap items-center justify-between gap-3 ${T.avisoBien}`}>
            <div>
              <p className="text-sm font-semibold">Último reporte aprobado: {fmt(vigente.valor)}</p>
              <p className="mt-1 text-xs leading-relaxed">Ya cuenta en el cumplimiento. Si llevas más, reporta el nuevo avance.</p>
              {borradorGuardado && <p className="mt-1 text-xs font-medium leading-relaxed">Tienes un borrador sin enviar.</p>}
            </div>
            <button id="pdm-nuevo-avance" onClick={() => setAbierto(true)} className={T.botonSecChico}>{borradorGuardado ? 'Continuar borrador' : 'Reportar nuevo avance'}</button>
          </div>
        ) : (
          <div className={`flex flex-wrap items-center justify-between gap-3 ${T.avisoNota}`}>
            <p>{borradorGuardado ? 'Tienes un borrador de la corrección sin enviar.' : `¿Hay que corregir lo que reportaste en ${anio}?`}</p>
            <button id="pdm-corregir" onClick={() => setAbierto(true)} className={T.botonSecChico}>{borradorGuardado ? 'Continuar borrador' : 'Corregir el reporte'}</button>
          </div>
        )}
      </Seccion>
    )
  }

  const numero = leerNumero(valor)
  // Lo conservado, lo guardado en el borrador y lo nuevo comparten el tope de archivos y el mínimo de uno.
  const total = conservar.size + guardados.length + cola.length
  const resumen = resumenDeSubida(cola)

  // Lo que falta, campo por campo. Se calcula siempre; se MUESTRA después del primer intento de enviar.
  const faltas = {
    valor: numero !== null ? null : valor.trim() === '' ? 'Escribe el valor del avance.' : 'No se entiende ese número.',
    texto: texto.trim().length >= MIN_TEXTO ? null : `Cuenta qué se hizo (al menos ${MIN_TEXTO} caracteres).`,
    motivo: !correccion || motivo.trim().length >= MIN_TEXTO ? null : `${modo === 'responder' ? 'Di cómo respondes' : 'Di qué corriges'} (al menos ${MIN_TEXTO} caracteres).`,
    evidencia: total > 0 ? null : 'Adjunta al menos una evidencia.',
  }
  const ver = (k: keyof typeof faltas) => (intento ? faltas[k] : null)
  const primeraFalta = (['valor', 'texto', 'motivo', 'evidencia'] as const).find(k => faltas[k])

  function alternarConservado(id: string) {
    setConservar(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }

  function agregar(lista: File[], carpetas: string[] = []) {
    if (ocupado) return
    setError(null)
    const sel = clasificarSeleccion(cola.map(c => c.archivo), conservar.size + guardados.length, lista)
    // De cada archivo que no sirve se dice cuál es y por qué; los que sí sirven se adjuntan igual.
    setAvisos([...carpetas.map(nombre => ({ nombre, motivo: 'Es una carpeta: adjunta los archivos que contiene, no la carpeta.' })), ...sel.rechazados])
    marcar('elegidos', { n: lista.length, aceptados: sel.aceptados.length, rechazados: sel.rechazados.length, mb: Math.round(lista.reduce((t, f) => t + f.size, 0) / 1e5) / 10 })
    if (sel.aceptados.length > 0) {
      const entradas = sel.aceptados.map(entradaNueva)
      setCola(a => [...a, ...entradas])
      // Miniaturas: una por una, ya reducidas (no se decodifica la foto entera para dibujar un cuadro de 36 px).
      for (const e of entradas) {
        if (!esImagenDibujable(e.archivo)) continue
        cadenaMiniaturas.current = cadenaMiniaturas.current.then(async () => {
          const url = await crearMiniatura(e.archivo)
          if (!url) return
          // Si mientras tanto se quitó el archivo o se cerró el formulario, la miniatura sobra.
          if (!vivo.current || !colaRef.current.some(c => c.clave === e.clave)) { URL.revokeObjectURL(url); return }
          vistas.current.add(url)
          setCola(a => a.map(c => (c.clave === e.clave ? { ...c, vista: url } : c)))
        })
      }
    }
  }

  function quitarGuardado(ruta: string) {
    if (ocupado) return
    setGuardados(g => g.filter(x => x.ruta !== ruta))
  }

  function quitar(clave: string) {
    if (ocupado) return
    subidas.current.delete(clave)
    const vista = cola.find(c => c.clave === clave)?.vista
    if (vista) { URL.revokeObjectURL(vista); vistas.current.delete(vista) }
    setCola(a => a.filter(c => c.clave !== clave))
  }

  // Sube lo que falta de la cola (lo que no está ya subido). Lo usan «Enviar» y «Guardar borrador»: se sube igual, se registra distinto.
  async function subirPendientes(): Promise<{ ok: true } | { ok: false; error: string }> {
    // Solo se sube lo que no está ya subido: tras un fallo parcial, se reintentan únicamente los que fallaron.
    const pendientes = cola.filter(c => !subidas.current.has(c.clave))
    if (pendientes.length === 0) return { ok: true }
    setEtapa('subiendo')
    const prep = await acciones.prepararEvidencias({
      indicador: indicador.uuid,
      anio,
      archivos: pendientes.map(c => ({ nombre: c.archivo.name, tipo: c.archivo.type, bytes: c.archivo.size })),
    })
    marcar('preparado', { ok: prep.ok })
    if (!prep.ok) return { ok: false, error: prep.error }
    if (prep.datos.length !== pendientes.length) return { ok: false, error: 'No se pudo preparar la subida. Intenta de nuevo.' }
    const destino = new Map(pendientes.map((c, k) => [c.clave, prep.datos[k]]))

    // Hasta tres a la vez, cada uno por su cuenta: un archivo que falla no tumba a los demás.
    const resultados = await subirCola(
      pendientes,
      async (c, alProgreso) => {
        const d = destino.get(c.clave)!
        await subirEvidencia(d, c.archivo, { alProgreso })
        subidas.current.set(c.clave, { ruta: d.ruta, tipo: d.tipo })
      },
      {
        alCambio: (clave, cambio) => {
          if (cambio.estado === 'subiendo' && cambio.progreso === 0) marcar('sube')
          else if (cambio.estado === 'subido') marcar('subido')
          else if (cambio.estado === 'error') marcar('falla-subida', { error: limpio(cambio.error, 80) })
          setCola(actual => actual.map(c => {
            if (c.clave !== clave) return c
            if (cambio.estado === 'error') return { ...c, estado: 'error', error: cambio.error }
            return { ...c, estado: cambio.estado, progreso: cambio.progreso, error: undefined }
          }))
        },
      },
    )
    const fallidos = pendientes.flatMap(c => {
      const r = resultados.get(c.clave)
      return r && !r.ok ? [{ ...c, estado: 'error' as const, error: r.error }] : []
    })
    if (fallidos.length > 0) return { ok: false, error: mensajeDeFallos(fallidos) }
    return { ok: true }
  }

  /** Los archivos nuevos de la cola, ya subidos, tal como se registran. */
  const archivosSubidos = () => cola.map(c => {
    const s = subidas.current.get(c.clave)!
    return { ruta: s.ruta, nombre: c.archivo.name, tipo: s.tipo, bytes: c.archivo.size }
  })

  /** Tras un fallo del servidor, lo recién subido puede haberse retirado: la próxima vez se vuelve a subir, pero NO hay que volver a elegir los archivos. */
  function reiniciarSubidas() {
    subidas.current.clear()
    setCola(a => a.map(c => ({ ...c, estado: 'listo', progreso: 0, error: undefined })))
  }

  async function enviar() {
    if (ocupado) return
    setError(null)
    if (primeraFalta) {
      // Se dice qué falta en su propio campo y se lleva el cursor a él; el botón nunca está «apagado» sin explicar por qué.
      setIntento(true)
      document.getElementById({ valor: 'pdm-valor', texto: 'pdm-texto', motivo: 'pdm-motivo', evidencia: 'pdm-evidencia' }[primeraFalta])?.focus()
      return
    }
    const mal = errorEnReporte({ valor: numero, texto, motivo }, correccion)
      ?? errorEnArchivos(cola.map(c => ({ nombre: c.archivo.name, tipo: c.archivo.type, bytes: c.archivo.size })), conservar.size + guardados.length)
    if (mal || numero === null) { setError(mal ?? 'Escribe el valor del avance.'); return }

    marcar('enviar', { modo, nuevos: cola.filter(c => !subidas.current.has(c.clave)).length, total: total, mb: Math.round(cola.reduce((t, c) => t + c.archivo.size, 0) / 1e5) / 10 })
    await correr(async () => {
      const subida = await subirPendientes()
      if (!subida.ok) return subida

      setEtapa('registrando')
      marcar('registrando')
      const r = await acciones.reportar({
        indicador: indicador.uuid,
        anio,
        valor: numero,
        texto,
        // Lo guardado en el borrador ya está en el almacenamiento; el servidor lo vuelve a comprobar y calcula su huella al enviar.
        evidencias: [...guardados.map(g => ({ ruta: g.ruta, nombre: g.nombre, tipo: g.tipo, bytes: g.bytes })), ...archivosSubidos()],
        conservar: correccion ? [...conservar] : undefined,
        motivo: correccion ? motivo : undefined,
      })
      marcar('registrado', { ok: r.ok })
      if (!r.ok) reiniciarSubidas()
      return r
    }, {
      alTerminar: datos => {
        marcar('hecho')
        vistas.current.forEach(u => URL.revokeObjectURL(u))
        vistas.current.clear()
        setCola([])
        subidas.current.clear()
        setMotivo('')
        // El reporte ya borró el borrador (en la base): aquí también.
        setGuardados([])
        setBorradorGuardado(null)
        onHecho(datos.correccion ? 'Corrección enviada. La secretaría la revisará.' : 'Reporte enviado. La secretaría lo revisará.')
      },
      alFallar: setError,
      // El formulario lo reemplaza la pantalla al recargar el detalle: hasta entonces no vuelve a decir «Enviar».
      quedarseHecho: true,
    })
  }

  // Guarda lo que hay (aunque esté incompleto) como borrador: sube los archivos nuevos, igual que al enviar, y los deja esperando.
  async function guardarComoBorrador() {
    if (ocupado) return
    setError(null)
    if (valor.trim() !== '' && numero === null) {
      setIntento(true)
      setError('No se entiende ese número.')
      document.getElementById('pdm-valor')?.focus()
      return
    }
    const mal = errorEnBorrador({ valor: numero, texto, motivo: correccion ? motivo : undefined, archivos: guardados.length + cola.length, conservadas: conservar.size })
      ?? errorEnArchivosDelBorrador(cola.map(c => ({ nombre: c.archivo.name, tipo: c.archivo.type, bytes: c.archivo.size })), guardados.length, conservar.size)
    if (mal) { setError(mal); return }

    marcar('guarda-borrador', { modo, nuevos: cola.filter(c => !subidas.current.has(c.clave)).length, guardados: guardados.length })
    await correrBorrador(async () => {
      const subida = await subirPendientes()
      if (!subida.ok) return subida
      setEtapa('registrando')
      const r = await acciones.guardarBorrador({
        indicador: indicador.uuid,
        anio,
        version: borradorGuardado?.version ?? 0,
        valor: numero,
        texto,
        motivo: correccion ? motivo : undefined,
        conservar: correccion ? [...conservar] : undefined,
        archivos: [...guardados.map(g => ({ ruta: g.ruta, nombre: g.nombre, tipo: g.tipo, bytes: g.bytes })), ...archivosSubidos()],
      })
      marcar('borrador-guardado', { ok: r.ok })
      if (!r.ok) reiniciarSubidas()
      return r
    }, {
      alTerminar: b => {
        // Lo recién subido ya es del borrador: sale de la cola y entra a «guardados».
        vistas.current.forEach(u => URL.revokeObjectURL(u))
        vistas.current.clear()
        setCola([])
        subidas.current.clear()
        setGuardados(b.archivos)
        setBorradorGuardado(b)
        setFirmaBase(firmaDelFormulario({ valor, texto, motivo, conservar, guardados: b.archivos.map(a => a.ruta), porSubir: [] }))
      },
      alFallar: setError,
    })
  }

  // Borra el borrador (y sus archivos) y deja el formulario como si nunca se hubiera guardado.
  async function descartarElBorrador() {
    if (!borradorGuardado || ocupado) return
    setError(null)
    await correrDescarte(
      () => acciones.descartarBorrador({ indicador: indicador.uuid, anio, version: borradorGuardado.version }),
      {
        alTerminar: () => {
          vistas.current.forEach(u => URL.revokeObjectURL(u))
          vistas.current.clear()
          setCola([])
          subidas.current.clear()
          setGuardados([])
          setBorradorGuardado(null)
          setFirmaBase(null)
          setConfirmandoDescarte(false)
          setValor(correccion && vigente ? String(vigente.valor).replace('.', ',') : '')
          setTexto(correccion && vigente ? vigente.texto : '')
          setMotivo('')
          setConservar(porDefecto())
          if (modo === 'corregir' || modo === 'aprobado') setAbierto(false)
          onHecho('Borrador descartado.')
        },
        alFallar: m => { setError(m); setConfirmandoDescarte(false) },
      },
    )
  }

  const titulo = modo === 'nuevo' ? `Reportar avance · ${anio}` : modo === 'aprobado' ? `Nuevo avance · ${anio}` : modo === 'responder' ? 'Responder a la devolución' : 'Corregir el reporte'
  const hayFallidos = cola.some(c => c.estado === 'error')

  return (
    <Seccion rotulo={titulo}>
      {modo === 'responder' && vigente && (
        <p className={`mb-3 text-xs leading-relaxed ${T.avisoMal}`}>
          <b>La secretaría lo devolvió{vigente.validaciones.at(-1)?.validadorNombre ? ` (${nombrePropio(vigente.validaciones.at(-1)!.validadorNombre)})` : ''}:</b>{' '}
          {vigente.validaciones.at(-1)?.comentario ?? 'sin comentario'}
        </p>
      )}

      {borradorGuardado && (
        <div className={`mb-4 text-xs leading-relaxed ${T.avisoNota}`}>
          <p>
            <b>Borrador guardado</b> por {quienGuardo(borradorGuardado, yoId)} · {fechaHoraBogota(borradorGuardado.editadoEn)}. Solo lo ven
            quienes tienen este indicador a su cargo: la secretaría no lo ve hasta que lo envíes.
          </p>
          {situacionBorrador && situacionBorrador.quitados > 0 && (
            <p className="mt-1 font-medium">
              Desde que se guardó, el reporte cambió: ya no se {situacionBorrador.quitados === 1 ? 'conserva 1 archivo' : `conservan ${situacionBorrador.quitados} archivos`} de la versión anterior.
            </p>
          )}
          {situacionBorrador && situacionBorrador.motivoDescartado && (
            <p className="mt-1 font-medium">Desde que se guardó, el reporte cambió: ya no se corrige, es un avance nuevo, y el motivo de la corrección se quitó.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {confirmandoDescarte ? (
              <>
                <span className="font-medium text-[#192031]">¿Descartar el borrador? Se borran lo escrito y sus archivos.</span>
                <button type="button" onClick={descartarElBorrador} disabled={ocupado} className={T.botonSecChico}>{descartando ? 'Descartando…' : 'Sí, descartar'}</button>
                <button type="button" onClick={() => setConfirmandoDescarte(false)} disabled={ocupado} className={T.enlace}>No</button>
              </>
            ) : (
              <button type="button" id="pdm-descartar-borrador" onClick={() => setConfirmandoDescarte(true)} disabled={ocupado} className={T.enlace}>Descartar borrador</button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <label className="block">
          <span className={T.rotulo}>Valor del avance <span className="font-normal normal-case tracking-normal">({indicador.unidad.toLowerCase()})</span></span>
          <input
            id="pdm-valor"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={valor}
            disabled={ocupado}
            aria-invalid={ver('valor') ? true : undefined}
            aria-describedby={ver('valor') ? 'pdm-valor-error' : undefined}
            onChange={e => setValor(e.target.value.replace(/[^\d.,]/g, '').slice(0, 14))}
            className={`${T.campo} mt-1.5 tabular-nums ${ver('valor') ? CAMPO_MAL : ''}`}
          />
          {ver('valor') ? (
            <span id="pdm-valor-error" role="alert" className="mt-1 block text-[11px] font-medium text-[#B42318]">{ver('valor')}</span>
          ) : valor.trim() !== '' && (
            <span className={`mt-1 block text-[11px] ${numero === null ? 'text-[#B42318]' : 'text-[#667085]'}`}>
              {numero === null ? 'No se entiende ese número.' : `Se registrará ${fmt(numero)}`}
            </span>
          )}
          <span className="mt-1 block text-[11px] text-[#667085]">
            Es el avance de {anio}, medido contra su meta{indicador.meta !== null ? ` (${fmt(indicador.meta)})` : ''}.
          </span>
        </label>

        <label className="block">
          <span className={T.rotulo}>¿Qué se hizo?</span>
          <textarea
            id="pdm-texto"
            value={texto}
            disabled={ocupado}
            aria-invalid={ver('texto') ? true : undefined}
            aria-describedby={ver('texto') ? 'pdm-texto-error' : undefined}
            onChange={e => setTexto(e.target.value)}
            rows={3}
            maxLength={MAX_TEXTO_REPORTE}
            className={`${T.campo} mt-1.5 resize-none ${ver('texto') ? CAMPO_MAL : ''}`}
          />
          {ver('texto') && <span id="pdm-texto-error" role="alert" className="mt-1 block text-[11px] font-medium text-[#B42318]">{ver('texto')}</span>}
        </label>

        {correccion && (
          <label className="block">
            <span className={T.rotulo}>{modo === 'responder' ? '¿Cómo respondes a la devolución?' : '¿Qué corriges?'}</span>
            <textarea
              id="pdm-motivo"
              value={motivo}
              disabled={ocupado}
              aria-invalid={ver('motivo') ? true : undefined}
              aria-describedby={ver('motivo') ? 'pdm-motivo-error' : undefined}
              onChange={e => setMotivo(e.target.value)}
              rows={2}
              maxLength={MAX_MOTIVO_CORRECCION}
              className={`${T.campo} mt-1.5 resize-none ${ver('motivo') ? CAMPO_MAL : ''}`}
            />
            {ver('motivo') && <span id="pdm-motivo-error" role="alert" className="mt-1 block text-[11px] font-medium text-[#B42318]">{ver('motivo')}</span>}
          </label>
        )}

        <div>
          <span className={`${T.rotulo} mb-1.5 block`}>
            Evidencia <span className="font-normal normal-case tracking-normal">· obligatoria{total > 0 ? ` · ${total} ${total === 1 ? 'archivo' : 'archivos'}` : ''}</span>
          </span>

          {anteriores.length > 0 && (
            <div className="mb-3">
              <p className="text-xs leading-relaxed text-[#667085]">
                Archivos de la versión anterior: los que estaban bien pasan solos; no hace falta subirlos otra vez.
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {anteriores.map(a => a.observacion ? (
                  <li key={a.id} className="rounded-lg border border-[#F1C0BB] bg-[#FDF3F2] px-3 py-2 text-sm">
                    <p className="flex items-center gap-2">
                      <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="shrink-0 text-[#B42318]" />
                      <span className="min-w-0 flex-1 truncate font-medium text-[#192031]">{a.nombre}</span>
                      <span className="shrink-0 text-xs text-[#912018]">No se conserva</span>
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#912018]">
                      Devuelto por {nombrePropio(a.observacion.por)}: «{a.observacion.motivo}». Reemplázalo con uno nuevo o déjalo fuera.
                    </p>
                  </li>
                ) : (
                  <li key={a.id}>
                    <label className={`flex items-center gap-2.5 rounded-lg border bg-white px-3 py-2 text-sm ${ocupado ? 'opacity-60' : 'cursor-pointer'} ${conservar.has(a.id) ? 'border-[#DCE0E8]' : 'border-dashed border-[#C5CBD6]'}`}>
                      <input
                        type="checkbox"
                        checked={conservar.has(a.id)}
                        disabled={ocupado}
                        onChange={() => alternarConservado(a.id)}
                        className="h-4 w-4 shrink-0 accent-[#192031]"
                      />
                      <span className={`min-w-0 flex-1 truncate ${conservar.has(a.id) ? 'text-[#192031]' : 'text-[#667085] line-through'}`}>{a.nombre}</span>
                      <span className="shrink-0 text-xs tabular-nums text-[#667085]">{describirTamano(a.bytes)}</span>
                      <span className="shrink-0 text-xs font-medium text-[#556072]">{conservar.has(a.id) ? 'Se conserva' : 'Se quita'}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {guardados.length > 0 && (
            <div className="mb-3">
              <p className="text-xs leading-relaxed text-[#667085]">Guardados en el borrador: ya están subidos, no hace falta subirlos otra vez.</p>
              <ul className="mt-1.5 space-y-1.5">
                {guardados.map(g => (
                  <li key={g.ruta} className="flex items-center gap-2.5 rounded-lg border border-[#DCE0E8] bg-white px-3 py-1.5 text-sm">
                    <Icono glifo={(categoriaDeMime(g.tipo) ? GLIFO_DE_CATEGORIA[categoriaDeMime(g.tipo)!] : Iconos.documentos.adjunto)} tamano="sm" className="shrink-0 text-[#667085]" />
                    <span className="min-w-0 flex-1 truncate text-[#192031]">{g.nombre}</span>
                    <span className="shrink-0 text-xs tabular-nums text-[#667085]">{describirTamano(g.bytes)}</span>
                    <button
                      type="button"
                      onClick={() => quitarGuardado(g.ruta)}
                      disabled={ocupado}
                      className="shrink-0 rounded-md p-2 text-[#667085] transition-colors hover:bg-[#F4F5F8] hover:text-[#192031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta={`Quitar ${g.nombre} del borrador`} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ZonaEvidencias
            cola={cola}
            conservadas={conservar.size + guardados.length}
            bloqueada={ocupado}
            error={ver('evidencia')}
            avisos={avisos}
            onAgregar={agregar}
            onQuitar={quitar}
            onLimpiarAvisos={() => setAvisos([])}
          />
        </div>

        <Despliegue abierto={!!error} separacion="">
          {error ? <p role="alert" className={`[overflow-wrap:anywhere] text-xs font-medium ${T.avisoMal}`}>{error}</p> : null}
        </Despliegue>

        <div className="flex flex-wrap gap-2">
          {(modo === 'corregir' || modo === 'aprobado') && (
            <button onClick={() => { setAbierto(false); setError(null) }} disabled={ocupado} className={T.accionSecundaria}>{borradorGuardado ? 'Cerrar' : 'Cancelar'}</button>
          )}
          <BotonAccion
            id="pdm-guardar-borrador"
            variante="secundaria"
            fase={faseBorrador}
            onClick={guardarComoBorrador}
            inhabilitado={enviando || descartando}
            etiquetas={{
              reposo: 'Guardar borrador',
              trabajando: (
                <span key={etapa} className="pdm-velo-entra tabular-nums">
                  {etapa === 'subiendo' && resumen.total > 0
                    ? `${resumen.total === 1 ? 'Subiendo el archivo' : `Subiendo ${Math.min(resumen.total, resumen.subidos + 1)} de ${resumen.total}`} · ${resumen.porcentaje} %`
                    : 'Guardando'}
                </span>
              ),
              hecho: 'Borrador guardado',
            }}
          />
          <BotonAccion
            id="pdm-enviar"
            fase={fase}
            onClick={enviar}
            inhabilitado={guardandoBorrador || descartando}
            className="min-w-[9rem] flex-1"
            etiquetas={{
              reposo: hayFallidos ? 'Reintentar' : correccion ? 'Enviar corrección' : 'Enviar reporte',
              trabajando: (
                <span key={etapa} className="pdm-velo-entra tabular-nums">
                  {etapa === 'subiendo'
                    ? `${resumen.total === 1 ? 'Subiendo el archivo' : `Subiendo ${Math.min(resumen.total, resumen.subidos + 1)} de ${resumen.total}`} · ${resumen.porcentaje} %`
                    : 'Registrando'}
                </span>
              ),
              hecho: correccion ? 'Corrección enviada' : 'Reporte enviado',
            }}
          />
        </div>
        <p className="text-center text-xs leading-relaxed text-[#667085]">
          Tu reporte cuenta en el cumplimiento cuando la secretaría lo apruebe.
          {hayCambiosSinGuardar
            ? <span className="mt-0.5 block font-medium text-[#7A4A06]">Hay cambios sin guardar en el borrador.</span>
            : !borradorGuardado && <span className="mt-0.5 block">¿No puedes terminarlo hoy? Guarda un borrador y lo sigues cuando quieras: la secretaría no lo ve hasta que lo envíes.</span>}
        </p>
      </div>
    </Seccion>
  )
}
