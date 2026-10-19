-- Migration 070: módulo Plan de Desarrollo — la HUELLA (SHA-256) de cada evidencia
--
-- POR QUÉ. Una evidencia es un archivo que respalda un reporte. Hoy la base sabe su nombre, su tipo y su tamaño, pero nada
-- que permita demostrar, meses después y ante un tercero (rendición de cuentas, Control Interno, el Concejo, un ente de
-- control), que el archivo que alguien tiene en la mano es EXACTAMENTE el que se subió. La huella es eso: el SHA-256 del
-- contenido, calculado por el servidor sobre el archivo ya guardado y escrito una sola vez. Cambiar un solo bit del archivo
-- cambia la huella.
--
-- LA REGLA QUE IMPORTA: la huella la calcula el SERVIDOR, nunca se cree lo que dice quien sube. Quien reporta puede llamar a
-- `pdm_reportar` (o insertar en `pdm_evidencias`) con su sesión; si la huella viajara en ese mismo mensaje, podría declarar
-- la de otro archivo. Por eso:
--
--   · `pdm_huellas` es un libro al que SOLO escribe la clave de servicio. El servidor, tras comprobar que el archivo está
--     de verdad en el almacenamiento y calcular su SHA-256 leyéndolo, anota (ruta, huella, tamaño, para quién).
--   · Al insertar una evidencia, el disparador `pdm_privado.preparar_evidencia` IGNORA cualquier huella que traiga la fila y
--     la toma del libro, solo si la ruta, el tamaño y la persona que sube coinciden. Si no hay nada anotado, la evidencia
--     queda SIN huella (nunca con una inventada), y la pantalla lo dice.
--   · Una evidencia CONSERVADA en una corrección hereda la huella y la fecha de la original, igual que hereda su ruta,
--     su nombre, su tipo y su tamaño.
--   · Una huella escrita no se cambia ni se borra (disparador `pdm_evidencias_proteger_huella`). Lo único permitido es
--     escribirla donde faltaba (una evidencia sin huella que se calcula después), con su fecha de cálculo: la fecha dice
--     cuándo se calculó, y una calculada mucho después de subir el archivo se ve distinta de una calculada al subir.
--
-- QUÉ SE AÑADE
--
--   · `public.pdm_huellas` (libro, solo clave de servicio).
--   · `pdm_evidencias.sha256` y `pdm_evidencias.huella_calculada_en` (ambas o ninguna).
--   · `pdm_evidencias_vista`: dos columnas más al final (`sha256`, `huella_calculada_en`).
--   · `pdm_privado.preparar_evidencia` (misma firma, mismo disparador) y `pdm_privado.proteger_huella` (nuevo).
--
-- PERMISOS POR COLUMNA (regla 2 de CLAUDE.md): `pdm_evidencias` tiene 0 columnas con permiso propio (se comprobó antes de
-- escribir esto), así que las dos columnas nuevas heredan el permiso de la tabla —lectura e inserción para
-- `authenticated`— y no necesitan `GRANT` por columna. Nadie con sesión puede ACTUALIZAR la tabla.
--
-- NO TOCA nada de Contratista Digital ni la política de inserción de evidencias (la 069 la redefine; esta migración no la
-- mira) ni `pdm_reportar`. No cambia ninguna fila: hoy no hay reportes.
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo prometido no queda
-- cumplido. Copia para revertir: supabase/reversiones/070_pdm_huella_de_evidencias.sql. Prueba de punta a punta:
-- supabase/tests/pdm_huellas.sql.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. El libro de huellas calculadas por el servidor ────────────────────────

create table public.pdm_huellas (
  ruta          text primary key check (btrim(ruta) <> '' and char_length(ruta) <= 300),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes         bigint not null check (bytes > 0),
  -- Para quién se calculó (quien sube el archivo). Sin llave foránea a propósito: es un libro de apoyo, no debe impedir nada.
  usuario_id    uuid not null,
  calculada_en  timestamptz not null default clock_timestamp()
);

comment on table public.pdm_huellas is
  'Huellas SHA-256 que el SERVIDOR calculó sobre archivos ya guardados, antes de registrar el reporte. Solo la clave de servicio escribe y lee; el disparador de pdm_evidencias las copia a la evidencia.';

alter table public.pdm_huellas enable row level security;

-- Supabase da por defecto todos los permisos a `anon` y `authenticated` en las tablas nuevas: aquí se quitan todos.
-- Sin ninguna política, con la seguridad por filas encendida, nadie con sesión ve ni escribe nada.
revoke all on public.pdm_huellas from public, anon, authenticated;
grant select, insert, update on public.pdm_huellas to service_role;

-- ─── 2. Las dos columnas de la evidencia ──────────────────────────────────────

alter table public.pdm_evidencias
  add column sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  add column huella_calculada_en timestamptz,
  add constraint pdm_evidencias_huella_completa check ((sha256 is null) = (huella_calculada_en is null));

comment on column public.pdm_evidencias.sha256 is
  'SHA-256 (64 hex en minúscula) del contenido del archivo, calculado por el servidor. Null si no se pudo calcular. Se escribe una vez y no cambia.';
comment on column public.pdm_evidencias.huella_calculada_en is
  'Cuándo calculó el servidor la huella. Va siempre junto con sha256.';

-- ─── 3. Al insertar una evidencia: la huella sale del libro, nunca de la fila ─
--
-- Corre con los permisos del dueño (SECURITY DEFINER): quien inserta no ve `pdm_huellas`. Es el cuerpo de la 058 (lo
-- conservado queda exactamente como era) más la huella.

create or replace function pdm_privado.preparar_evidencia() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  o public.pdm_evidencias%rowtype;
  h public.pdm_huellas%rowtype;
  v_corrige uuid;
begin
  if NEW.copia_de is null then
    -- Lo que la fila diga de la huella NO se cree. Vale solo la que el servidor anotó para ESTE archivo (misma ruta y
    -- mismo tamaño) y para ESTA persona. Si no hay, queda sin huella.
    NEW.sha256 := null;
    NEW.huella_calculada_en := null;
    select * into h from public.pdm_huellas where ruta = NEW.ruta and usuario_id = NEW.subido_por and bytes = NEW.bytes;
    if found then
      NEW.sha256 := h.sha256;
      NEW.huella_calculada_en := h.calculada_en;
    end if;
    return NEW;
  end if;

  select * into o from public.pdm_evidencias where id = NEW.copia_de;
  select corrige_a into v_corrige from public.pdm_reportes where id = NEW.reporte_id;
  if o.id is null or v_corrige is null or o.reporte_id <> v_corrige then
    raise exception 'PDM: solo se conservan archivos del reporte que se corrige' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.pdm_validaciones v, jsonb_array_elements(v.observaciones) x
    where v.reporte_id = o.reporte_id and (x->>'evidencia')::uuid = o.id
  ) then
    raise exception 'PDM: un archivo devuelto no se conserva; reemplázalo o quítalo' using errcode = '23514';
  end if;

  -- Lo conservado es lo que ya estaba: nada se redeclara, tampoco la huella.
  NEW.ruta := o.ruta;
  NEW.nombre := o.nombre;
  NEW.tipo := o.tipo;
  NEW.bytes := o.bytes;
  NEW.sha256 := o.sha256;
  NEW.huella_calculada_en := o.huella_calculada_en;
  return NEW;
end $$;

-- ─── 4. Una huella escrita no se cambia ───────────────────────────────────────

create function pdm_privado.proteger_huella() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if OLD.sha256 is not null
     and (NEW.sha256 is distinct from OLD.sha256 or NEW.huella_calculada_en is distinct from OLD.huella_calculada_en) then
    raise exception 'PDM: la huella de una evidencia no se cambia' using errcode = '23514';
  end if;
  return NEW;
end $$;

create trigger pdm_evidencias_proteger_huella before update on public.pdm_evidencias
  for each row execute function pdm_privado.proteger_huella();

-- ─── 5. La vista de evidencias: dos columnas más al final ─────────────────────
--
-- Igual a la de la 068 (que ya salta lo anulado), con `sha256` y `huella_calculada_en` al final.

create or replace view public.pdm_evidencias_vista with (security_invoker = true) as
select
  e.id,
  e.reporte_id,
  normalize(e.nombre, NFC) as nombre,
  e.tipo,
  e.bytes,
  (e.copia_de is not null) as conservada,
  r.indicador_id,
  i.fila_origen as indicador_fila,
  i.codigo,
  i.indicador,
  i.sector,
  d.nombre as dependencia,
  r.anio,
  r.valor,
  r.autor_nombre,
  r.created_at as reportado_en,
  coalesce(v.estado, 'pendiente') as estado_reporte,
  exists (select 1 from public.pdm_reportes s where s.corrige_a = r.id) as reemplazada,
  (select o->>'motivo'
     from public.pdm_validaciones x cross join lateral jsonb_array_elements(x.observaciones) o
    where x.reporte_id = r.id and o->>'evidencia' = e.id::text
    order by x.created_at desc, x.id desc limit 1) as observacion,
  translate(lower(normalize(e.nombre || ' ' || i.indicador || ' ' || i.codigo, NFC)),
            'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc') as busqueda,
  pdm_privado.anulado(r.id) as anulada,
  e.sha256,
  e.huella_calculada_en
from public.pdm_evidencias e
join public.pdm_reportes r on r.id = e.reporte_id
join public.pdm_indicadores i on i.id = r.indicador_id
join public.dependencias d on d.id = i.dependencia_id
left join lateral (
  select x.estado from public.pdm_validaciones x
  where x.reporte_id = r.id order by x.created_at desc, x.id desc limit 1
) v on true;

-- Reemplazar una vista conserva sus permisos; se reafirman por si acaso.
revoke all on public.pdm_evidencias_vista from public, anon, authenticated;
grant select on public.pdm_evidencias_vista to authenticated;

-- ─── 6. Quién puede llamar ────────────────────────────────────────────────────

revoke all on function pdm_privado.proteger_huella() from public, anon;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. El libro: con seguridad por filas, sin NINGÚN permiso para anon ni authenticated, y sin políticas
  if not exists (select 1 from pg_class c where c.oid = 'public.pdm_huellas'::regclass and c.relrowsecurity) then
    raise exception 'PDM 070: pdm_huellas sin seguridad por filas';
  end if;
  select string_agg(p, ', ') into v_malas
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where has_table_privilege('anon', 'public.pdm_huellas', p) or has_table_privilege('authenticated', 'public.pdm_huellas', p);
  if v_malas is not null then raise exception 'PDM 070: pdm_huellas con permisos de más: %', v_malas; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pdm_huellas') then
    raise exception 'PDM 070: pdm_huellas no debe tener políticas (solo la clave de servicio la toca)';
  end if;
  if not has_table_privilege('service_role', 'public.pdm_huellas', 'INSERT') then
    raise exception 'PDM 070: la clave de servicio no puede escribir en pdm_huellas';
  end if;

  -- 2. Las dos columnas existen y la evidencia sigue siendo de solo lectura e inserción para quien tiene sesión
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pdm_evidencias'
        and column_name in ('sha256', 'huella_calculada_en')) <> 2 then
    raise exception 'PDM 070: faltan columnas en pdm_evidencias';
  end if;
  select string_agg(p, ', ') into v_malas
  from unnest(array['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where has_table_privilege('authenticated', 'public.pdm_evidencias', p) or has_table_privilege('anon', 'public.pdm_evidencias', p);
  if v_malas is not null then raise exception 'PDM 070: pdm_evidencias con permisos de más: %', v_malas; end if;

  -- 3. Los dos disparadores existen; el que prepara corre con permisos del dueño y con la ruta de búsqueda fija
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.pdm_evidencias'::regclass and t.tgname = 'pdm_evidencias_preparar' and not t.tgisinternal)
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.pdm_evidencias'::regclass and t.tgname = 'pdm_evidencias_proteger_huella' and not t.tgisinternal) then
    raise exception 'PDM 070: faltan disparadores en pdm_evidencias';
  end if;
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.pronamespace = 'pdm_privado'::regnamespace and p.proname in ('preparar_evidencia', 'proteger_huella')
    and (not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 070: función mal protegida: %', v_malas; end if;
  if not (select prosecdef from pg_proc where pronamespace = 'pdm_privado'::regnamespace and proname = 'preparar_evidencia') then
    raise exception 'PDM 070: preparar_evidencia debe correr con permisos del dueño';
  end if;
  if (select prosrc from pg_proc where pronamespace = 'pdm_privado'::regnamespace and proname = 'preparar_evidencia') not like '%pdm_huellas%' then
    raise exception 'PDM 070: preparar_evidencia no lee el libro de huellas';
  end if;

  -- 4. La vista: respeta los permisos de quien pregunta, sin permisos para anon, salta lo anulado y trae las dos columnas
  if not exists (select 1 from pg_class c where c.oid = 'public.pdm_evidencias_vista'::regclass and 'security_invoker=true' = any(c.reloptions))
     or pg_get_viewdef('public.pdm_evidencias_vista'::regclass) not like '%anulado%'
     or has_table_privilege('anon', 'public.pdm_evidencias_vista', 'SELECT')
     or not has_table_privilege('authenticated', 'public.pdm_evidencias_vista', 'SELECT') then
    raise exception 'PDM 070: vista de evidencias mal armada';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pdm_evidencias_vista'
        and column_name in ('sha256', 'huella_calculada_en', 'anulada', 'busqueda')) <> 4 then
    raise exception 'PDM 070: faltan columnas en pdm_evidencias_vista';
  end if;
end $$;

commit;
