-- Migration 074: módulo Plan de Desarrollo — el tope de VIDEO baja de 200 a 100 MB
--
-- POR QUÉ. La 073 puso 200 MB al video. Para que esos 200 MB sirvieran había que subir el límite GLOBAL de archivo del almacenamiento
-- de Supabase (hoy 50 MB), y Felipe decidió dejarlo en 100 MB (20-oct-2026). Supabase no deja fijar un límite global menor que el de
-- un espacio de archivos («Global limit must be greater than that of individual buckets»), así que el espacio `pdm-evidencias`
-- tiene que bajar a 100 MB ANTES de poder fijar el global: esta migración lo desbloquea. Un tope de video mayor que el global tampoco
-- sirve: el almacenamiento rechazaría (413) lo que el formulario ofreciera.
--
-- QUÉ CAMBIA (todo lo demás de la 073 queda igual)
--
--   · `pdm_privado.limite_de_evidencia`: los videos MP4 y MOV pasan de 200 a 100 MB. Lo que no es video sigue en 25 MB. Es la única
--     lista de tipos de la base: `pdm_reportar` la consulta y su mensaje de error ya toma los dos topes de ella.
--   · `pdm_evidencias_bytes_check`: de 200 a 100 MB (el máximo de cualquier tipo).
--   · El espacio `pdm-evidencias`: de 200 a 100 MB.
--
-- NADA CAMBIA PARA LO YA REPORTADO: no se toca ninguna fila. Hoy no hay evidencias de más de 100 MB (el comprobador lo exige: si las
-- hubiera, la restricción nueva no se podría crear y la migración se detendría).

begin;

-- ─── 1. La lista de tipos y su tope ───────────────────────────────────────────

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
    when p_tipo in ('video/mp4', 'video/quicktime') then 104857600::bigint   -- 100 MB
    else null
  end
$f$;

-- ─── 2. La tabla de evidencias: su tope es el máximo de cualquier tipo ────────

alter table public.pdm_evidencias drop constraint pdm_evidencias_bytes_check;
alter table public.pdm_evidencias add constraint pdm_evidencias_bytes_check check (bytes > 0 and bytes <= 104857600);

-- ─── 3. El espacio de archivos ────────────────────────────────────────────────

update storage.buckets set file_size_limit = 104857600 where id = 'pdm-evidencias';

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_mb constant bigint := 1048576;
begin
  if pdm_privado.limite_de_evidencia('application/pdf') <> 25 * v_mb
     or pdm_privado.limite_de_evidencia('application/vnd.openxmlformats-officedocument.presentationml.presentation') <> 25 * v_mb
     or pdm_privado.limite_de_evidencia('image/heic') <> 25 * v_mb
     or pdm_privado.limite_de_evidencia('video/mp4') <> 100 * v_mb
     or pdm_privado.limite_de_evidencia('video/quicktime') <> 100 * v_mb then
    raise exception 'PDM 074: la función de límites no dice lo que debe';
  end if;
  if pdm_privado.limite_de_evidencia('video/webm') is not null or pdm_privado.limite_de_evidencia('application/zip') is not null
     or pdm_privado.limite_de_evidencia('') is not null or pdm_privado.limite_de_evidencia(null) is not null then
    raise exception 'PDM 074: la función de límites admite un tipo que no debe';
  end if;
  if has_function_privilege('anon', 'pdm_privado.limite_de_evidencia(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'pdm_privado.limite_de_evidencia(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'pdm_privado.limite_de_evidencia(text)', 'EXECUTE') then
    raise exception 'PDM 074: la función de límites perdió sus permisos';
  end if;

  if not exists (select 1 from storage.buckets where id = 'pdm-evidencias' and not public and file_size_limit = 100 * v_mb
                   and array_length(allowed_mime_types, 1) = 14) then
    raise exception 'PDM 074: el espacio pdm-evidencias no quedó privado, de 100 MB y con sus 14 tipos';
  end if;
  if exists (select 1 from storage.buckets b, unnest(b.allowed_mime_types) mt
              where b.id = 'pdm-evidencias' and pdm_privado.limite_de_evidencia(mt) is null) then
    raise exception 'PDM 074: el espacio admite tipos que la función no';
  end if;

  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.pdm_evidencias'::regclass and c.conname = 'pdm_evidencias_bytes_check'
                    and pg_get_constraintdef(c.oid) ~ 'bytes <= 104857600\)') then
    raise exception 'PDM 074: pdm_evidencias_bytes_check no quedó en 100 MB';
  end if;
  if exists (select 1 from public.pdm_evidencias where bytes > 100 * v_mb) then
    raise exception 'PDM 074: hay evidencias de más de 100 MB';
  end if;

  -- pdm_reportar no se tocó: sigue usando la función y conserva su ruta de búsqueda y sus permisos
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure
      and p.prosrc like '%pdm_privado.limite_de_evidencia%' and not p.prosecdef
      and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')) then
    raise exception 'PDM 074: pdm_reportar no quedó como debe';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/074_pdm_evidencias_video_100mb.sql (vuelve a los 200 MB de la 073).
