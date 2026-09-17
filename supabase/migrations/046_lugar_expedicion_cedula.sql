-- Migration 046: lugar de expedición de la cédula, en el perfil de la persona
--
-- POR QUÉ. La Certificación de Retención en la Fuente afirma, dentro de la
-- frase jurada: «...identificado con cédula de ciudadanía No. X expedida en
-- LUGAR...». Hasta ahora ese LUGAR se rellenaba con el municipio del
-- contrato, así que las 14 certificaciones emitidas dicen «FREDONIA» sea
-- cierto o no. Un documento bajo juramento no puede afirmar un dato que
-- nadie comprobó.
--
-- POR QUÉ EN `usuarios` Y NO EN LA CERTIFICACIÓN. El lugar de expedición es
-- un atributo de la PERSONA: no cambia con el contrato ni con el año.
-- Guardarlo por certificación obligaría a teclearlo otra vez en cada contrato
-- nuevo y cada año gravable.
--
-- REGLA 2 de CLAUDE.md. `usuarios` tiene permisos POR COLUMNA: 18 de sus 21
-- columnas llevan ACL. Una columna nueva nace SIN permiso, y cualquier
-- consulta que la pida con sesión de usuario falla entera — ya tumbó la vista
-- de contratos en producción una vez. De ahí el GRANT explícito de abajo.
--
-- Sensibilidad: la misma que `direccion`, que ya está concedida a
-- `authenticated`. No es un dato reservado como la cuenta bancaria.
--
-- ORDEN DE DESPLIEGUE: esta migración va ANTES del código que lee la columna.
-- (Al revés que la 027, que quitaba permisos y tenía que ir después.)

alter table public.usuarios
  add column if not exists lugar_expedicion_cedula text;

comment on column public.usuarios.lugar_expedicion_cedula is
  'Municipio de expedición de la cédula, tal como aparece en el documento. '
  'Lo aporta la persona la primera vez que firma una certificación de '
  'retención; se reutiliza en cualquier documento que lo necesite.';

grant select (lugar_expedicion_cedula) on public.usuarios to authenticated;
