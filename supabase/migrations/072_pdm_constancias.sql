-- Migration 072: módulo Plan de Desarrollo — la CONSTANCIA de cada versión de un reporte y su verificación pública por QR
--
-- POR QUÉ. Un reporte aprobado es lo que la Alcaldía muestra en rendición de cuentas, a Control Interno, al Concejo y a los
-- entes de control. Quien lo recibe en papel o en PDF necesita poder comprobar contra el sistema que lo que tiene es lo que
-- se reportó, y en qué estado está HOY. Para eso cada versión de un reporte puede tener una CONSTANCIA: un documento con un
-- código `PDM-XXXX-XXXX` y un QR que lleva a una página pública (/verificar/PDM-XXXX-XXXX) con el estado vivo y la huella
-- SHA-256 de cada archivo. El QR no va dentro de los archivos (cambiarlos cambiaría su huella): va en la constancia.
--
-- Decisiones de Felipe (18-oct-2026): el «paquete» es la versión del reporte; la página pública muestra estado, indicador,
-- secretaría, año, valor, fechas, quién reportó y quién validó, y los archivos por TIPO y huella —NO sus nombres, que suelen
-- traer datos personales—, y tampoco el motivo de una devolución o de una anulación; y un reporte que aún no está aprobado
-- debe decirlo con toda claridad al escanear su QR.
--
-- QUÉ SE AÑADE (nada de columnas ni permisos de tablas existentes: regla 2 de CLAUDE.md sin nada que pensar)
--
--   · `public.pdm_constancias` (código ↔ versión del reporte). Solo la clave de servicio la lee y la escribe; SOLO CRECE: un
--     código impreso en un QR no se cambia ni se borra nunca (disparador), igual que los documentos emitidos de Contratista
--     Digital.
--   · `public.pdm_constancia_emitir(reporte, código)` (clave de servicio): crea el código de esa versión si no lo tenía y
--     devuelve el que tiene. Idempotente: pedirla dos veces da el mismo código.
--   · `public.pdm_constancia_publica(código)` (clave de servicio): lo ÚNICO que la página pública puede saber de una versión.
--     La forma del resultado la decide la base, no la aplicación: no devuelve nombres de archivo, rutas, el texto del reporte,
--     comentarios ni motivos, ni identificadores de personas.
--
-- NO TOCA nada de Contratista Digital ni las rutas `/verificar` de sus documentos (`CD-…`): los códigos `PDM-…` son otra tabla.
-- No cambia ninguna fila existente: hoy no hay reportes.
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo prometido no queda
-- cumplido. Copia para revertir: supabase/reversiones/072_pdm_constancias.sql. Prueba de punta a punta:
-- supabase/tests/pdm_constancias.sql.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. La tabla de constancias ───────────────────────────────────────────────

create table public.pdm_constancias (
  -- El alfabeto es el de los documentos de Contratista Digital (Crockford sin I, L, O, U): sin caracteres que se confundan.
  codigo      text primary key check (codigo ~ '^PDM-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
  reporte_id  uuid not null unique references public.pdm_reportes (id),
  creada_en   timestamptz not null default clock_timestamp()
);

comment on table public.pdm_constancias is
  'Código PDM-XXXX-XXXX de cada versión de reporte que tiene constancia (el QR impreso lleva este código). Solo la clave de servicio; solo crece.';

alter table public.pdm_constancias enable row level security;
-- Supabase da por defecto todos los permisos a `anon` y `authenticated` en las tablas nuevas: aquí se quitan todos.
revoke all on public.pdm_constancias from public, anon, authenticated;
grant select, insert on public.pdm_constancias to service_role;

create function pdm_privado.proteger_constancia() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'PDM: una constancia no se cambia ni se borra: el código impreso en su QR tiene que seguir valiendo' using errcode = '42501';
end $$;

create trigger pdm_constancias_solo_crece
  before update or delete on public.pdm_constancias
  for each row execute function pdm_privado.proteger_constancia();
create trigger pdm_constancias_sin_vaciar
  before truncate on public.pdm_constancias
  for each statement execute function pdm_privado.proteger_constancia();

-- ─── 2. Emitir: el código de una versión, estable ─────────────────────────────

create function public.pdm_constancia_emitir(p_reporte uuid, p_codigo text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_codigo text;
begin
  -- Si la versión ya tiene código se conserva el que tiene (el impreso no cambia). Un código que ya es de OTRA versión
  -- falla por la llave primaria, y quien llama prueba con otro.
  insert into public.pdm_constancias (codigo, reporte_id) values (p_codigo, p_reporte)
  on conflict (reporte_id) do nothing;
  select c.codigo into v_codigo from public.pdm_constancias c where c.reporte_id = p_reporte;
  return v_codigo;
end $$;

comment on function public.pdm_constancia_emitir(uuid, text) is
  'Crea el código de constancia de una versión de reporte si no lo tenía y devuelve el que tiene. Solo la clave de servicio.';

-- ─── 3. Lo que la página pública puede saber ──────────────────────────────────
--
-- El estado de ESTA versión: anulado, o el de su última validación (aprobado o devuelto), o pendiente. Aparte se dice si
-- es la vigente del indicador en el año y, si no lo es, cuál es la más reciente (con su código, si ya tiene).

create function public.pdm_constancia_publica(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.pdm_constancias%rowtype;
  r public.pdm_reportes%rowtype;
  i public.pdm_indicadores%rowtype;
  v_dep text;
  v_meta numeric;
  v_val record;
  v_anul record;
  v_mas record;
  v_mas_estado text;
  v_anulado boolean;
  v_estado text;
begin
  select * into c from public.pdm_constancias where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then return null; end if;

  select * into r from public.pdm_reportes where id = c.reporte_id;
  select * into i from public.pdm_indicadores where id = r.indicador_id;
  select d.nombre into v_dep from public.dependencias d where d.id = i.dependencia_id;
  select m.meta into v_meta from public.pdm_metas m where m.indicador_id = r.indicador_id and m.anio = r.anio;

  v_anulado := pdm_privado.anulado(r.id);

  select x.estado, x.validador_nombre, x.created_at into v_val
  from public.pdm_validaciones x where x.reporte_id = r.id order by x.created_at desc, x.id desc limit 1;

  select a.accion, a.created_at into v_anul
  from public.pdm_anulaciones a where a.reporte_id = r.id order by a.created_at desc, a.id desc limit 1;

  v_estado := case when v_anulado then 'anulado' when v_val.estado = 'aprobado' then 'aprobado'
                   when v_val.estado = 'devuelto' then 'devuelto' else 'pendiente' end;

  -- La versión más reciente que cuenta (no anulada) del mismo indicador y año, si no es esta.
  select s.id, s.created_at into v_mas
  from public.pdm_reportes s
  where s.indicador_id = r.indicador_id and s.anio = r.anio and s.id <> r.id
    and (s.created_at, s.id) > (r.created_at, r.id) and not pdm_privado.anulado(s.id)
  order by s.created_at desc, s.id desc limit 1;

  return jsonb_build_object(
    'codigo', c.codigo,
    'creada_en', c.creada_en,
    'estado', v_estado,
    'vigente', (not v_anulado and v_mas.id is null),
    'indicador', jsonb_build_object(
      'codigo', i.codigo, 'nombre', i.indicador, 'sector', i.sector, 'unidad', i.unidad, 'dependencia', v_dep,
      'anio', r.anio, 'meta', v_meta),
    'reporte', jsonb_build_object(
      'valor', r.valor, 'valor_anterior', r.valor_anterior, 'reportado_en', r.created_at, 'autor', r.autor_nombre,
      'es_correccion', (r.corrige_a is not null)),
    'validacion', case when v_val.estado is null then null
                       else jsonb_build_object('estado', v_val.estado, 'validador', v_val.validador_nombre, 'fecha', v_val.created_at) end,
    -- Solo QUE se anuló o restauró y cuándo: el motivo y quién lo hizo no se publican.
    'anulacion', case when v_anul.accion is null then null
                      else jsonb_build_object('accion', v_anul.accion, 'fecha', v_anul.created_at) end,
    'mas_reciente', case when v_mas.id is null then null
                         else jsonb_build_object(
                           'reportado_en', v_mas.created_at,
                           'estado', (select case when x.estado = 'aprobado' then 'aprobado' when x.estado = 'devuelto' then 'devuelto' else 'pendiente' end
                                      from (select (select y.estado from public.pdm_validaciones y where y.reporte_id = v_mas.id order by y.created_at desc, y.id desc limit 1) as estado) x),
                           'codigo', (select k.codigo from public.pdm_constancias k where k.reporte_id = v_mas.id)) end,
    -- Los archivos por tipo, tamaño y huella. NUNCA su nombre ni su ruta.
    'archivos', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'bytes', e.bytes, 'sha256', e.sha256, 'huella_calculada_en', e.huella_calculada_en)
                       order by e.created_at, e.id)
      from public.pdm_evidencias e where e.reporte_id = r.id), '[]'::jsonb)
  );
end $$;

comment on function public.pdm_constancia_publica(text) is
  'Lo único que la página pública /verificar/PDM-… sabe de una versión de reporte: estado vivo, indicador, valor, fechas, quién reportó y validó, archivos por tipo y huella. Sin nombres de archivo, textos ni motivos. Solo la clave de servicio.';

revoke all on function public.pdm_constancia_emitir(uuid, text) from public, anon, authenticated;
revoke all on function public.pdm_constancia_publica(text) from public, anon, authenticated;
grant execute on function public.pdm_constancia_emitir(uuid, text) to service_role;
grant execute on function public.pdm_constancia_publica(text) to service_role;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. La tabla: seguridad por filas encendida, sin permisos para nadie con sesión, y solo crece
  if not (select relrowsecurity from pg_class where oid = 'public.pdm_constancias'::regclass) then
    raise exception 'PDM 072: pdm_constancias sin seguridad por filas';
  end if;
  if has_table_privilege('anon', 'public.pdm_constancias', 'SELECT') or has_table_privilege('authenticated', 'public.pdm_constancias', 'SELECT')
     or has_table_privilege('anon', 'public.pdm_constancias', 'INSERT') or has_table_privilege('authenticated', 'public.pdm_constancias', 'INSERT') then
    raise exception 'PDM 072: alguien con sesión (o el público) alcanza pdm_constancias';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.pdm_constancias'::regclass and not tgisinternal and tgenabled = 'O') <> 2 then
    raise exception 'PDM 072: pdm_constancias no tiene sus dos disparadores de «solo crece»';
  end if;

  -- 2. Las dos funciones: con ruta de búsqueda fija, con permisos del dueño, y SOLO para la clave de servicio
  select string_agg(x.f, ', ') into v_malas
  from (values ('pdm_constancia_emitir'), ('pdm_constancia_publica')) x(f)
  where not exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = x.f and p.prosecdef
      and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
      and has_function_privilege('service_role', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 072: función ausente o mal protegida: %', v_malas; end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/072_pdm_constancias.sql: se niega si ya hay constancias (un QR impreso no
-- se puede dejar sin código).
