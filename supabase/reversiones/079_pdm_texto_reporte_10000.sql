-- REVERSIÓN de la migración 079 («¿Qué se hizo?» hasta 10.000 caracteres). NO forma parte de la cadena de migraciones: se pega a mano.
-- Vuelve al largo de 5.000 caracteres, como lo dejó la 078: la función `pdm_privado.max_texto_reporte()` y la restricción del borrador.
-- Ninguna función de reportar o guardar se reescribe: consultan la función.
-- OJO: SE NIEGA si hay un borrador con más de 5.000 caracteres (la restricción vieja no se podría crear). Los REPORTES ya enviados con más de
-- 5.000 siguen siendo válidos (la tabla de reportes no limita el largo), pero corregirlos obligaría a recortar el texto: decidir antes de
-- revertir. Si solo hace falta deshacer el CÓDIGO, no hace falta esto: con la 079 aplicada, el código anterior funciona igual (solo admite
-- 5.000 en pantalla).

begin;

do $$
begin
  if exists (select 1 from public.pdm_borradores where char_length(texto) > 5000) then
    raise exception 'Reversión 079: hay borradores con más de 5.000 caracteres; no se revierte';
  end if;
end $$;

create or replace function pdm_privado.max_texto_reporte()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $f$ select 5000 $f$;

alter table public.pdm_borradores drop constraint pdm_borradores_texto_check;
alter table public.pdm_borradores add constraint pdm_borradores_texto_check check (char_length(texto) <= 5000);

do $$
begin
  if pdm_privado.max_texto_reporte() <> 5000 then raise exception 'Reversión 079: la función del largo no dice 5000'; end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.pdm_borradores'::regclass and c.conname = 'pdm_borradores_texto_check'
                    and pg_get_constraintdef(c.oid) ~ 'char_length\(texto\) <= 5000') then
    raise exception 'Reversión 079: pdm_borradores_texto_check no quedó en 5000';
  end if;
end $$;

commit;
