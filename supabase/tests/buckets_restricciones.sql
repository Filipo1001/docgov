-- ============================================================================
-- Pruebas de los TOPES Y TIPOS de los espacios de archivos `evidencias`, `documentos` y `certificaciones` (migración 033).
--
-- Qué comprueba:
--
--   · Que los tres espacios existen, son privados y tienen el tope y la lista de tipos exactos de la 033 (ni un tipo más ni uno menos).
--   · Que NADA de lo ya guardado se sale del tope ni de la lista de su espacio (por espacio), y que cada tope es mayor que el objeto
--     más grande que ya contiene.
--   · Que los demás espacios (`pdm-evidencias`, `adjuntos`, `pdf-cache`, `actas-terminacion`, `avatars`) quedaron como estaban.
--   · Que ningún espacio pide más que el límite GLOBAL del almacenamiento (100 MB): Supabase no deja fijar un global menor que el de
--     un espacio.
--
-- Cómo se corre: DESPUÉS de aplicar la 033, pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de la
-- sesión). NO DEJA NADA ESCRITO: solo lee, y de todos modos termina con un error a propósito, que es el resultado: «ESPACIOS: N
-- comprobaciones, 0 fallas» y la lista. La última línea (1/0) es una red de seguridad.
--
-- Para ensayar la migración ANTES de aplicarla: pegar primero la 033 sin su `begin` ni su `commit`, y a continuación este archivo.
-- Todo queda en la misma transacción y se deshace.
-- ============================================================================

create temp table res (descr text, ok boolean) on commit drop;

create or replace function pg_temp.chequear(p_descr text, p_ok boolean) returns void
language sql as $f$ insert into res values (p_descr, coalesce(p_ok, false)) $f$;

-- ¿Este espacio tiene exactamente estos tipos, sin repetir ni faltar?
create or replace function pg_temp.mismos_tipos(p_bucket text, p_tipos text[]) returns boolean
language sql as $f$
  select coalesce((select allowed_mime_types @> p_tipos and allowed_mime_types <@ p_tipos
                          and array_length(allowed_mime_types, 1) = array_length(p_tipos, 1)
                     from storage.buckets where id = p_bucket), false)
$f$;

do $$
declare
  v_mb constant bigint := 1048576;
  v_fallas int;
  v_total int;
  v_resultado text;
  v_b text;
begin
  -- ══ Los tres espacios ═══════════════════════════════════════════════════
  perform pg_temp.chequear('los tres espacios existen y son privados',
    (select count(*) = 3 and bool_and(not public) from storage.buckets where id in ('evidencias', 'documentos', 'certificaciones')));

  perform pg_temp.chequear('evidencias: 10 MB',
    exists (select 1 from storage.buckets where id = 'evidencias' and file_size_limit = 10 * v_mb));
  perform pg_temp.chequear('evidencias: exactamente las 6 imágenes que acepta la aplicación',
    pg_temp.mismos_tipos('evidencias', array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']));

  perform pg_temp.chequear('documentos: 15 MB (el tope de la factura electrónica)',
    exists (select 1 from storage.buckets where id = 'documentos' and file_size_limit = 15 * v_mb));
  perform pg_temp.chequear('documentos: exactamente PDF, JPG, PNG y WEBP',
    pg_temp.mismos_tipos('documentos', array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']));

  perform pg_temp.chequear('certificaciones: 5 MB',
    exists (select 1 from storage.buckets where id = 'certificaciones' and file_size_limit = 5 * v_mb));
  perform pg_temp.chequear('certificaciones: exactamente PDF',
    pg_temp.mismos_tipos('certificaciones', array['application/pdf']));

  -- ══ Lo ya guardado cabe ═════════════════════════════════════════════════
  foreach v_b in array array['evidencias', 'documentos', 'certificaciones'] loop
    perform pg_temp.chequear(format('%s: ningún objeto guardado supera el tope', v_b),
      not exists (select 1 from storage.objects o join storage.buckets b on b.id = o.bucket_id
                   where b.id = v_b and (o.metadata->>'size')::bigint > b.file_size_limit));
    perform pg_temp.chequear(format('%s: todo lo guardado es de un tipo que el espacio admite', v_b),
      not exists (select 1 from storage.objects o join storage.buckets b on b.id = o.bucket_id
                   where b.id = v_b and coalesce(o.metadata->>'mimetype', '') <> all (b.allowed_mime_types)));
    perform pg_temp.chequear(format('%s: ningún objeto guardado carece de tamaño o de tipo', v_b),
      not exists (select 1 from storage.objects o where o.bucket_id = v_b
                   and (o.metadata->>'size' is null or o.metadata->>'mimetype' is null)));
  end loop;

  -- ══ Los demás espacios no se tocaron ════════════════════════════════════
  perform pg_temp.chequear('pdm-evidencias: sigue en 100 MB con sus 14 tipos',
    exists (select 1 from storage.buckets where id = 'pdm-evidencias' and file_size_limit = 100 * v_mb and array_length(allowed_mime_types, 1) = 14));
  perform pg_temp.chequear('adjuntos: sigue en 45 MB y solo PDF',
    exists (select 1 from storage.buckets where id = 'adjuntos' and file_size_limit = 45 * v_mb and allowed_mime_types = array['application/pdf']));
  perform pg_temp.chequear('pdf-cache: sigue en 20 MB y solo PDF',
    exists (select 1 from storage.buckets where id = 'pdf-cache' and file_size_limit = 20 * v_mb and allowed_mime_types = array['application/pdf']));
  perform pg_temp.chequear('actas-terminacion y avatars: siguen en 5 MB',
    (select count(*) = 2 and bool_and(file_size_limit = 5 * v_mb) from storage.buckets where id in ('actas-terminacion', 'avatars')));

  -- ══ Compatibilidad con el límite global ═════════════════════════════════
  perform pg_temp.chequear('ningún espacio pide más que el límite global de 100 MB',
    not exists (select 1 from storage.buckets where file_size_limit > 100 * v_mb));
  perform pg_temp.chequear('ya no queda ningún espacio sin tope de tamaño',
    not exists (select 1 from storage.buckets where file_size_limit is null));
  perform pg_temp.chequear('ya no queda ningún espacio sin lista de tipos',
    not exists (select 1 from storage.buckets where allowed_mime_types is null));

  -- ── Resultado ───────────────────────────────────────────────────────────
  select count(*) filter (where not ok), count(*) into v_fallas, v_total from res;
  select format('ESPACIOS: %s comprobaciones, %s fallas', v_total, v_fallas)
         || coalesce(E'\n' || (select string_agg(case when ok then '  ok     ' else '  FALLA  ' end || descr, E'\n') from res), '')
    into v_resultado;
  raise exception '%', v_resultado;
end $$;

select 1/0;   -- red de seguridad: si el bloque terminara sin error, esto lo hace fallar y deshace todo
