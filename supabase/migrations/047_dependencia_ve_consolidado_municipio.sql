-- Migration 047: qué dependencia puede ver el reparto del municipio
--
-- POR QUÉ. El consolidado mensual llevaba, al final, cómo se repartió el
-- dinero radicado entre las cuatro secretarías. Puesto así le llegaba a todas,
-- y no le corresponde a todas: al secretario de Desarrollo Territorial no le
-- incumbe cuánto está ejecutando Gobierno. La cifra agregada es presupuesto
-- público, pero «público» no es lo mismo que «se lo mando a todo el mundo».
--
-- Hacienda es la excepción con fundamento: paga las cuentas de las cuatro
-- secretarías, así que el reparto del municipio ES su materia de trabajo.
--
-- POR QUÉ UNA COLUMNA Y NO EL NOMBRE EN EL CÓDIGO. Comparar contra
-- 'Secretaría de Hacienda' dentro de un `if` se rompe el día que la renombren
-- —ya pasó una vez: la migración 035 absorbió Planeación dentro de Desarrollo
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
-- consulta todavía.

alter table public.dependencias
  add column if not exists ve_consolidado_municipio boolean not null default false;

comment on column public.dependencias.ve_consolidado_municipio is
  'Si es cierto, el consolidado mensual de esta dependencia incluye además el '
  'reparto del valor radicado entre TODAS las secretarías. Reservado a quien '
  'tiene competencia sobre el presupuesto del municipio entero (Hacienda). '
  'Las cifras son agregadas: nunca lleva nombres de otras dependencias.';

update public.dependencias
   set ve_consolidado_municipio = true
 where nombre = 'Secretaría de Hacienda';
