/**
 * conLimite — ninguna promesa de datos puede colgarse sin límite.
 *
 * La lección del panel congelado: una promesa que nunca se asienta deja a
 * TanStack en isLoading para siempre y la pantalla en esqueleto mudo, sin
 * error, sin reintento, sin nada que el usuario pueda hacer. Un TIMEOUT la
 * convierte en un error normal: visible, reintentable y con registro.
 *
 * Envuelve los queryFn de los paneles. 15 s es holgadísimo para consultas
 * que tardan decenas de milisegundos, y suficiente para red rural lenta.
 */
export function conLimite<T>(promesa: Promise<T>, etiqueta: string, ms = 15_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${etiqueta}: sin respuesta en ${Math.round(ms / 1000)} s`))
    }, ms)
    promesa.then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) },
    )
  })
}
