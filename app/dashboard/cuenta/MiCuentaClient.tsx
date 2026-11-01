'use client'

/**
 * «Mi cuenta». Cada bloque dice qué se puede cambiar aquí y qué no:
 *  - la foto, el teléfono, la firma, los avisos por correo y la contraseña los cambia la persona;
 *  - los datos del contrato (documento, correo, cargo, dependencia, cuenta bancaria) los registra la oficina de
 *    contratación, así que se muestran en lectura con la indicación de a quién pedir la corrección.
 *
 * Los mensajes van junto al bloque que los produjo, no en un alert() ni en una franja general: quien cambia el
 * teléfono no tiene por qué leer el resultado de la contraseña.
 */

import { useRef, useState, useTransition } from 'react'
import { useUsuario } from '@/lib/user-context'
import Avatar from '@/components/ui/Avatar'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import CapturaFirma from '@/components/firma/CapturaFirma'
import TarjetaBancaria, { type CuentaBancaria } from '@/components/cuenta/TarjetaBancaria'
import { comprimirFoto } from '@/lib/compress'
import { formatCedula } from '@/lib/format'
import { normalizarTelefono } from '@/lib/telefono'
import { guardarPreferenciaNotificacion, guardarTelefonoUsuario } from '@/app/actions/usuario'
import { prepararMiFoto, confirmarMiFoto, cambiarMiContrasena } from '@/app/actions/mi-cuenta'

export interface DatosMiCuenta {
  nombre: string
  documento: string | null
  tipoDocumento: string | null
  correo: string
  telefono: string
  direccion: string | null
  cargo: string | null
  rol: string
  dependencia: string | null
  foto: string | null
  /** URL firmada de la firma registrada (el espacio `documentos` es privado), o null. */
  firma: string | null
  /** Solo para contratistas; null para los demás roles. */
  cuentaBancaria: CuentaBancaria | null
  avisoCorreo: boolean
  /** null cuando WhatsApp no está configurado en este entorno: entonces no se ofrece. */
  whatsapp: { activo: boolean } | null
}

const ROL: Record<string, string> = {
  admin: 'Administración',
  contratacion: 'Contratación',
  contratista: 'Contratista',
  asesor: 'Asesoría jurídica',
  supervisor: 'Secretaría',
  alcalde: 'Despacho del alcalde',
  funcionario: 'Funcionario',
}

type Mensaje = { tipo: 'ok' | 'error'; texto: string } | null

const TARJETA = 'bg-white rounded-2xl border border-gray-200 p-5 sm:p-6'
const TITULO = 'text-base font-semibold text-gray-900'
const CAMPO =
  'w-full min-h-12 px-3.5 rounded-xl border border-gray-300 bg-white text-base sm:text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-shadow focus:border-gray-900 focus:ring-2 focus:ring-gray-900/15'
const BOTON_PRINCIPAL =
  'inline-flex items-center justify-center min-h-12 px-5 rounded-xl bg-gray-900 text-white text-sm font-semibold transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2'
const BOTON_SECUNDARIO =
  'inline-flex items-center justify-center min-h-12 px-5 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2'

function Aviso({ mensaje }: { mensaje: Mensaje }) {
  // La región existe siempre, vacía o no, para que el lector de pantalla anuncie el resultado cuando llega.
  return (
    <p
      role="status"
      aria-live="polite"
      className={`text-sm empty:hidden ${mensaje?.tipo === 'error' ? 'text-red-700' : 'text-emerald-700'}`}
    >
      {mensaje?.texto ?? ''}
    </p>
  )
}

function Interruptor({
  id,
  activo,
  ocupado,
  onCambiar,
  etiqueta,
}: {
  id: string
  activo: boolean
  ocupado: boolean
  onCambiar: () => void
  etiqueta: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={ocupado}
      onClick={onCambiar}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-60 ${
        activo ? 'bg-gray-900' : 'bg-gray-300'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${
          activo ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ─── Identidad y foto ────────────────────────────────────────────────────────

function Identidad({ datos }: { datos: DatosMiCuenta }) {
  const { actualizarUsuario } = useUsuario()
  const [foto, setFoto] = useState(datos.foto)
  const [subiendo, setSubiendo] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = '' // para poder volver a elegir el mismo archivo
    if (!archivo) return
    setMensaje(null)
    setSubiendo(true)
    try {
      // Se comprime en el navegador (400 × 400): de ~550 KB a ~30 KB, y la subida tarda un instante en datos móviles.
      const comprimida = await comprimirFoto(archivo)
      const prep = await prepararMiFoto(comprimida.name, comprimida.size, comprimida.type)
      if (prep.error || !prep.data) { setMensaje({ tipo: 'error', texto: prep.error ?? 'No se pudo subir la foto.' }); return }

      const subida = await fetch(prep.data.urlSubida, {
        method: 'PUT',
        headers: { 'Content-Type': comprimida.type },
        body: comprimida,
      })
      if (!subida.ok) { setMensaje({ tipo: 'error', texto: 'No se pudo subir la foto. Revisa tu conexión e inténtalo de nuevo.' }); return }

      const conf = await confirmarMiFoto(prep.data.urlPublica)
      if (conf.error || !conf.data) { setMensaje({ tipo: 'error', texto: conf.error ?? 'No se pudo guardar la foto.' }); return }

      setFoto(conf.data.url)
      actualizarUsuario({ foto_url: conf.data.url })
      setMensaje({ tipo: 'ok', texto: 'Foto actualizada.' })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo leer esa imagen. Prueba con una foto JPG o PNG.' })
    } finally {
      setSubiendo(false)
    }
  }

  const rol = ROL[datos.rol] ?? datos.rol

  return (
    <section aria-label="Tu identidad" className={`${TARJETA} flex flex-col items-center text-center gap-4 sm:flex-row sm:text-left sm:gap-6`}>
      <div className="relative shrink-0">
        <div className={subiendo ? 'opacity-50 transition-opacity' : ''}>
          <Avatar nombre={datos.nombre || '·'} foto={foto} clases="w-24 h-24 text-3xl" />
        </div>
        {/* El input va con `hidden`, no con `sr-only`: un input sr-only dentro de un contenedor con overflow-hidden
            dejó la ventana en blanco al cancelar el selector en el módulo del plan. */}
        <input
          ref={archivoRef}
          id="mi-foto"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,.heic"
          className="hidden"
          onChange={alElegir}
        />
        <button
          type="button"
          onClick={() => archivoRef.current?.click()}
          disabled={subiendo}
          aria-label={foto ? 'Cambiar tu foto' : 'Subir tu foto'}
          className="absolute -right-1 -bottom-1 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-gray-900 shadow-sm transition-colors hover:bg-gray-200 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          <Icono glifo={Iconos.dominio.evidencia} tamano="sm" />
        </button>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-balance break-words">{datos.nombre}</h2>
        <p className="text-sm text-gray-600">
          {rol}
          {datos.dependencia && <> · {datos.dependencia}</>}
        </p>
        <div className="pt-1 min-h-5">
          {subiendo ? (
            <p role="status" className="text-sm text-gray-600">Subiendo tu foto…</p>
          ) : mensaje ? (
            <Aviso mensaje={mensaje} />
          ) : (
            <p className="text-xs text-gray-500">{foto ? 'Toca la cámara para cambiar tu foto.' : 'Toca la cámara para subir tu foto.'}</p>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Datos registrados por contratación ──────────────────────────────────────

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{etiqueta}</dt>
      <dd className={`mt-0.5 text-sm break-words ${valor ? 'text-gray-900' : 'text-gray-400'}`}>{valor ?? 'Sin registrar'}</dd>
    </div>
  )
}

function TusDatos({ datos }: { datos: DatosMiCuenta }) {
  const documento = datos.documento
    ? `${datos.tipoDocumento && datos.tipoDocumento !== 'CC' ? datos.tipoDocumento : 'C.C.'} ${formatCedula(datos.documento)}`
    : null
  return (
    <section aria-labelledby="t-datos" className={TARJETA}>
      <h2 id="t-datos" className={TITULO}>Tus datos</h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <Dato etiqueta="Documento" valor={documento} />
        <Dato etiqueta="Correo" valor={datos.correo || null} />
        <Dato etiqueta="Cargo" valor={datos.cargo} />
        <Dato etiqueta="Dependencia" valor={datos.dependencia} />
        <Dato etiqueta="Dirección" valor={datos.direccion} />
      </dl>
      {datos.cuentaBancaria && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-gray-700">Cuenta para tus pagos</h3>
          <div className="max-w-md">
            <TarjetaBancaria cuenta={datos.cuentaBancaria} titular={datos.nombre} />
          </div>
        </div>
      )}
      <p className="mt-5 flex gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <Icono glifo={Iconos.estado.informacion} tamano="sm" className="mt-0.5 shrink-0 text-gray-400" />
        <span>Estos datos los registra la oficina de contratación. Si alguno está mal, pídeles la corrección.</span>
      </p>
    </section>
  )
}

// ─── Teléfono ────────────────────────────────────────────────────────────────

function Telefono({ datos }: { datos: DatosMiCuenta }) {
  const { actualizarUsuario } = useUsuario()
  const [valor, setValor] = useState(datos.telefono)
  const [guardado, setGuardado] = useState(datos.telefono)
  const [mensaje, setMensaje] = useState<Mensaje>(null)
  const [pendiente, iniciar] = useTransition()

  const limpio = valor.trim()
  const revision = limpio ? normalizarTelefono(limpio) : null
  // Un fijo es un número válido: solo se advierte cuando no parece un teléfono colombiano.
  const advertencia = revision && !revision.ok && revision.motivo === 'invalido'
    ? 'No parece un número colombiano. Un celular tiene 10 dígitos y empieza por 3.'
    : null

  function guardar(e: React.FormEvent) {
    e.preventDefault()
    setMensaje(null)
    iniciar(async () => {
      const res = await guardarTelefonoUsuario(limpio).catch(() => ({ ok: false as const, error: 'No se pudo guardar. Revisa tu conexión.' }))
      if (res.ok) {
        setGuardado(limpio)
        actualizarUsuario({ telefono: limpio || undefined })
        setMensaje({ tipo: 'ok', texto: 'Teléfono guardado.' })
      } else {
        setMensaje({ tipo: 'error', texto: res.error ?? 'No se pudo guardar el teléfono.' })
      }
    })
  }

  return (
    <section aria-labelledby="t-tel" className={TARJETA}>
      <h2 id="t-tel" className={TITULO}>Teléfono</h2>
      <p className="mt-1 text-sm text-gray-600">Para que tu supervisor o la oficina de contratación puedan llamarte.</p>
      <form onSubmit={guardar} className="mt-4 space-y-3">
        <div>
          <label htmlFor="mi-telefono" className="block text-sm font-medium text-gray-700 mb-1.5">Celular</label>
          <input
            id="mi-telefono"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={valor}
            onChange={e => { setValor(e.target.value); setMensaje(null) }}
            placeholder="300 123 4567"
            aria-describedby={advertencia ? 'mi-telefono-ayuda' : undefined}
            className={CAMPO}
          />
          {advertencia && <p id="mi-telefono-ayuda" className="mt-1.5 text-sm text-amber-700">{advertencia}</p>}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="submit" disabled={pendiente || limpio === guardado} className={`${BOTON_PRINCIPAL} w-full sm:w-auto`}>
            {pendiente ? 'Guardando…' : 'Guardar'}
          </button>
          <Aviso mensaje={mensaje} />
        </div>
      </form>
    </section>
  )
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

function Avisos({ datos }: { datos: DatosMiCuenta }) {
  const [correo, setCorreo] = useState(datos.avisoCorreo)
  const [whatsapp, setWhatsapp] = useState(datos.whatsapp?.activo ?? false)
  const [ocupado, setOcupado] = useState<'email' | 'whatsapp' | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje>(null)

  // El interruptor solo se mueve cuando el servidor confirma el guardado.
  async function cambiar(canal: 'email' | 'whatsapp', siguiente: boolean) {
    if (ocupado) return
    setMensaje(null)
    setOcupado(canal)
    const res = await guardarPreferenciaNotificacion(canal, siguiente).catch(() => ({ ok: false as const, error: 'No se pudo guardar. Revisa tu conexión.' }))
    if (res.ok) (canal === 'email' ? setCorreo : setWhatsapp)(siguiente)
    else setMensaje({ tipo: 'error', texto: res.error ?? 'No se pudo guardar la preferencia.' })
    setOcupado(null)
  }

  return (
    <section aria-labelledby="t-avisos" className={TARJETA}>
      <h2 id="t-avisos" className={TITULO}>Avisos</h2>
      <div className="mt-4 divide-y divide-gray-100">
        <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
          <label htmlFor="aviso-correo" className="min-w-0 cursor-pointer">
            <span className="block text-sm font-medium text-gray-900">Por correo</span>
            <span className="block text-sm text-gray-600">Devoluciones, aprobaciones y recordatorios de tus informes.</span>
          </label>
          <Interruptor
            id="aviso-correo"
            activo={correo}
            ocupado={ocupado === 'email'}
            onCambiar={() => cambiar('email', !correo)}
            etiqueta="Avisos por correo"
          />
        </div>
        {datos.whatsapp && (
          <div className="flex items-center justify-between gap-4 py-3">
            <label htmlFor="aviso-whatsapp" className="min-w-0 cursor-pointer">
              <span className="block text-sm font-medium text-gray-900">Por WhatsApp</span>
              <span className="block text-sm text-gray-600">Al celular que registraste arriba.</span>
            </label>
            <Interruptor
              id="aviso-whatsapp"
              activo={whatsapp}
              ocupado={ocupado === 'whatsapp'}
              onCambiar={() => cambiar('whatsapp', !whatsapp)}
              etiqueta="Avisos por WhatsApp"
            />
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-gray-500">Dentro de Contratista Digital, la campana te avisa siempre.</p>
      <div className="mt-2"><Aviso mensaje={mensaje} /></div>
    </section>
  )
}

// ─── Seguridad ───────────────────────────────────────────────────────────────

function Seguridad() {
  const [abierto, setAbierto] = useState(false)
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje>(null)
  const [pendiente, iniciar] = useTransition()

  const noCoinciden = confirmacion.length > 0 && nueva !== confirmacion

  function cerrar() {
    setAbierto(false)
    setNueva('')
    setConfirmacion('')
    setMostrar(false)
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault()
    setMensaje(null)
    iniciar(async () => {
      const res = await cambiarMiContrasena(nueva, confirmacion).catch(() => ({ error: 'No se pudo cambiar la contraseña. Revisa tu conexión.' }))
      if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
      cerrar()
      setMensaje({ tipo: 'ok', texto: 'Contraseña cambiada. Úsala la próxima vez que inicies sesión.' })
    })
  }

  return (
    <section aria-labelledby="t-seg" className={TARJETA}>
      <h2 id="t-seg" className={TITULO}>Contraseña</h2>
      {!abierto ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">Cámbiala si alguien más la conoce o si sigue siendo la que te entregaron.</p>
          <button type="button" onClick={() => { setMensaje(null); setAbierto(true) }} className={`${BOTON_SECUNDARIO} w-full sm:w-auto shrink-0`}>
            Cambiar contraseña
          </button>
        </div>
      ) : (
        <form onSubmit={guardar} className="mt-4 space-y-4">
          <div>
            <label htmlFor="clave-nueva" className="block text-sm font-medium text-gray-700 mb-1.5">Nueva contraseña</label>
            <input
              id="clave-nueva"
              type={mostrar ? 'text' : 'password'}
              autoComplete="new-password"
              value={nueva}
              onChange={e => setNueva(e.target.value)}
              aria-describedby="clave-nueva-ayuda"
              className={CAMPO}
              autoFocus
            />
            <p id="clave-nueva-ayuda" className={`mt-1.5 text-sm ${nueva.length > 0 && nueva.length < 8 ? 'text-amber-700' : 'text-gray-500'}`}>
              Al menos 8 caracteres.
            </p>
          </div>
          <div>
            <label htmlFor="clave-confirmacion" className="block text-sm font-medium text-gray-700 mb-1.5">Repítela</label>
            <input
              id="clave-confirmacion"
              type={mostrar ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmacion}
              onChange={e => setConfirmacion(e.target.value)}
              aria-invalid={noCoinciden}
              aria-describedby={noCoinciden ? 'clave-confirmacion-ayuda' : undefined}
              className={CAMPO}
            />
            {noCoinciden && <p id="clave-confirmacion-ayuda" className="mt-1.5 text-sm text-amber-700">Las dos contraseñas no coinciden.</p>}
          </div>
          <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer min-h-11">
            <input type="checkbox" checked={mostrar} onChange={e => setMostrar(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-gray-900" />
            Mostrar lo que escribo
          </label>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { cerrar(); setMensaje(null) }} className={`${BOTON_SECUNDARIO} w-full sm:w-auto`}>Cancelar</button>
            <button type="submit" disabled={pendiente || nueva.length < 8 || nueva !== confirmacion} className={`${BOTON_PRINCIPAL} w-full sm:w-auto`}>
              {pendiente ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </div>
        </form>
      )}
      <div className="mt-3"><Aviso mensaje={mensaje} /></div>
    </section>
  )
}

// ─── Pantalla ────────────────────────────────────────────────────────────────

export default function MiCuentaClient({ datos }: { datos: DatosMiCuenta }) {
  const [firma, setFirma] = useState(datos.firma)

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:space-y-5 md:px-8 md:py-8">
      <h1 className="text-2xl font-bold text-gray-900">Mi cuenta</h1>

      <Identidad datos={datos} />
      <TusDatos datos={datos} />

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
        <Telefono datos={datos} />
        <Avisos datos={datos} />
      </div>

      {/* El ancla #firma la usa el aviso «Registra tu firma» del informe del mes. */}
      <div id="firma" className="scroll-mt-20">
        <CapturaFirma nombre={datos.nombre} cedula={datos.documento} firmaActual={firma} onGuardada={setFirma} />
      </div>

      <Seguridad />
    </div>
  )
}
