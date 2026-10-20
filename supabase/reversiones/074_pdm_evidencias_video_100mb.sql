-- REVERSIÓN de la migración 074 (tope de video de 100 MB). NO forma parte de la cadena de migraciones: se pega a mano.
-- Devuelve el tope de video a 200 MB, como lo dejó la 073: la función de límites, la restricción de la tabla y el espacio de archivos.
-- OJO: el espacio de 200 MB solo sirve si el límite GLOBAL del almacenamiento (panel de Supabase) es de 200 MB o más; con menos,
-- el almacenamiento rechaza lo que pase del global. Con un global de 100 MB, esta reversión NO se puede aplicar desde el panel
-- (Supabase no deja un espacio con tope mayor que el global); por SQL sí, pero el tope efectivo seguiría siendo el global.

begin;

create or replace function pdm_privado.limite_de_evidencia(p_tipo text)
returns bigint
language sql
immutable
parallel safe
set search_path = ''
as $f$
  select case
    when p_tipo in (
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) then 26214400::bigint        -- 25 MB
    when p_tipo in ('video/mp4', 'video/quicktime') then 209715200::bigint   -- 200 MB
    else null
  end
$f$;

alter table public.pdm_evidencias drop constraint pdm_evidencias_bytes_check;
alter table public.pdm_evidencias add constraint pdm_evidencias_bytes_check check (bytes > 0 and bytes <= 209715200);

update storage.buckets set file_size_limit = 209715200 where id = 'pdm-evidencias';

commit;
