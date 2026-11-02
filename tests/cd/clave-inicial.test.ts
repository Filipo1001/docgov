import assert from 'node:assert/strict'
import { test } from 'node:test'
import { APP_METADATA_CLAVE_INICIAL, debeCambiarClave, validarClaveNueva } from '@/lib/clave-inicial'
import { cargaDelToken, necesitaRenovacion, segundosRestantesDelToken, tokenPideCambiarClave } from '@/lib/jwt-cookie'

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
/** Una cookie de sesión de Supabase con el token que se le pida (la firma no se verifica aquí). */
const cookieCon = (claims: Record<string, unknown>) => {
  const token = `${b64url({ alg: 'HS256' })}.${b64url(claims)}.firma`
  return [{ name: 'sb-proyecto-auth-token', value: JSON.stringify({ access_token: token, refresh_token: 'x' }) }]
}

test('la marca se reconoce solo cuando es exactamente true', () => {
  assert.equal(debeCambiarClave(APP_METADATA_CLAVE_INICIAL), true)
  assert.equal(debeCambiarClave({ debe_cambiar_clave: true, provider: 'email' }), true)
  for (const v of [{ debe_cambiar_clave: false }, { debe_cambiar_clave: 'true' }, { debe_cambiar_clave: 1 }, {}, null, undefined, 'x']) {
    assert.equal(debeCambiarClave(v), false, JSON.stringify(v))
  }
})

test('no se acepta la cédula como contraseña nueva, escrita como se escriba', () => {
  assert.match(validarClaveNueva('1036000111', '1036000111', '1036000111')!, /número de documento/)
  assert.match(validarClaveNueva('1.036.000.111'.replace(/\./g, ''), '1036000111', '1.036.000.111')!, /número de documento/, 'la cédula con puntos también')
  assert.equal(validarClaveNueva('12345678-ok-x', '12345678-ok-x', '1036000111'), null, 'contener la cédula no es igualarla')
})

test('las reglas de largo, confirmación y contraseñas obvias', () => {
  assert.match(validarClaveNueva('corta1', 'corta1', null)!, /al menos 8/)
  assert.match(validarClaveNueva('una-clave-larga', 'otra-clave-larga', null)!, /no coinciden/)
  assert.match(validarClaveNueva('aaaaaaaaaa', 'aaaaaaaaaa', null)!, /repetido/)
  assert.match(validarClaveNueva('12345678', '12345678', null)!, /secuencia/)
  assert.match(validarClaveNueva('87654321', '87654321', null)!, /secuencia/)
  assert.match(validarClaveNueva('abcdefgh', 'abcdefgh', null)!, /secuencia/)
  assert.equal(validarClaveNueva('mi-clave-propia', 'mi-clave-propia', '1036000111'), null)
  assert.equal(validarClaveNueva('Fredonia2026', 'Fredonia2026', null), null, 'sin reglas de mayúsculas ni símbolos')
})

test('el token se lee sin red: bandera, vencimiento y cookies troceadas', () => {
  const ahora = Math.floor(Date.now() / 1000)
  const marcada = cookieCon({ exp: ahora + 3000, app_metadata: { debe_cambiar_clave: true, provider: 'email' } })
  assert.equal(tokenPideCambiarClave(marcada), true)
  assert.equal(tokenPideCambiarClave(cookieCon({ exp: ahora + 3000, app_metadata: { debe_cambiar_clave: false } })), false)
  assert.equal(tokenPideCambiarClave(cookieCon({ exp: ahora + 3000 })), false)
  assert.ok(Math.abs(segundosRestantesDelToken(marcada)! - 3000) <= 2)
  assert.equal(necesitaRenovacion(marcada), false)
  assert.equal(necesitaRenovacion(cookieCon({ exp: ahora + 60 })), true, 'queda poco: hay que renovar')

  // Supabase trocea la cookie cuando es grande: se reensambla en orden.
  const entera = marcada[0].value
  const mitad = Math.floor(entera.length / 2)
  const troceada = [
    { name: 'sb-proyecto-auth-token.1', value: entera.slice(mitad) },
    { name: 'sb-proyecto-auth-token.0', value: entera.slice(0, mitad) },
  ]
  assert.equal(tokenPideCambiarClave(troceada), true)
})

test('ante cualquier duda la bandera es false y no se renueva a ciegas', () => {
  assert.equal(tokenPideCambiarClave([]), false)
  assert.equal(tokenPideCambiarClave([{ name: 'sb-x-auth-token', value: 'no-es-json' }]), false)
  assert.equal(tokenPideCambiarClave([{ name: 'sb-x-auth-token', value: JSON.stringify({ access_token: 'a.b' }) }]), false)
  assert.equal(cargaDelToken([]), null)
  assert.equal(necesitaRenovacion([]), true, 'sin token legible se pregunta al servidor')
})
