-- Migration 047: qué dependencia recibe además el consolidado del municipio
--
-- POR QUÉ. El consolidado mensual de cada secretaría llevaba al final cómo se
-- repartió el dinero entre las cuatro. Puesto así le llegaba a todas, y no le
-- corresponde a todas: al secretario de Desarrollo Territorial no le incumbe
-- cuánto está ejecutando Gobierno. La cifra agregada es presupuesto público,
-- pero «público» no es lo mismo que «se lo mando a todo el mundo».
--
-- Hacienda es la excepción con fundamento: tramita las cuentas de las cuatro
-- secretarías, así que el municipio entero ES su materia de trabajo.
--
-- La forma de dárselo no es un bloque extra dentro de su consolidado, sino el
-- MISMO correo que reciben el alcalde y la administración: las cuatro
-- secretarías comparadas, sin un solo nombre propio. Un correo menos que
-- mantener, y Hacienda ve exactamente lo que ve el alcalde.
--
-- POR QUÉ UNA COLUMNA Y NO EL NOMBRE EN EL CÓDIGO. Comparar contra
-- 'Secretaría de Hacienda' dentro de un `if` se rompe el día que la renombren
-- —ya pasó: la migración 035 absorbió Planeación dentro de Desarrollo
-- Territorial y hubo que perseguir el nombre por varias tablas—. Además así la
-- alcaldía puede cambiarlo sin tocar código.
--
-- REGLA 2 de CLAUDE.md. `dependencias` NO tiene permisos por columna: el único
-- `REVOKE SELECT ON public.<tabla>` de todo el historial de migraciones es el
-- de la 027, sobre `usuarios`. Una columna nueva aquí hereda el permiso de
-- tabla, así que no hace falta un GRANT por columna. Se deja dicho para que
-- quien venga detrás no tenga que volver a comprobarlo.
--
-- Lo lee el cron con el cliente de administración; la aplicación no la
-- consulta todavía. Mientras esta migración no esté aplicada, `cargarAmbitos`
-- lee la fila con `*`, la bandera llega vacía y el consolidado del municipio
-- va solo a los roles transversales — que es el comportamiento seguro.

alter table public.dependencias
  add column if not exists recibe_consolidado_municipio boolean not null default false;

comment on column public.dependencias.recibe_consolidado_municipio is
  'Si es cierto, el supervisor y los asesores de esta dependencia reciben '
  'además el consolidado mensual del municipio: las secretarías comparadas en '
  'cifras agregadas, igual que el alcalde. Reservado a quien tiene competencia '
  'sobre el presupuesto del municipio entero (Hacienda). Nunca lleva nombres.';

update public.dependencias
   set recibe_consolidado_municipio = true
 where nombre = 'Secretaría de Hacienda';
