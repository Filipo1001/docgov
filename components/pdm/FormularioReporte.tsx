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
 *
 * ── El borrador se guarda solo ───────────────────────────────────────────
 *
 * Nadie pulsa «Guardar borrador». En cuanto hay algo distinto de lo último guardado, el formulario lo guarda: los archivos se suben y
 * se guardan al elegirlos; lo escrito, cuando se deja de teclear (`decidirAutoguardado`, en `lib/pdm/borradores.ts`, decide cuándo).
 * Los campos no se bloquean mientras se guarda: se puede seguir escribiendo y adjuntando, y lo que cambie se guarda en el guardado
 * siguiente.
 *
 *   · Un solo guardado a la vez (`guardandoRef`); «Enviar» pulsado en mitad de uno espera a que termine (`enviarCuando`).
 *   · Abrir el formulario no crea un borrador: lo que ya trae de la situación (el valor y el texto de lo que se corrige) no es un cambio.
 *   · Si falla, reintenta con pausas y se rinde tras unos intentos (no sube un video de 100 MB sin fin); «Reintentar» lo retoma.
 *   · Si otra persona guardó antes, NO se pisa su trabajo: se avisa y se ofrece cargar su versión.
 *   · Se guarda ya lo pendiente si la página se oculta o el formulario desaparece. Vacío del todo, el borrador se descarta.
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
import { MAX_FALLOS_AUTOGUARDADO, aplicarSituacion, decidirAutoguardado, esConflictoDeBorrador, estadoDelGuardado, firmaDelFormulario, quienGuardo } from '@/lib/pdm/borradores'
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
import ListaCompacta from './ListaCompacta'
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
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)
  // El botón cuenta lo que pasa: subiendo (con cuántos archivos y qué tanto) → registrando → enviado.
  const { fase, correr, ocupado: enviando } = useConfirmar()
  const { correr: correrDescarte, ocupado: descartando } = useConfirmar()
  // «Ocupado» es SOLO enviar o descartar: ahí los campos se bloquean. El guardado automático (más abajo) no bloquea nada: se escribe y se
  // adjunta mientras se guarda.
  const ocupado = enviando || descartando
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

  // Lo que hay en el formulario ahora, y lo que había cuando se guardó el borrador: si difieren, hay cambios sin guardar.
  const firma = firmaDelFormulario({ valor, texto, motivo, conservar, guardados: guardados.map(g => g.ruta), porSubir: cola.map(c => c.clave) })
  // La firma de lo último guardado. Sin borrador, la del formulario recién abierto: lo que ya trae por la situación (el valor y el texto del
  // reporte que se corrige) no es un cambio de nadie y no crea un borrador.
  const [firmaGuardada, setFirmaGuardada] = useState(firma)
  const hayCambiosSinGuardar = firma !== firmaGuardada

  // ── El guardado automático ─────────────────────────────────────────────────
  // Nadie pulsa «Guardar borrador»: lo que se escribe y lo que se adjunta se guarda solo (ver `decidirAutoguardado`). Un solo guardado a la vez.
  const [guardandoAuto, setGuardandoAuto] = useState(false)
  const guardandoRef = useRef(false)
  // La versión del borrador en la base (la que se manda de vuelta al guardar). En una referencia: un guardado empieza justo después de otro.
  const versionRef = useRef(borrador ? borrador.version : 0)
  // Los fallos seguidos, atados a la firma del formulario en que ocurrieron: en cuanto la persona cambia algo, empiezan de cero (los de antes
  // eran de lo anterior). `motivo`: por qué no se guarda, cuando no es la conexión y reintentar no lo arregla.
  const [fallo, setFallo] = useState<{ firma: string; n: number; motivo: string | null }>({ firma: '', n: 0, motivo: null })
  const fallos = fallo.firma === firma ? fallo.n : 0
  const motivoDelFallo = fallo.firma === firma ? fallo.motivo : null
  const registrarFallo = (deFirma: string, motivo: string | null = null, n?: number) =>
    setFallo(f => ({ firma: deFirma, n: n ?? (f.firma === deFirma ? f.n : 0) + 1, motivo }))
  const olvidarFallos = () => setFallo({ firma: '', n: 0, motivo: null })
  // Otra persona guardó el borrador antes: lo que se escribe ya no se guarda solo hasta que se decida.
  const [conflicto, setConflicto] = useState(false)
  // Se pidió enviar mientras se guardaba: se envía en cuanto ese guardado termine.
  const [enviarCuando, setEnviarCuando] = useState(false)
  // Ya se envió: el borrador murió con el envío (lo borra la base) y lo que queda en pantalla no debe resucitarlo.
  const [enviado, setEnviado] = useState(false)

  const numero = leerNumero(valor)

  // Mientras se sube, se guarda o hay algo sin guardar, cerrar la pestaña perdería el trabajo: el navegador pregunta antes.
  useEffect(() => {
    if (!ocupado && !guardandoAuto && !hayCambiosSinGuardar) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [ocupado, guardandoAuto, hayCambiosSinGuardar])

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
    if (ocupado || guardandoAuto) return
    setGuardados(g => g.filter(x => x.ruta !== ruta))
  }

  function quitar(clave: string) {
    if (ocupado) return
    subidas.current.delete(clave)
    const vista = cola.find(c => c.clave === clave)?.vista
    if (vista) { URL.revokeObjectURL(vista); vistas.current.delete(vista) }
    setCola(a => a.filter(c => c.clave !== clave))
  }

  // Sube lo que falta de `lista` (lo que no está ya subido). Lo usan «Enviar» y el guardado automático: se sube igual, se registra distinto.
  async function subirPendientes(lista: ArchivoEnCola<File>[]): Promise<{ ok: true } | { ok: false; error: string }> {
    // Solo se sube lo que no está ya subido: tras un fallo parcial, se reintentan únicamente los que fallaron.
    const pendientes = lista.filter(c => !subidas.current.has(c.clave))
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

  /** Los archivos de `lista` que ya están subidos, tal como se registran. */
  const archivosSubidos = (lista: ArchivoEnCola<File>[]) => lista.flatMap(c => {
    const s = subidas.current.get(c.clave)
    return s ? [{ ruta: s.ruta, nombre: c.archivo.name, tipo: s.tipo, bytes: c.archivo.size }] : []
  })

  /** Tras un fallo del servidor, lo recién subido puede haberse retirado: la próxima vez se vuelve a subir, pero NO hay que volver a elegir los archivos. */
  function reiniciarSubidas() {
    subidas.current.clear()
    setCola(a => a.map(c => ({ ...c, estado: 'listo', progreso: 0, error: undefined })))
  }

  async function enviar() {
    if (ocupado) return
    setEnviarCuando(false)
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
    // Si justo se está guardando el borrador (subiendo archivos, por ejemplo), se espera a que termine: lo que ese guardado deja cambia lo
    // que hay que enviar. En cuanto termina, el efecto de más abajo vuelve a llamar aquí con el formulario ya al día.
    if (guardandoRef.current) { setEnviarCuando(true); return }

    marcar('enviar', { modo, nuevos: cola.filter(c => !subidas.current.has(c.clave)).length, total: total, mb: Math.round(cola.reduce((t, c) => t + c.archivo.size, 0) / 1e5) / 10 })
    await correr(async () => {
      const subida = await subirPendientes(cola)
      if (!subida.ok) return subida

      setEtapa('registrando')
      marcar('registrando')
      const r = await acciones.reportar({
        indicador: indicador.uuid,
        anio,
        valor: numero,
        texto,
        // Lo guardado en el borrador ya está en el almacenamiento; el servidor lo vuelve a comprobar y calcula su huella al enviar.
        evidencias: [...guardados.map(g => ({ ruta: g.ruta, nombre: g.nombre, tipo: g.tipo, bytes: g.bytes })), ...archivosSubidos(cola)],
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
        setEnviado(true)
        onHecho(datos.correccion ? 'Corrección enviada. La secretaría la revisará.' : 'Reporte enviado. La secretaría lo revisará.')
      },
      alFallar: setError,
      // El formulario lo reemplaza la pantalla al recargar el detalle: hasta entonces no vuelve a decir «Enviar».
      quedarseHecho: true,
    })
  }

  /**
   * UN guardado del borrador: sube los archivos que faltan (igual que al enviar), los registra con lo escrito y deja el formulario al día
   * con lo que quedó. No bloquea los campos: se puede seguir escribiendo y adjuntando mientras tanto; lo que cambie durante el guardado se
   * guarda en el siguiente (la firma de lo guardado es la de lo que SE guardó, no la de lo que hay ahora).
   *
   * Lo escrito se toma tal como estaba al empezar; los archivos que se elijan mientras tanto quedan en la cola para el siguiente.
   */
  async function guardarElBorrador() {
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardandoAuto(true)
    const conservadas = correccion ? [...conservar] : []
    // El rastro de diagnóstico se deja solo cuando hay archivos de por medio: guardar un texto cada pocos segundos no es lo que se investiga.
    const nuevos = cola.filter(c => !subidas.current.has(c.clave)).length
    try {
      if (nuevos > 0) marcar('guarda-borrador', { modo, nuevos, guardados: guardados.length })
      const mal = errorEnBorrador({ valor: numero, texto, motivo: correccion ? motivo : undefined, archivos: guardados.length + cola.length, conservadas: conservadas.length })
        ?? errorEnArchivosDelBorrador(cola.map(c => ({ nombre: c.archivo.name, tipo: c.archivo.type, bytes: c.archivo.size })), guardados.length, conservadas.length)
      // Algo que reintentar no arregla: se dice y se deja de insistir hasta que cambie el formulario.
      if (mal) { registrarFallo(firma, mal, MAX_FALLOS_AUTOGUARDADO); return }

      const subida = await subirPendientes(cola)
      if (!subida.ok) { registrarFallo(firma); return }
      if (!vivo.current) marcar('guardado-tras-cerrar')

      setEtapa('registrando')
      const subidos = archivosSubidos(cola)
      const r = await acciones.guardarBorrador({
        indicador: indicador.uuid,
        anio,
        version: versionRef.current,
        valor: numero,
        texto,
        motivo: correccion ? motivo : undefined,
        conservar: correccion ? conservadas : undefined,
        archivos: [...guardados.map(g => ({ ruta: g.ruta, nombre: g.nombre, tipo: g.tipo, bytes: g.bytes })), ...subidos],
      })
      if (nuevos > 0) marcar('borrador-guardado', { ok: r.ok })
      if (!r.ok) {
        // Otra persona guardó antes: no se pisa su trabajo, se espera a que se decida. Lo demás se reintenta (con pausas, y con un tope).
        if (esConflictoDeBorrador(r.error)) { setConflicto(true); return }
        // El servidor retira lo recién subido cuando rechaza: la próxima vez se vuelve a subir, sin volver a elegir los archivos.
        reiniciarSubidas()
        registrarFallo(firma)
        return
      }
      const b = r.datos
      versionRef.current = b.version
      const rutasSubidas = new Set(subidos.map(s => s.ruta))
      // Lo recién subido ya es del borrador: sale de la cola y entra a «guardados». Lo que se eligió mientras se guardaba sigue en la cola.
      const guardadoEnCola = new Set(cola.filter(c => { const s = subidas.current.get(c.clave); return s && rutasSubidas.has(s.ruta) }).map(c => c.clave))
      for (const c of cola) {
        if (!guardadoEnCola.has(c.clave)) continue
        subidas.current.delete(c.clave)
        if (c.vista) { URL.revokeObjectURL(c.vista); vistas.current.delete(c.vista) }
      }
      setCola(a => a.filter(c => !guardadoEnCola.has(c.clave)))
      setGuardados(b.archivos)
      setBorradorGuardado(b)
      setFirmaGuardada(firmaDelFormulario({ valor, texto, motivo, conservar, guardados: b.archivos.map(a => a.ruta), porSubir: [] }))
      olvidarFallos()
    } catch {
      registrarFallo(firma)
    } finally {
      guardandoRef.current = false
      if (vivo.current) setGuardandoAuto(false)
    }
  }

  // El formulario quedó vacío (se borró todo lo escrito y se quitó todo archivo): un borrador vacío no se puede guardar, así que se descarta.
  async function descartarVacio() {
    if (guardandoRef.current || !borradorGuardado) return
    guardandoRef.current = true
    setGuardandoAuto(true)
    try {
      const r = await acciones.descartarBorrador({ indicador: indicador.uuid, anio, version: versionRef.current })
      if (!r.ok) {
        if (esConflictoDeBorrador(r.error)) { setConflicto(true); return }
        registrarFallo(firma)
        return
      }
      versionRef.current = 0
      setGuardados([])
      setBorradorGuardado(null)
      setFirmaGuardada(firma)
      olvidarFallos()
    } catch {
      registrarFallo(firma)
    } finally {
      guardandoRef.current = false
      if (vivo.current) setGuardandoAuto(false)
    }
  }

  // Lo que el formulario hace ahora con su borrador (ver `decidirAutoguardado`).
  const decision = decidirAutoguardado({
    firma,
    firmaGuardada,
    ocupado,
    guardando: guardandoAuto,
    detenido: conflicto || enviado,
    valorLegible: valor.trim() === '' || numero !== null,
    porSubir: cola.filter(c => c.estado !== 'subido').length,
    vacio: valor.trim() === '' && texto.trim() === '' && motivo.trim() === '' && conservar.size === 0 && guardados.length === 0 && cola.length === 0,
    hayBorrador: borradorGuardado !== null,
    fallos,
    urgente: enviarCuando,
  })
  // Las funciones de arriba nacen en cada pintado; el temporizador y los avisos del navegador usan siempre la última.
  const hacerRef = useRef<() => void>(() => {})
  useEffect(() => {
    hacerRef.current = () => { if (decision.accion === 'guardar') void guardarElBorrador(); else if (decision.accion === 'descartar') void descartarVacio() }
  })
  // Con el temporizador: cada cambio lo reinicia (se espera a que se deje de teclear).
  useEffect(() => {
    if (decision.accion === 'nada') return
    const t = setTimeout(() => hacerRef.current(), decision.enMs)
    return () => clearTimeout(t)
  }, [decision.accion, decision.accion === 'nada' ? 0 : decision.enMs, firma, fallos]) // eslint-disable-line react-hooks/exhaustive-deps
  // Si la página se oculta (se cambia de pestaña o de aplicación en el teléfono) o el formulario desaparece, lo pendiente se guarda ya.
  useEffect(() => {
    const oculta = () => { if (document.visibilityState === 'hidden') hacerRef.current() }
    document.addEventListener('visibilitychange', oculta)
    return () => { document.removeEventListener('visibilitychange', oculta); hacerRef.current() }
  }, [])
  // Se pidió enviar mientras se guardaba: ya terminó, se envía con el formulario al día (`enviar` apaga el pedido al empezar).
  useEffect(() => {
    if (!enviarCuando || guardandoAuto) return
    const t = setTimeout(() => { void enviar() }, 0)
    return () => clearTimeout(t)
  })

  // Otra persona guardó el borrador antes que esta pantalla: se lee su versión y se continúa desde ahí.
  async function cargarElBorradorMasReciente() {
    setError(null)
    const r = await acciones.detalleIndicador(indicador.uuid)
    if (!r.ok) { setError(r.error); return }
    const b = r.datos.borradores.find(x => x.anio === anio) ?? null
    if (!b) { onHecho('El borrador ya no existe: se envió o se descartó.'); return }
    const s = aplicarSituacion(b, anteriores, observados, correccion)
    vistas.current.forEach(u => URL.revokeObjectURL(u))
    vistas.current.clear()
    subidas.current.clear()
    versionRef.current = b.version
    const v = b.valor !== null ? String(b.valor).replace('.', ',') : ''
    setCola([])
    setValor(v)
    setTexto(b.texto)
    setMotivo(s.motivo)
    setConservar(new Set(s.conservar))
    setGuardados(b.archivos)
    setBorradorGuardado(b)
    setFirmaGuardada(firmaDelFormulario({ valor: v, texto: b.texto, motivo: s.motivo, conservar: s.conservar, guardados: b.archivos.map(a => a.ruta), porSubir: [] }))
    setConflicto(false)
    olvidarFallos()
  }

  // Borra el borrador (y sus archivos) y deja el formulario como si nunca se hubiera guardado.
  async function descartarElBorrador() {
    if (!borradorGuardado || ocupado || guardandoAuto) return
    setError(null)
    await correrDescarte(
      () => acciones.descartarBorrador({ indicador: indicador.uuid, anio, version: versionRef.current }),
      {
        alTerminar: () => {
          vistas.current.forEach(u => URL.revokeObjectURL(u))
          vistas.current.clear()
          setCola([])
          subidas.current.clear()
          versionRef.current = 0
          setGuardados([])
          setBorradorGuardado(null)
          setConfirmandoDescarte(false)
          const v = correccion && vigente ? String(vigente.valor).replace('.', ',') : ''
          const t = correccion && vigente ? vigente.texto : ''
          const c = porDefecto()
          setValor(v)
          setTexto(t)
          setMotivo('')
          setConservar(c)
          // Lo que queda es lo que el formulario trae de entrada: no es un cambio, no vuelve a crear un borrador.
          setFirmaGuardada(firmaDelFormulario({ valor: v, texto: t, motivo: '', conservar: c, guardados: [], porSubir: [] }))
          setConflicto(false)
          olvidarFallos()
          if (modo === 'corregir' || modo === 'aprobado') setAbierto(false)
          onHecho('Borrador descartado.')
        },
        alFallar: m => { setError(m); setConfirmandoDescarte(false) },
      },
    )
  }

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

  const titulo = modo === 'nuevo' ? `Reportar avance · ${anio}` : modo === 'aprobado' ? `Nuevo avance · ${anio}` : modo === 'responder' ? 'Responder a la devolución' : 'Corregir el reporte'
  const hayFallidos = cola.some(c => c.estado === 'error')
  const estadoGuardado = estadoDelGuardado({ conflicto, guardando: guardandoAuto, hayCambios: hayCambiosSinGuardar, valorLegible: valor.trim() === '' || numero !== null, fallos })

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
            <b>Borrador guardado</b> por {quienGuardo(borradorGuardado, yoId)} · {fechaHoraBogota(borradorGuardado.editadoEn)}. Se guarda solo. Lo ven
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
                <button type="button" onClick={descartarElBorrador} disabled={ocupado || guardandoAuto} className={T.botonSecChico}>{descartando ? 'Descartando…' : 'Sí, descartar'}</button>
                <button type="button" onClick={() => setConfirmandoDescarte(false)} disabled={ocupado} className={T.enlace}>No</button>
              </>
            ) : (
              <button type="button" id="pdm-descartar-borrador" onClick={() => setConfirmandoDescarte(true)} disabled={ocupado || guardandoAuto} className={T.enlace}>Descartar borrador</button>
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
              {/* Los devueltos primero: son los que piden hacer algo (reemplazarlos o dejarlos fuera), y con una lista compacta no deben quedar
                  escondidos al final. */}
              <div className="mt-1.5">
                <ListaCompacta
                  lista={[...anteriores.filter(a => a.observacion), ...anteriores.filter(a => !a.observacion)]}
                  clave={a => a.id}
                  className="space-y-1.5"
                  resumen={resto => {
                    const devueltos = resto.filter(a => a.observacion).length
                    const quitados = resto.filter(a => !a.observacion && !conservar.has(a.id)).length
                    const partes = [
                      devueltos > 0 ? (devueltos === 1 ? '1 devuelto' : `${devueltos} devueltos`) : null,
                      quitados > 0 ? (quitados === 1 ? '1 se quita' : `${quitados} se quitan`) : null,
                    ].filter(Boolean)
                    return partes.length > 0 ? partes.join(' · ') : null
                  }}
                >
                  {a => a.observacion ? (
                    <li className="rounded-lg border border-[#F1C0BB] bg-[#FDF3F2] px-3 py-2 text-sm">
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
                    <li>
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
                  )}
                </ListaCompacta>
              </div>
            </div>
          )}

          {guardados.length > 0 && (
            <div className="mb-3">
              <p className="text-xs leading-relaxed text-[#667085]">Guardados en el borrador: ya están subidos, no hace falta subirlos otra vez.</p>
              <div className="mt-1.5">
                <ListaCompacta lista={guardados} clave={g => g.ruta} className="space-y-1.5">
                  {g => (
                    <li className="flex items-center gap-2.5 rounded-lg border border-[#DCE0E8] bg-white px-3 py-1.5 text-sm">
                      <Icono glifo={(categoriaDeMime(g.tipo) ? GLIFO_DE_CATEGORIA[categoriaDeMime(g.tipo)!] : Iconos.documentos.adjunto)} tamano="sm" className="shrink-0 text-[#667085]" />
                      <span className="min-w-0 flex-1 truncate text-[#192031]">{g.nombre}</span>
                      <span className="shrink-0 text-xs tabular-nums text-[#667085]">{describirTamano(g.bytes)}</span>
                      <button
                        type="button"
                        onClick={() => quitarGuardado(g.ruta)}
                        disabled={ocupado || guardandoAuto}
                        className="shrink-0 rounded-md p-2 text-[#667085] transition-colors hover:bg-[#F4F5F8] hover:text-[#192031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] disabled:pointer-events-none disabled:opacity-30"
                      >
                        <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta={`Quitar ${g.nombre} del borrador`} />
                      </button>
                    </li>
                  )}
                </ListaCompacta>
              </div>
            </div>
          )}

          <ZonaEvidencias
            cola={cola}
            conservadas={conservar.size + guardados.length}
            bloqueada={ocupado}
            sinQuitar={guardandoAuto}
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

        {conflicto && (
          <div role="alert" className={`flex flex-wrap items-center justify-between gap-3 text-xs ${T.avisoMal}`}>
            <p className="min-w-0 flex-1 leading-relaxed">
              <b>Otra persona cambió este borrador mientras lo editabas.</b> Lo que escribes desde entonces no se guarda solo, para no pisar su
              trabajo. Cargar su versión reemplaza lo que hay en pantalla.
            </p>
            <button type="button" onClick={cargarElBorradorMasReciente} className={T.botonSecChico}>Cargar su versión</button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(modo === 'corregir' || modo === 'aprobado') && (
            <button onClick={() => { setAbierto(false); setError(null) }} disabled={ocupado || enviarCuando} className={T.accionSecundaria}>{borradorGuardado || hayCambiosSinGuardar ? 'Cerrar' : 'Cancelar'}</button>
          )}
          <BotonAccion
            id="pdm-enviar"
            // Si se pidió enviar mientras se guardaba, el botón ya está trabajando: lo que se sube en ese guardado es lo que se envía.
            fase={enviarCuando ? 'trabajando' : fase}
            onClick={enviar}
            inhabilitado={descartando}
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
        <div className="text-center text-xs leading-relaxed text-[#667085]">
          <p>Tu reporte cuenta en el cumplimiento cuando la secretaría lo apruebe.</p>
          {/* Cómo va el borrador. Se anuncia a quien usa lector de pantalla; no se pide hacer nada para guardarlo. */}
          <p id="pdm-estado-borrador" role="status" aria-live="polite" className={`mt-0.5 min-h-[1.25rem] ${estadoGuardado === 'reintentando' || estadoGuardado === 'detenido' || estadoGuardado === 'valor-ilegible' || estadoGuardado === 'conflicto' ? 'font-medium text-[#7A4A06]' : ''}`}>
            {estadoGuardado === 'guardando' ? 'Guardando el borrador…'
              : estadoGuardado === 'reintentando' ? 'No se pudo guardar el borrador. Se intenta de nuevo solo.'
                : estadoGuardado === 'detenido' ? (
                  <>
                    {motivoDelFallo ?? 'No se pudo guardar el borrador. Revisa tu conexión.'}{' '}
                    <button type="button" onClick={olvidarFallos} className={T.enlace}>Reintentar</button>
                  </>
                )
                  : estadoGuardado === 'valor-ilegible' ? 'Corrige el valor para que el borrador se guarde.'
                    : estadoGuardado === 'conflicto' ? 'Sin guardar: otra persona cambió el borrador.'
                      : borradorGuardado ? 'Todo está guardado en el borrador.'
                        : 'Lo que escribas o adjuntes se guarda solo como borrador: puedes dejarlo y seguir cuando quieras. La secretaría no lo ve hasta que lo envíes.'}
          </p>
        </div>
      </div>
    </Seccion>
  )
}
