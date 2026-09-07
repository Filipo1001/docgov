/**
 * lib/dictado-limpieza.ts — De habla a texto de informe.
 *
 * Esta es la capa que separa «un botón de micrófono» de un dictado que sirve.
 * Corre en el dispositivo, es instantánea y no cuesta nada.
 *
 * ── La regla que la gobierna ─────────────────────────────────────────────
 *
 * NO CAMBIA EL SIGNIFICADO. Nunca. Lo que se dicta aquí termina en un informe
 * de actividades que se radica en SECOP II y que una persona firma; el sistema
 * no puede poner en su boca algo que no dijo. Es la misma restricción que ya
 * gobierna `lib/redaccion.ts`.
 *
 * De ahí que todo lo que hace sea tipográfico —puntuación, mayúsculas,
 * espacios, siglas— y no interpretativo. Nada de resumir, reordenar ni
 * «mejorar» la frase.
 *
 * Por esa misma regla quedaron FUERA cosas que parecían buena idea:
 *
 *  · «este» como muletilla. Es la más común al hablar, pero también es un
 *    demostrativo legítimo: quitarla convertiría «este informe» en «informe»
 *    y «revisé este punto» en «revisé punto». El riesgo de corromper una
 *    frase real supera el beneficio de limpiar una muletilla.
 *  · «o sea», «digamos», «entonces». Muletillas casi siempre, pero también
 *    conectores válidos. Mismo argumento.
 *  · «pila» → PILA. En el dominio es la planilla de seguridad social, pero
 *    en español es una palabra corriente. «Dejé la pila de documentos» no
 *    debe volverse «Dejé la PILA de documentos».
 *
 * Solo se eliminan interjecciones que no son palabras en ningún contexto.
 */

/**
 * Puntuación dictada en voz alta.
 *
 * El reconocedor a veces devuelve el signo y a veces la palabra, según
 * navegador y plataforma; hay que soportar ambas. El orden importa: las
 * expresiones largas van primero para que «punto y aparte» no se resuelva
 * como «punto» seguido de «y aparte».
 */
const PUNTUACION: [RegExp, string][] = [
  [/\bpunto y aparte\b/gi, '.\n'],
  [/\bpunto y seguido\b/gi, '. '],
  [/\bnueva l[íi]nea\b/gi, '\n'],
  [/\bnuevo p[áa]rrafo\b/gi, '\n\n'],
  [/\bdos puntos\b/gi, ': '],
  [/\bpunto y coma\b/gi, '; '],
  [/\bsigno de interrogaci[óo]n\b/gi, '?'],
  [/\bsigno de exclamaci[óo]n\b/gi, '!'],
  [/\babrir par[ée]ntesis\b/gi, ' ('],
  [/\bcerrar par[ée]ntesis\b/gi, ') '],
  [/\babrir comillas\b/gi, ' "'],
  [/\bcerrar comillas\b/gi, '" '],
]

/**
 * «punto» y «coma» sueltos, SOLO al final del tramo dictado.
 *
 * Es la regla más delicada del archivo. Ambas son palabras corrientes —«el
 * punto tres», «hasta cierto punto», «que coma algo»— así que sustituirlas
 * en cualquier posición destrozaría frases legítimas.
 *
 * Al final del tramo el caso es el contrario: el reconocedor cierra un tramo
 * cuando la persona hace una pausa, y quien dice «punto» y se calla está
 * dictando el signo, no hablando de un punto. Fuera de esa posición se dejan
 * intactas: es preferible que el usuario ponga esa coma a mano antes que
 * corromperle una frase.
 */
const PUNTUACION_FINAL: [RegExp, string][] = [
  [/\s+punto\s*$/i, '.'],
  [/\s+coma\s*$/i, ','],
]

/** Interjecciones sin significado en ningún contexto del español. */
const MULETILLAS = /\b(eh+|ehm+|em+|mmm+|mm|ajam|aja+|este{2,})\b/gi

/**
 * Siglas del dominio. Solo las que no son palabras corrientes en español,
 * para que ponerlas en mayúscula no pueda corromper una frase real.
 */
const SIGLAS: [RegExp, string][] = [
  [/\bsecop\b/gi, 'SECOP'],
  [/\bcdp\b/gi, 'CDP'],
  [/\bcrp\b/gi, 'CRP'],
  [/\brut\b/gi, 'RUT'],
  [/\barl\b/gi, 'ARL'],
  [/\beps\b/gi, 'EPS'],
  [/\bdian\b/gi, 'DIAN'],
  [/\biva\b/gi, 'IVA'],
  [/\bsisben\b/gi, 'Sisbén'],
]

/** Mayúscula al principio del texto y después de punto, interrogación o cierre. */
function mayusculasDeFrase(t: string): string {
  return t
    .replace(/^(\s*)([a-záéíóúñ])/u, (_, esp, c: string) => esp + c.toUpperCase())
    .replace(/([.!?]\s+|\n\s*)([a-záéíóúñ])/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
}

/**
 * Limpia un tramo recién dictado.
 *
 * Se aplica a cada trozo definitivo, no al texto completo: así el usuario ve
 * el resultado ya limpio mientras habla, que es el punto de la funcionalidad.
 *
 * NO pone mayúsculas: eso lo decide `unirDictado`, que es quien ve el texto
 * completo. Capitalizar aquí producía «se verificó la vía Se tomaron fotos»,
 * porque cada tramo empezaba en mayúscula aunque cayera a mitad de frase.
 */
export function limpiarDictado(crudo: string): string {
  let t = ` ${crudo} `

  for (const [re, sub] of PUNTUACION) t = t.replace(re, sub)
  t = t.replace(MULETILLAS, ' ')
  // Después de quitar muletillas: «reunión con la comunidad eh punto» deja
  // el «punto» al final, que es donde la regla lo reconoce. Se recortan solo
  // espacios: un trimEnd() se llevaría el salto que «punto y aparte» produjo.
  t = t.replace(/[ \t]+$/, '')
  for (const [re, sub] of PUNTUACION_FINAL) t = t.replace(re, sub)
  for (const [re, sub] of SIGLAS) t = t.replace(re, sub)

  t = t
    .replace(/[ \t]+/g, ' ')              // espacios repetidos
    .replace(/\s+([,.;:!?])/g, '$1')      // espacio antes de signo
    .replace(/([,;:])(?=\S)/g, '$1 ')     // signo pegado a la palabra siguiente
    .replace(/\.{2,}/g, '.')              // puntos encadenados por el dictado
    .replace(/(\.\s*){2,}/g, '. ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/[ \t]*\n[ \t]*/g, '\n')     // sin espacios alrededor del salto

  // trim() a mano: se conserva el salto final. «punto y aparte» al cerrar un
  // tramo dejaba su \n al final y trim() se lo comía, así que el párrafo que
  // el usuario acababa de pedir en voz alta nunca ocurría.
  return t.replace(/^[ \t\n]+/, '').replace(/[ \t]+$/, '')
}

/**
 * Une lo ya escrito con el tramo nuevo.
 *
 * Separado de `limpiarDictado` porque la unión tiene sus propias reglas: hay
 * que respetar lo que el usuario escribió a mano antes de dictar —puede haber
 * dejado el texto a media frase— y no meter un espacio después de un salto de
 * línea ni antes de una coma.
 */
export function unirDictado(previo: string, nuevo: string): string {
  // trimEnd() borraría el salto que «punto y aparte» acaba de crear.
  const base = previo.replace(/[ \t]+$/, '')
  // Igual que arriba: .trim() se llevaría el salto final del tramo, que es
  // justo lo que hace que el siguiente empiece en párrafo nuevo.
  const trozo = nuevo.replace(/^\s+/, '').replace(/[ \t]+$/, '')
  if (!trozo) return previo
  if (!base) return mayusculasDeFrase(trozo)

  // Tras un salto de línea o un signo de apertura no va espacio.
  const sinEspacio = /[\n(¿¡]$/.test(base)
  const unido = sinEspacio ? base + trozo : `${base} ${trozo}`

  return mayusculasDeFrase(unido)
}
