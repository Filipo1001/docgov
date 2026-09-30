/**
 * Quién es quién: cada nombre del Excel de seguimiento, atado a su usuario.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 *
 * En el archivo el responsable es texto escrito a mano («Jose Luis», «Albert
 * Gómez»). Para que un indicador tenga a quién exigirle el reporte, cada
 * nombre tiene que ser una persona de la plataforma: con su foto, su contrato
 * y su secretaría. Esta tabla es ese puente.
 *
 * ── Por qué está fija por identificador ──────────────────────────────────
 *
 * Las 28 entradas son un identificador de usuario, no una regla de
 * coincidencia de nombres. Una regla «primer nombre y primer apellido» acertó
 * 19 veces de 28, y se rompe el día que se cree un segundo «Sara Sánchez»: la
 * coincidencia pasaría a ser ambigua sin que nadie lo notara. Un identificador
 * no se mueve. La regla se usó UNA vez, para proponer; cada decisión la
 * confirmó una persona (29 de septiembre de 2026).
 *
 * ── Qué es provisional ───────────────────────────────────────────────────
 *
 * Vive en el código porque todavía no hay base de datos donde guardarlo. Es lo
 * primero que se cargará a la tabla de asignaciones cuando exista: estas mismas
 * decisiones son su semilla. No se pierde trabajo.
 *
 * ── Qué pasa cuando algo falla ───────────────────────────────────────────
 *
 * Nada se rompe. Si un identificador ya no existe (por ejemplo, porque se
 * eliminó el usuario), o un nombre nuevo del Excel no tiene entrada, esa persona
 * aparece en «Personas del Excel sin usuario» y el indicador conserva el texto
 * original. Ver `cargarDirectorio`.
 */

export type MotivoSinUsuario =
  /** Personal de planta al que aún no se le ha creado usuario. */
  | 'planta'
  /** Nadie ha confirmado quién es. No se adivina. */
  | 'pendiente'

export type Vinculo = { usuarioId: string } | { sinUsuario: MotivoSinUsuario }

export const VINCULOS: Record<string, Vinculo> = {
  // ── Contratistas y personal con usuario ──
  'Juliana Palacio':           { usuarioId: 'ebe42195-c35a-44c5-8c50-c5563b0c020a' },
  'Iván Darío Ramírez Patiño': { usuarioId: 'd1e6e326-7a9e-4916-b161-0b8e291e5e02' },
  'Yorledy Vásquez':           { usuarioId: '168755a5-e785-483d-918a-679b1398b314' }, // supervisora: planta con usuario
  'Felipe Restrepo':           { usuarioId: '32d89e0e-b3a4-44d2-b08f-fc7929955030' }, // hay dos cuentas con este nombre; es la que tiene los contratos
  'Leidy Estrada Quintero':    { usuarioId: '9fff20cb-3d98-439d-b4a0-892d086eae69' },
  'Sebastián Carmona':         { usuarioId: 'd3d3b8c9-84a0-4419-9715-70be621f48f2' },
  'Jose Luis':                 { usuarioId: 'e0963765-6ef7-4629-8566-ecfd7b9a3852' },
  'Héctor Hernández':          { usuarioId: 'b02b8314-beb7-45f0-9e5f-f2e0c09637c2' },
  'Maritza Mejía':             { usuarioId: '4f28aa8a-3cbd-4fc5-a631-e43263bd2af7' },
  'Albert Gómez':              { usuarioId: 'b0f0cfe8-49c1-4d56-be6a-00f98316c4c0' }, // figura «Albert»; el usuario es Alberth
  'Sara Sánchez':              { usuarioId: 'bbc03f34-377e-471a-81ac-4d0aef4bea64' }, // supervisora: planta con usuario
  'Johana Rodríguez':          { usuarioId: 'fcbd12f9-8de4-4c22-88fa-9e37b3da2535' }, // figura «Johana»; el usuario es Yohana
  'Laura Vallejo Henao':       { usuarioId: '17781786-fb41-4e64-8633-4888d7e8eeff' },
  'Daniel Zuluaga':            { usuarioId: '55ca55c8-b171-4723-904d-f34bc5e29052' },
  'Yeison Martínez':           { usuarioId: 'e52fdff6-ac99-4ace-88ed-264c609a87e8' },
  'Diana Aguilar':             { usuarioId: 'c4dbbabf-15e2-4218-95a7-ccd55b4d12fa' },
  'Lucas Muñóz':               { usuarioId: 'f312b50b-ae94-49d1-aa45-4684fca9368e' }, // supervisor: planta con usuario
  'Ivan Montoya':              { usuarioId: '3aedc550-9a8b-4ffd-af55-98e692fdb2a2' }, // supervisor: planta con usuario
  'Alejandra Londoño':         { usuarioId: 'c6e099c6-c00c-4514-9b32-2d48b7d69bcb' },
  'Jorge Zea':                 { usuarioId: '145eda43-884d-4465-bdb1-de4c58024ed7' },
  'Paula Villegas':            { usuarioId: '77f211a5-c188-4f80-9ad6-4008a914ca38' },
  'María Fernanda San Pedro':  { usuarioId: '8277bf21-ec34-443c-8769-05df529c8d1b' }, // el usuario se escribe «Sampedro»
  'Nelson Vallejo':            { usuarioId: '0508ff4b-b66a-4217-bcf8-4a2f8a20f1e8' },

  // ── Personal de planta sin usuario todavía ──
  'Mateo Ríos':                { sinUsuario: 'planta' },
  'Camila Quintero':           { sinUsuario: 'planta' },
  'Mateo Montoya':             { sinUsuario: 'planta' },
  'Luz Amparo Velásquez':      { sinUsuario: 'planta' },

  // ── Sin confirmar ──
  // Hay un usuario con los mismos dos apellidos (Lina Marcela Betancur Arroyave),
  // pero el nombre no coincide. Se deja pendiente hasta que alguien lo confirme.
  'Viviana Betancur Arroyave': { sinUsuario: 'pendiente' },
}
