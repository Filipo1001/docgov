-- REVERSIÓN de la migración 077 (un reporte admite hasta 100 archivos). NO forma parte de la cadena de migraciones: se pega a mano.
-- Vuelve al tope de 30 archivos por reporte y a 30 observaciones por validación, como lo dejó la 075. Ninguna función se reescribe: todas
-- consultan `pdm_privado.max_evidencias()`.
-- OJO: SE NIEGA si ya hay un reporte o un borrador con más de 30 archivos, o una validación con más de 30 observaciones: esos reportes no
-- podrían volver a corregirse ni a reabrirse con el tope de 30 (y la restricción de la tabla ni siquiera se podría crear). En ese caso hay
-- que decidir qué hacer con ellos antes de revertir; esta reversión no borra datos.
-- Si solo hace falta deshacer el CÓDIGO, no hace falta esto: con la 077 aplicada, el código anterior funciona igual (solo admite hasta 30).

begin;

do $$
begin
  if exists (select 1 from public.pdm_evidencias group by reporte_id having count(*) > 30) then
    raise exception 'Reversión 077: hay reportes con más de 30 archivos; no se revierte el tope';
  end if;
  if exists (select 1 from public.pdm_borradores b
              where cardinality(b.conservar) + (select count(*) from public.pdm_borrador_archivos a where a.borrador_id = b.id) > 30) then
    raise exception 'Reversión 077: hay borradores con más de 30 archivos; no se revierte el tope';
  end if;
  if exists (select 1 from public.pdm_validaciones where jsonb_array_length(observaciones) > 30) then
    raise exception 'Reversión 077: hay validaciones con más de 30 observaciones; no se revierte el tope';
  end if;
end $$;

create or replace function pdm_privado.max_evidencias()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $f$ select 30 $f$;

comment on function pdm_privado.max_evidencias() is
  'Cuántos archivos admite como máximo un reporte (red de seguridad; la aplicación no lo muestra). pdm_reportar, pdm_validar y pdm_borrador_guardar lo consultan. La aplicación tiene su copia en lib/pdm/seguimiento-acciones.ts (MAX_EVIDENCIAS) y la restricción pdm_validaciones_observaciones_check lleva el mismo número escrito; tests/pdm/seguimiento.test.ts vigila que los tres digan lo mismo.';

alter table public.pdm_validaciones drop constraint pdm_validaciones_observaciones_check;
alter table public.pdm_validaciones add constraint pdm_validaciones_observaciones_check
  check (jsonb_typeof(observaciones) = 'array' and jsonb_array_length(observaciones) <= 30);

do $$
begin
  if pdm_privado.max_evidencias() <> 30 then raise exception 'Reversión 077: la función del tope no dice 30'; end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.pdm_validaciones'::regclass and c.conname = 'pdm_validaciones_observaciones_check'
                    and pg_get_constraintdef(c.oid) ~ 'jsonb_array_length\(observaciones\) <= 30\)') then
    raise exception 'Reversión 077: pdm_validaciones_observaciones_check no quedó en 30';
  end if;
end $$;

commit;
