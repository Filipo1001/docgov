-- Migration 076: módulo Plan de Desarrollo — BORRADOR del reporte (subir hoy, completar después)
--
-- POR QUÉ. Felipe (21-oct-2026): quien tiene un indicador a su cargo quiere poder subir evidencias hoy y completar el reporte dentro de
-- un mes, sin que la secretaría lo vea ni lo valide todavía. Hoy cada envío es un reporte de verdad: llega a la cola de la secretaría
-- y, si se aprueba, cuenta en el cumplimiento. Eligió el borrador entre tres opciones, y estas decisiones suyas:
--
--   · Compartido por indicador y año: UN borrador por indicador y año, que continúa cualquiera de las personas que tienen ese indicador a
--     su cargo (responsable o apoyo): quien lo prepara y quien lo envía pueden ser distintas. La pantalla dice quién lo guardó y cuándo.
--   · Privado hasta enviarlo: no lo ven la secretaría, Control Interno ni el administrador, y el indicador sigue figurando «Falta
--     reportar». No es un reporte: no cuenta, no genera correo, no tiene constancia ni huella hasta que se envía.
--   · No vence ni avisa: queda hasta que se envía o se descarta.
--
-- QUÉ CAMBIA
--
--   · Tablas `pdm_borradores` (una fila por indicador y año: valor, texto, motivo, archivos que se conservan de la versión anterior) y
--     `pdm_borrador_archivos` (los archivos que ya se subieron al almacenamiento y esperan el envío). Con seguridad por fila: SOLO ven su
--     borrador quienes tienen el indicador a su cargo (`pdm_privado.es_responsable`). Nadie escribe en ellas directamente: no tienen
--     permisos de escritura para `authenticated`; se escribe solo a través de las funciones de abajo.
--   · `public.pdm_borrador_guardar(...)`: guarda (o actualiza) el borrador con las mismas reglas de siempre —quién, año, tipos y pesos de
--     archivo, tope de archivos— y con un control de versión: si otra persona guardó mientras tanto, se niega y pide recargar (no se pisa
--     en silencio lo que hizo otra persona). El valor, el texto y el motivo pueden estar incompletos: es un borrador.
--   · `public.pdm_borrador_descartar(...)`: lo borra y devuelve las rutas de sus archivos, para que el servidor los quite del almacenamiento.
--   · `pdm_reportar` (la de la 075, palabra por palabra, más UNA línea al final): al registrar el reporte borra el borrador de ese
--     indicador y año, en la MISMA transacción. Los archivos del borrador que van en el reporte quedan como evidencias del reporte (el
--     servidor lee cada uno del almacenamiento y calcula su huella al enviar, como siempre).
--   · Dos ayudas en `pdm_privado` (con permisos de definidor, como `anulado`): `escribir_borrador` y `quitar_borrador`. Son las únicas que
--     escriben en las tablas nuevas y comprueban otra vez que quien llama tiene el indicador a su cargo.
--
-- NADA CAMBIA PARA LO YA REPORTADO: no se toca ninguna fila existente. Compatible hacia atrás con el código anterior: `pdm_reportar` sigue
-- igual para él (si no hay borrador, la línea nueva no hace nada).
--
-- Va en una transacción y termina con un comprobador que la aborta si algo de lo prometido no queda cumplido.
-- Copia para revertir: supabase/reversiones/076_…; prueba de punta a punta: supabase/tests/pdm_borradores.sql.

begin;

-- ─── 1. Las tablas ────────────────────────────────────────────────────────────

create table public.pdm_borradores (
  id              uuid primary key default gen_random_uuid(),
  indicador_id    uuid not null references public.pdm_indicadores (id) on delete cascade,
  anio            integer not null,
  -- Puede estar incompleto: un borrador no es un reporte.
  valor           numeric,
  texto           text not null default '',
  motivo          text,
  -- Ids de evidencias de la versión que se corrige que pasarían tal cual a la nueva (se vuelven a comprobar al enviar).
  conservar       uuid[] not null default '{}',
  -- Sube en cada guardado: dos personas que guardan a la vez no se pisan (el segundo guardado se niega).
  version         integer not null default 1,
  creado_por      uuid not null,
  creado_nombre   text not null,
  creado_en       timestamptz not null default now(),
  editado_por     uuid not null,
  editado_nombre  text not null,
  editado_en      timestamptz not null default now(),
  constraint pdm_borradores_uno_por_indicador_y_anio unique (indicador_id, anio),
  constraint pdm_borradores_valor_check check (valor is null or (valor >= 0 and valor <= 1000000000000)),
  constraint pdm_borradores_texto_check check (char_length(texto) <= 1000),
  constraint pdm_borradores_motivo_check check (motivo is null or char_length(motivo) <= 500)
);

create table public.pdm_borrador_archivos (
  id           uuid primary key default gen_random_uuid(),
  borrador_id  uuid not null references public.pdm_borradores (id) on delete cascade,
  -- La ruta en el espacio `pdm-evidencias`: única en toda la tabla (un archivo no está en dos borradores).
  ruta         text not null unique,
  nombre       text not null,
  tipo         text not null,
  bytes        bigint not null check (bytes > 0),
  subido_por   uuid not null,
  subido_en    timestamptz not null default now()
);

create index pdm_borrador_archivos_borrador_idx on public.pdm_borrador_archivos (borrador_id);

comment on table public.pdm_borradores is
  'Borrador del reporte de un indicador en un año (compartido por quienes tienen el indicador a su cargo). No es un reporte: no cuenta, no se ve fuera de ese grupo y desaparece al enviarse o descartarse. Solo se escribe con pdm_borrador_guardar / pdm_borrador_descartar / pdm_reportar.';
comment on table public.pdm_borrador_archivos is
  'Archivos ya subidos al almacenamiento que esperan el envío de un borrador. Al enviar el reporte pasan a ser evidencias; al descartar el borrador, el servidor los quita del almacenamiento.';

-- ─── 2. Seguridad por fila: solo quien tiene el indicador a su cargo ─────────

alter table public.pdm_borradores enable row level security;
alter table public.pdm_borrador_archivos enable row level security;

create policy pdm_borradores_select on public.pdm_borradores
  for select to authenticated
  using ((select pdm_privado.mi_nivel()) is not null and pdm_privado.es_responsable(indicador_id));

create policy pdm_borrador_archivos_select on public.pdm_borrador_archivos
  for select to authenticated
  using (exists (select 1 from public.pdm_borradores b where b.id = borrador_id));

-- Solo lectura para quien tiene sesión; las escrituras van por las funciones (y por el servidor con su clave de servicio).
revoke all on public.pdm_borradores, public.pdm_borrador_archivos from public, anon, authenticated;
grant select on public.pdm_borradores, public.pdm_borrador_archivos to authenticated;

-- ─── 3. Las dos ayudas que escriben (definidor, en el esquema privado) ───────

-- Guarda el borrador (lo crea o lo actualiza) y deja EXACTAMENTE esta lista de archivos. Devuelve lo guardado y las rutas que ya no
-- están (para que el servidor las quite del almacenamiento). Todo lo que recibe ya lo validó `pdm_borrador_guardar`; aquí solo se
-- comprueba de nuevo que quien llama tiene el indicador a su cargo.
create or replace function pdm_privado.escribir_borrador(
  p_indicador uuid, p_anio integer, p_valor numeric, p_texto text, p_motivo text, p_conservar uuid[], p_archivos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_yo uuid := (select auth.uid());
  v_nombre text;
  v_id uuid;
  v_version integer;
  v_retirados text[];
  v_editado timestamptz := now();
begin
  if v_yo is null or not pdm_privado.es_responsable(p_indicador) then
    raise exception 'PDM: este indicador no está a tu cargo' using errcode = '42501';
  end if;
  v_nombre := pdm_privado.nombre_de(v_yo);

  select b.id into v_id from public.pdm_borradores b where b.indicador_id = p_indicador and b.anio = p_anio for update;
  if v_id is null then
    insert into public.pdm_borradores (indicador_id, anio, valor, texto, motivo, conservar, creado_por, creado_nombre, editado_por, editado_nombre, editado_en)
    values (p_indicador, p_anio, p_valor, coalesce(p_texto, ''), p_motivo, coalesce(p_conservar, '{}'), v_yo, v_nombre, v_yo, v_nombre, v_editado)
    returning id, version into v_id, v_version;
    v_retirados := '{}';
  else
    select coalesce(array_agg(a.ruta), '{}') into v_retirados
      from public.pdm_borrador_archivos a
     where a.borrador_id = v_id
       and a.ruta not in (select x->>'ruta' from jsonb_array_elements(p_archivos) x);
    delete from public.pdm_borrador_archivos where borrador_id = v_id and ruta = any(v_retirados);
    update public.pdm_borradores
       set valor = p_valor, texto = coalesce(p_texto, ''), motivo = p_motivo, conservar = coalesce(p_conservar, '{}'),
           version = version + 1, editado_por = v_yo, editado_nombre = v_nombre, editado_en = v_editado
     where id = v_id
    returning version into v_version;
  end if;

  -- Los archivos que ya estaban se quedan como están (con quien los subió); solo entran los nuevos.
  insert into public.pdm_borrador_archivos (borrador_id, ruta, nombre, tipo, bytes, subido_por)
  select v_id, x->>'ruta', btrim(x->>'nombre'), x->>'tipo', (x->>'bytes')::bigint, v_yo
    from jsonb_array_elements(p_archivos) x
  on conflict (ruta) do nothing;

  return jsonb_build_object(
    'version', v_version, 'editado_en', v_editado, 'editado_por', v_nombre, 'editado_por_id', v_yo,
    'retirados', to_jsonb(v_retirados),
    'archivos', coalesce((select jsonb_agg(jsonb_build_object('ruta', a.ruta, 'nombre', a.nombre, 'tipo', a.tipo, 'bytes', a.bytes) order by a.subido_en, a.ruta)
                            from public.pdm_borrador_archivos a where a.borrador_id = v_id), '[]'::jsonb));
end $f$;

-- Borra el borrador de un indicador y año y devuelve las rutas de sus archivos (vacío si no había). La usan el descarte y el envío del reporte.
create or replace function pdm_privado.quitar_borrador(p_indicador uuid, p_anio integer)
returns text[]
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_rutas text[];
begin
  if (select auth.uid()) is null or not pdm_privado.es_responsable(p_indicador) then
    raise exception 'PDM: este indicador no está a tu cargo' using errcode = '42501';
  end if;
  select coalesce(array_agg(a.ruta), '{}') into v_rutas
    from public.pdm_borrador_archivos a join public.pdm_borradores b on b.id = a.borrador_id
   where b.indicador_id = p_indicador and b.anio = p_anio;
  delete from public.pdm_borradores where indicador_id = p_indicador and anio = p_anio;
  return v_rutas;
end $f$;

revoke all on function pdm_privado.escribir_borrador(uuid, integer, numeric, text, text, uuid[], jsonb) from public, anon;
revoke all on function pdm_privado.quitar_borrador(uuid, integer) from public, anon;
grant execute on function pdm_privado.escribir_borrador(uuid, integer, numeric, text, text, uuid[], jsonb) to authenticated, service_role;
grant execute on function pdm_privado.quitar_borrador(uuid, integer) to authenticated, service_role;

-- ─── 4. Guardar y descartar (las que llama la aplicación) ────────────────────

-- p_version: 0 si todavía no hay borrador; si lo hay, la versión que quien guarda tenía a la vista. Si no coincide, otra persona lo
-- cambió (o ya se envió o se descartó) y se niega: así nadie pisa en silencio el trabajo de otra persona.
-- p_archivos: lista de {ruta, nombre, tipo, bytes} que debe quedar en el borrador (los de antes que no estén en la lista se retiran).
create or replace function public.pdm_borrador_guardar(
  p_indicador uuid, p_anio integer, p_version integer, p_valor numeric, p_texto text, p_motivo text,
  p_conservar uuid[], p_archivos jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_plan uuid;
  v_inicio int;
  v_fin int;
  v_texto text := coalesce(p_texto, '');
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_conservar uuid[] := coalesce(p_conservar, '{}');
  v_archivos jsonb := coalesce(p_archivos, '[]'::jsonb);
  v_prefijo text;
  v_limite bigint;
  v_actual integer;
  e jsonb;
begin
  select i.plan_id, p.anio_inicio, p.anio_fin into v_plan, v_inicio, v_fin
    from public.pdm_indicadores i join public.pdm_planes p on p.id = i.plan_id
   where i.id = p_indicador and i.activo;
  if v_plan is null then raise exception 'PDM: el indicador no existe o no tienes acceso a él' using errcode = '42501'; end if;
  if (select pdm_privado.mi_nivel()) is null or not pdm_privado.es_responsable(p_indicador) then
    raise exception 'PDM: este indicador no está a tu cargo' using errcode = '42501';
  end if;
  if p_anio is null or p_anio < v_inicio or p_anio > v_fin then
    raise exception 'PDM: elige un año del plan (% a %)', v_inicio, v_fin using errcode = '22023';
  end if;
  if p_anio > extract(year from (now() at time zone 'America/Bogota'))::int then
    raise exception 'PDM: el año % empieza el 1 de enero; todavía no se puede reportar', p_anio using errcode = '23514';
  end if;

  -- Un borrador puede estar incompleto, pero lo que trae tiene que servir.
  if p_valor is not null and (p_valor < 0 or p_valor > 1000000000000) then
    raise exception 'PDM: el valor debe ser un número igual o mayor que cero' using errcode = '22023';
  end if;
  if char_length(v_texto) > 1000 then raise exception 'PDM: la descripción no puede pasar de 1.000 caracteres' using errcode = '22001'; end if;
  if v_motivo is not null and char_length(v_motivo) > 500 then raise exception 'PDM: el motivo no puede pasar de 500 caracteres' using errcode = '22001'; end if;
  if jsonb_typeof(v_archivos) is distinct from 'array' then
    raise exception 'PDM: la lista de archivos del borrador no es válida' using errcode = '22023';
  end if;
  if jsonb_array_length(v_archivos) + cardinality(v_conservar) > pdm_privado.max_evidencias() then
    raise exception 'PDM: este reporte tiene más archivos de los que admite' using errcode = '22023';
  end if;
  if (select count(distinct c) from unnest(v_conservar) c) <> cardinality(v_conservar) then
    raise exception 'PDM: un archivo está repetido entre los que conservas' using errcode = '22023';
  end if;
  if cardinality(v_conservar) > 0 and (
       select count(*) from public.pdm_evidencias ev join public.pdm_reportes r on r.id = ev.reporte_id
        where ev.id = any(v_conservar) and r.indicador_id = p_indicador and r.anio = p_anio) <> cardinality(v_conservar) then
    raise exception 'PDM: un archivo que quieres conservar no es de este indicador y este año' using errcode = '22023';
  end if;
  if p_valor is null and btrim(v_texto) = '' and v_motivo is null and jsonb_array_length(v_archivos) = 0 and cardinality(v_conservar) = 0 then
    raise exception 'PDM: no hay nada que guardar en el borrador' using errcode = '22023';
  end if;

  v_prefijo := v_plan::text || '/' || p_indicador::text || '/' || p_anio::text || '/';
  for e in select value from jsonb_array_elements(v_archivos) loop
    if jsonb_typeof(e) is distinct from 'object'
       or coalesce(e->>'ruta', '') = '' or left(e->>'ruta', char_length(v_prefijo)) <> v_prefijo
       or (e->>'ruta') like '%..%' or char_length(e->>'ruta') > 300 then
      raise exception 'PDM: una evidencia no corresponde a este indicador y este año' using errcode = '22023';
    end if;
    if coalesce(btrim(e->>'nombre'), '') = '' or char_length(e->>'nombre') > 200 then
      raise exception 'PDM: una evidencia no tiene un nombre válido' using errcode = '22023';
    end if;
    v_limite := pdm_privado.limite_de_evidencia(e->>'tipo');
    if v_limite is null then
      raise exception 'PDM: tipo de archivo no permitido (PDF, imagen, Word, Excel, presentación o video MP4 o MOV)' using errcode = '22023';
    end if;
    if (e->>'bytes') is null or (e->>'bytes') !~ '^[0-9]{1,12}$' or (e->>'bytes')::bigint < 1 or (e->>'bytes')::bigint > v_limite then
      raise exception 'PDM: este archivo pesa más de lo que admite su tipo (hasta % MB; los videos, hasta % MB)',
        pdm_privado.limite_de_evidencia('application/pdf') / 1048576, pdm_privado.limite_de_evidencia('video/mp4') / 1048576
        using errcode = '22022';
    end if;
  end loop;
  if (select count(distinct x->>'ruta') from jsonb_array_elements(v_archivos) x) <> jsonb_array_length(v_archivos) then
    raise exception 'PDM: un mismo archivo está repetido' using errcode = '22023';
  end if;

  -- Un guardado a la vez por indicador y año.
  perform pg_advisory_xact_lock(hashtextextended('borrador:' || p_indicador::text || ':' || p_anio::text, 0));

  select b.version into v_actual from public.pdm_borradores b where b.indicador_id = p_indicador and b.anio = p_anio;
  if v_actual is distinct from nullif(p_version, 0) then
    raise exception 'PDM: el borrador cambió mientras lo editabas (o ya se envió o se descartó). Recarga la página para ver lo último' using errcode = '40001';
  end if;

  -- Un archivo ya registrado como evidencia de un reporte, o en el borrador de otro indicador o año, no puede entrar aquí.
  if exists (select 1 from public.pdm_evidencias ev where ev.ruta in (select x->>'ruta' from jsonb_array_elements(v_archivos) x)) then
    raise exception 'PDM: uno de esos archivos ya está en un reporte. Súbelo de nuevo' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.pdm_borrador_archivos a join public.pdm_borradores b on b.id = a.borrador_id
     where a.ruta in (select x->>'ruta' from jsonb_array_elements(v_archivos) x)
       and not (b.indicador_id = p_indicador and b.anio = p_anio)) then
    raise exception 'PDM: uno de esos archivos ya está en otro borrador. Súbelo de nuevo' using errcode = '23505';
  end if;

  return pdm_privado.escribir_borrador(p_indicador, p_anio, p_valor, v_texto, v_motivo, v_conservar, v_archivos);
end $f$;

-- Borra el borrador y devuelve las rutas de sus archivos, para que el servidor los quite del almacenamiento.
create or replace function public.pdm_borrador_descartar(p_indicador uuid, p_anio integer, p_version integer)
returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_actual integer;
  v_rutas text[];
begin
  if (select pdm_privado.mi_nivel()) is null or not pdm_privado.es_responsable(p_indicador) then
    raise exception 'PDM: este indicador no está a tu cargo' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('borrador:' || p_indicador::text || ':' || p_anio::text, 0));
  select b.version into v_actual from public.pdm_borradores b where b.indicador_id = p_indicador and b.anio = p_anio;
  if v_actual is null then
    return jsonb_build_object('retirados', '[]'::jsonb);
  end if;
  if v_actual <> p_version then
    raise exception 'PDM: el borrador cambió mientras lo editabas. Recarga la página para ver lo último' using errcode = '40001';
  end if;
  v_rutas := pdm_privado.quitar_borrador(p_indicador, p_anio);
  return jsonb_build_object('retirados', to_jsonb(v_rutas));
end $f$;

revoke all on function public.pdm_borrador_guardar(uuid, integer, integer, numeric, text, text, uuid[], jsonb) from public, anon;
revoke all on function public.pdm_borrador_descartar(uuid, integer, integer) from public, anon;
grant execute on function public.pdm_borrador_guardar(uuid, integer, integer, numeric, text, text, uuid[], jsonb) to authenticated, service_role;
grant execute on function public.pdm_borrador_descartar(uuid, integer, integer) to authenticated, service_role;

-- ─── 5. pdm_reportar: la de la 075, más una línea: el reporte enviado borra su borrador ───

create or replace function public.pdm_reportar(
  p_indicador uuid, p_anio integer, p_valor numeric, p_texto text, p_evidencias jsonb,
  p_motivo text default null, p_conservar uuid[] default '{}'::uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_yo uuid := (select auth.uid());
  v_plan uuid;
  v_inicio int;
  v_fin int;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_conservar uuid[] := coalesce(p_conservar, '{}');
  v_ultimo uuid;
  v_estado text;
  v_id uuid;
  v_prefijo text;
  v_limite bigint;
  e jsonb;
begin
  perform pdm_privado.abrir_operacion('reportar', null);
  select i.plan_id, p.anio_inicio, p.anio_fin into v_plan, v_inicio, v_fin
    from public.pdm_indicadores i join public.pdm_planes p on p.id = i.plan_id
   where i.id = p_indicador and i.activo;
  if v_plan is null then raise exception 'PDM: el indicador no existe o no tienes acceso a él' using errcode = '42501'; end if;
  -- Quién puede reportar se dice ANTES de validar nada. La política de la tabla sigue siendo la barrera real.
  if (select pdm_privado.mi_nivel()) is null or not pdm_privado.es_responsable(p_indicador) then
    raise exception 'PDM: este indicador no está a tu cargo' using errcode = '42501';
  end if;
  if p_anio is null or p_anio < v_inicio or p_anio > v_fin then
    raise exception 'PDM: elige un año del plan (% a %)', v_inicio, v_fin using errcode = '22023';
  end if;
  if p_anio > extract(year from (now() at time zone 'America/Bogota'))::int then
    raise exception 'PDM: el año % empieza el 1 de enero; todavía no se puede reportar', p_anio using errcode = '23514';
  end if;

  if p_valor is null or p_valor < 0 then raise exception 'PDM: el valor debe ser un número igual o mayor que cero' using errcode = '22023'; end if;
  if char_length(v_texto) < 10 then raise exception 'PDM: cuenta qué se hizo (al menos 10 caracteres)' using errcode = '22023'; end if;
  if char_length(v_texto) > 1000 then raise exception 'PDM: la descripción no puede pasar de 1.000 caracteres' using errcode = '22001'; end if;
  if jsonb_typeof(p_evidencias) is distinct from 'array' then
    raise exception 'PDM: un reporte necesita al menos una evidencia' using errcode = '23514';
  end if;
  if jsonb_array_length(p_evidencias) + cardinality(v_conservar) = 0 then
    raise exception 'PDM: un reporte necesita al menos una evidencia' using errcode = '23514';
  end if;
  if jsonb_array_length(p_evidencias) + cardinality(v_conservar) > pdm_privado.max_evidencias() then
    raise exception 'PDM: este reporte tiene más archivos de los que admite' using errcode = '22023';
  end if;
  if (select count(distinct c) from unnest(v_conservar) c) <> cardinality(v_conservar) then
    raise exception 'PDM: un archivo está repetido entre los que conservas' using errcode = '22023';
  end if;

  v_prefijo := v_plan::text || '/' || p_indicador::text || '/' || p_anio::text || '/';
  for e in select value from jsonb_array_elements(p_evidencias) loop
    if jsonb_typeof(e) is distinct from 'object'
       or coalesce(e->>'ruta', '') = '' or left(e->>'ruta', char_length(v_prefijo)) <> v_prefijo
       or (e->>'ruta') like '%..%' or char_length(e->>'ruta') > 300 then
      raise exception 'PDM: una evidencia no corresponde a este indicador y este año' using errcode = '22023';
    end if;
    if coalesce(btrim(e->>'nombre'), '') = '' or char_length(e->>'nombre') > 200 then
      raise exception 'PDM: una evidencia no tiene un nombre válido' using errcode = '22023';
    end if;
    -- Qué tipos se admiten y cuánto puede pesar cada uno lo dice UNA función (`pdm_privado.limite_de_evidencia`): esta no repite la lista.
    v_limite := pdm_privado.limite_de_evidencia(e->>'tipo');
    if v_limite is null then
      raise exception 'PDM: tipo de archivo no permitido (PDF, imagen, Word, Excel, presentación o video MP4 o MOV)' using errcode = '22023';
    end if;
    if (e->>'bytes') is null or (e->>'bytes') !~ '^[0-9]{1,12}$' or (e->>'bytes')::bigint < 1 or (e->>'bytes')::bigint > v_limite then
      raise exception 'PDM: este archivo pesa más de lo que admite su tipo (hasta % MB; los videos, hasta % MB)',
        pdm_privado.limite_de_evidencia('application/pdf') / 1048576, pdm_privado.limite_de_evidencia('video/mp4') / 1048576
        using errcode = '22022';
    end if;
  end loop;

  -- Un reporte a la vez por indicador y año; el mismo cerrojo lo toma el disparador (es reentrante).
  perform pg_advisory_xact_lock(hashtextextended(p_indicador::text || ':' || p_anio::text, 0));

  -- Lo último que se reportó en este año (sin contar lo anulado): si está sin cerrar, esto es su corrección; si está
  -- aprobado, es un avance nuevo.
  select r.id into v_ultimo from public.pdm_reportes r
   where r.indicador_id = p_indicador and r.anio = p_anio
     and not pdm_privado.anulado(r.id)
   order by r.created_at desc, r.id desc limit 1;
  if v_ultimo is not null then
    select x.estado into v_estado from public.pdm_validaciones x where x.reporte_id = v_ultimo order by x.created_at desc, x.id desc limit 1;
    v_estado := coalesce(v_estado, 'pendiente');
  end if;

  if v_ultimo is null or v_estado = 'aprobado' then
    if cardinality(v_conservar) > 0 then
      raise exception 'PDM: solo se conservan archivos al corregir un reporte que no está aprobado' using errcode = '22023';
    end if;
    insert into public.pdm_reportes (indicador_id, anio, valor, texto, autor_id, autor_nombre)
    values (p_indicador, p_anio, p_valor, v_texto, v_yo, pdm_privado.nombre_de(v_yo))
    returning id into v_id;
  else
    if v_motivo is null or char_length(v_motivo) < 10 then
      raise exception 'PDM: di qué corriges (al menos 10 caracteres)' using errcode = '22023';
    end if;
    if char_length(v_motivo) > 500 then raise exception 'PDM: el motivo no puede pasar de 500 caracteres' using errcode = '22001'; end if;
    if (select count(*) from public.pdm_evidencias e where e.id = any(v_conservar) and e.reporte_id = v_ultimo) <> cardinality(v_conservar) then
      raise exception 'PDM: un archivo que quieres conservar no es del reporte que corriges' using errcode = '22023';
    end if;
    insert into public.pdm_reportes (indicador_id, anio, valor, texto, autor_id, autor_nombre, corrige_a, motivo_correccion)
    values (p_indicador, p_anio, p_valor, v_texto, v_yo, pdm_privado.nombre_de(v_yo), v_ultimo, v_motivo)
    returning id into v_id;
  end if;

  insert into public.pdm_evidencias (reporte_id, ruta, nombre, tipo, bytes, subido_por)
  select v_id, x->>'ruta', btrim(x->>'nombre'), x->>'tipo', (x->>'bytes')::bigint, v_yo
  from jsonb_array_elements(p_evidencias) x;

  -- Lo conservado: filas nuevas de esta versión que apuntan a las anteriores (el disparador las rellena tal cual eran).
  insert into public.pdm_evidencias (reporte_id, ruta, nombre, tipo, bytes, subido_por, copia_de)
  select v_id, e.ruta, e.nombre, e.tipo, e.bytes, v_yo, e.id
  from public.pdm_evidencias e where e.id = any(v_conservar);

  -- El reporte enviado borra el borrador de ese indicador y año, en esta misma transacción (migración 076). Los archivos del borrador
  -- que van en este reporte ya son evidencias suyas; el servidor quita del almacenamiento los que no entraron.
  perform pdm_privado.quitar_borrador(p_indicador, p_anio);

  return jsonb_build_object(
    'reporte', v_id, 'correccion', v_ultimo is not null and v_estado <> 'aprobado', 'anio', p_anio,
    'conservadas', cardinality(v_conservar));
end $f$;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. Las tablas existen con seguridad por fila y SOLO lectura para quien tiene sesión; anon no alcanza nada
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in ('pdm_borradores', 'pdm_borrador_archivos') and c.relrowsecurity) <> 2 then
    raise exception 'PDM 076: las tablas del borrador no tienen seguridad por fila';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('pdm_borradores', 'pdm_borrador_archivos')) <> 2 then
    raise exception 'PDM 076: las tablas del borrador deben tener exactamente sus dos políticas de lectura';
  end if;
  if exists (select 1 from unnest(array['public.pdm_borradores', 'public.pdm_borrador_archivos']) t,
                  unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
              where has_table_privilege('authenticated', t, p) or has_table_privilege('anon', t, p)) then
    raise exception 'PDM 076: alguien además del servidor puede escribir en las tablas del borrador';
  end if;
  if not has_table_privilege('authenticated', 'public.pdm_borradores', 'SELECT')
     or not has_table_privilege('authenticated', 'public.pdm_borrador_archivos', 'SELECT')
     or has_table_privilege('anon', 'public.pdm_borradores', 'SELECT')
     or has_table_privilege('anon', 'public.pdm_borrador_archivos', 'SELECT') then
    raise exception 'PDM 076: los permisos de lectura del borrador no son los previstos';
  end if;

  -- 2. Las funciones: de invocador las públicas, de definidor las dos ayudas, ruta de búsqueda fija, sin anon
  select string_agg(p.oid::regprocedure::text, ', ') into v_malas
  from pg_proc p
  where p.oid in ('public.pdm_borrador_guardar(uuid, integer, integer, numeric, text, text, uuid[], jsonb)'::regprocedure,
                  'public.pdm_borrador_descartar(uuid, integer, integer)'::regprocedure,
                  'public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure)
    and (p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or not has_function_privilege('service_role', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 076: % perdió su forma o sus permisos', v_malas; end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v_malas
  from pg_proc p
  where p.oid in ('pdm_privado.escribir_borrador(uuid, integer, numeric, text, text, uuid[], jsonb)'::regprocedure,
                  'pdm_privado.quitar_borrador(uuid, integer)'::regprocedure)
    and (not p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 076: la ayuda % no es de definidor, o no tiene sus permisos', v_malas; end if;

  -- 3. pdm_reportar sigue consultando los tipos y el tope de archivos, y ahora borra el borrador
  if not exists (select 1 from pg_proc p where p.oid = 'public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure
                    and p.prosrc like '%pdm_privado.limite_de_evidencia%' and p.prosrc like '%pdm_privado.max_evidencias()%'
                    and p.prosrc like '%pdm_privado.quitar_borrador(p_indicador, p_anio)%') then
    raise exception 'PDM 076: pdm_reportar no quedó como debe';
  end if;

  -- 4. El mismo orden de las funciones públicas del módulo no cambia: las dos nuevas son las únicas añadidas
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pdm_borrador_guardar')
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pdm_borrador_descartar') then
    raise exception 'PDM 076: faltan las funciones públicas del borrador';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/076_pdm_borradores.sql (vuelve a la `pdm_reportar` de la 075 y borra las dos
-- tablas y las cuatro funciones; se NIEGA si ya hay borradores guardados, porque borrarlos es perder trabajo de alguien).
