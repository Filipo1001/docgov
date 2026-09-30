-- Migration 050: módulo Plan de Desarrollo, Fase A — datos y responsabilidades
--
-- POR QUÉ. El módulo hoy lee un archivo de Excel sembrado en el código: nada se
-- guarda. Para asignar responsables, habilitar personas y conservar quién hizo
-- qué hace falta un lugar donde escribir. Esta migración lo crea, y NADA MÁS.
--
-- LO QUE NO HACE. No modifica ninguna tabla, columna, política ni función de
-- Contratista Digital. Todo es nuevo, con el prefijo `pdm_`, y CD no depende de
-- ello: revertirlo es borrar estas tablas (ver el final del archivo).
--
-- QUÉ TABLAS.
--   pdm_planes         el plan y su nombre («Por Amor a Fredonia»), como dato
--   pdm_indicadores    los 257 del archivo de seguimiento
--   pdm_metas          la meta de cada año (2024–2027)
--   pdm_cortes         los cortes de seguimiento («Junio de 2026»)
--   pdm_reportes       cada avance, como una fila NUEVA: nunca se reescribe
--   pdm_asignaciones   quién responde por cada indicador (uno principal)
--   pdm_permisos       quién puede entrar al módulo y con qué alcance
--   pdm_historial      quién hizo qué y cuándo: solo se escribe, nunca se cambia
--
-- POR QUÉ `codigo` NO ES ÚNICO. En el archivo, «1.1.1» es el código del
-- PROGRAMA: hay 257 indicadores y 32 códigos. Una restricción de unicidad sobre
-- él habría hecho fallar esta migración. La clave estable de importación es la
-- fila del archivo (`fila_origen`).
--
-- REGLAS DE BORRADO. CD elimina usuarios a mano y por nombre de tabla
-- (`eliminarUsuario`). Una clave hacia `usuarios` con NO ACTION haría fallar ese
-- borrado con un error que hoy no existe, y esa función no conoce tablas que no
-- existían. Por eso:
--   · una asignación o un permiso SIGUE a la persona: ON DELETE CASCADE. Si se
--     borra el usuario, el indicador vuelve a quedar sin responsable y aparece
--     como tal en la pantalla de Responsables — que es lo correcto.
--   · la AUTORÍA (quién reportó, quién asignó) sobrevive a la persona: ON DELETE
--     SET NULL, con el nombre guardado al lado (`*_nombre`) para que el
--     historial no pierda a su autor.
--   · nunca NO ACTION hacia `usuarios`. Al final se comprueba.
--
-- SEGURIDAD.
--   · RLS activo en todas, una política por acción y solo para `authenticated`.
--     Las políticas usan `(select auth.uid())` y `(select public.get_user_rol())`,
--     como el resto de CD (migración 044).
--   · Supabase da por defecto a `anon` todos los permisos sobre cualquier tabla
--     nueva de `public`; aquí se le quitan. Y `pdm_reportes` y `pdm_historial`
--     pierden además UPDATE y DELETE a nivel de PERMISO, no solo de política:
--     ni una política mal escrita después podría reescribirlos.
--   · Las ayudas de las políticas viven en el esquema `pdm_privado`, que la API
--     NO expone. Así no nacen funciones SECURITY DEFINER invocables por RPC
--     (el asesor ya avisa de eso con `get_user_rol`).
--   · Las políticas no dependen de `municipio_id`: como en el resto de CD, hay un
--     solo municipio. El día que haya más, esto y CD se revisan juntos.
--
-- ATOMICIDAD Y BLOQUEOS. Va en una transacción: o se crea todo o no se crea nada.
-- Las claves hacia `usuarios`, `dependencias` y `municipios` toman un bloqueo
-- breve sobre esas tablas al crearse; `lock_timeout` hace que, si alguien las
-- tiene bloqueadas, esto falle rápido en vez de hacer fila y detener las
-- escrituras de CD detrás de sí.
--
-- AL FINAL, un bloque comprueba lo que aquí se promete (RLS, sin `anon`, sin
-- NO ACTION hacia `usuarios`, índices en las claves). Si algo falla, aborta y
-- deshace todo.
--
-- LO QUE VIENE DESPUÉS (Fase B, otra migración): `pdm_evidencias`, el bucket
-- `pdm-evidencias`, y las políticas para que un responsable reporte en un corte
-- abierto. Aquí ningún responsable puede insertar reportes todavía.
--
-- LA SEMILLA (los 257 indicadores, las metas, el corte de junio y las
-- asignaciones de los 23 vínculos con usuario) NO va aquí: lleva identificadores
-- de producción y no tiene sentido en otra base. Es un paso aparte.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── Esquema privado para las ayudas de las políticas ───────────────────────

create schema if not exists pdm_privado;
revoke all on schema pdm_privado from public;
grant usage on schema pdm_privado to authenticated;

-- ─── Tablas ─────────────────────────────────────────────────────────────────

create table public.pdm_planes (
  id            uuid primary key default gen_random_uuid(),
  municipio_id  uuid not null references public.municipios(id) on delete restrict,
  nombre        text not null check (btrim(nombre) <> ''),
  denominacion  text not null default 'Plan de Desarrollo',
  anio_inicio   integer not null,
  anio_fin      integer not null,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (anio_fin >= anio_inicio)
);
create index pdm_planes_municipio_idx on public.pdm_planes (municipio_id);

create table public.pdm_indicadores (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.pdm_planes(id) on delete restrict,
  dependencia_id   uuid not null references public.dependencias(id) on delete restrict,
  -- Fila del archivo de Excel: clave estable para importar sin duplicar.
  fila_origen      integer not null,
  -- Código del PROGRAMA. NO es único: lo comparten varios indicadores.
  codigo           text not null,
  linea            text not null,
  sector           text not null,
  programa         text not null,
  producto         text not null,
  indicador        text not null check (btrim(indicador) <> ''),
  unidad           text not null,
  linea_base       numeric,
  meta_cuatrienio  numeric,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (plan_id, fila_origen)
);
create index pdm_indicadores_dependencia_idx on public.pdm_indicadores (dependencia_id);

create table public.pdm_metas (
  indicador_id  uuid not null references public.pdm_indicadores(id) on delete cascade,
  anio          integer not null,
  meta          numeric not null check (meta >= 0),
  primary key (indicador_id, anio)
);

create table public.pdm_cortes (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.pdm_planes(id) on delete restrict,
  nombre       text not null check (btrim(nombre) <> ''),
  fecha_corte  date not null,
  estado       text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  created_at   timestamptz not null default now(),
  unique (plan_id, nombre)
);

-- Un reporte NUNCA se reescribe: corregirlo es insertar otro que lo apunta y dice por qué.
-- `valor` es lo que el responsable reporta; si es acumulado o del año lo define la
-- Alcaldía (pregunta abierta), y por eso no se le pone nombre que lo presuponga.
create table public.pdm_reportes (
  id                 uuid primary key default gen_random_uuid(),
  indicador_id       uuid not null references public.pdm_indicadores(id) on delete restrict,
  corte_id           uuid not null references public.pdm_cortes(id) on delete restrict,
  valor              numeric not null check (valor >= 0),
  valor_anterior     numeric,
  texto              text,
  autor_id           uuid references public.usuarios(id) on delete set null,
  autor_nombre       text not null check (btrim(autor_nombre) <> ''),
  corrige_a          uuid,
  motivo_correccion  text,
  created_at         timestamptz not null default now(),
  -- Es corrección si y solo si dice por qué.
  check ((corrige_a is null) = (motivo_correccion is null)),
  -- Una corrección apunta a un reporte DEL MISMO indicador.
  unique (id, indicador_id),
  foreign key (corrige_a, indicador_id) references public.pdm_reportes (id, indicador_id) on delete restrict
);
create index pdm_reportes_vigente_idx on public.pdm_reportes (indicador_id, corte_id, created_at desc);
create index pdm_reportes_corte_idx   on public.pdm_reportes (corte_id);
create index pdm_reportes_autor_idx   on public.pdm_reportes (autor_id);
create index pdm_reportes_corrige_idx on public.pdm_reportes (corrige_a);

create table public.pdm_asignaciones (
  id                  uuid primary key default gen_random_uuid(),
  indicador_id        uuid not null references public.pdm_indicadores(id) on delete cascade,
  usuario_id          uuid not null references public.usuarios(id) on delete cascade,
  principal           boolean not null default false,
  asignado_por        uuid references public.usuarios(id) on delete set null,
  asignado_por_nombre text,
  created_at          timestamptz not null default now(),
  unique (indicador_id, usuario_id)
);
-- Un solo responsable principal por indicador.
create unique index pdm_asignaciones_un_principal on public.pdm_asignaciones (indicador_id) where principal;
create index pdm_asignaciones_usuario_idx on public.pdm_asignaciones (usuario_id);
create index pdm_asignaciones_asignador_idx on public.pdm_asignaciones (asignado_por);

-- El administrador no necesita fila: lo es por su rol. `coordinador` es la secretaría:
-- ve y asigna lo de SU dependencia. `responsable` reporta lo que se le asignó.
-- `consulta` mira todo sin tocar nada (Control Interno).
create table public.pdm_permisos (
  usuario_id          uuid primary key references public.usuarios(id) on delete cascade,
  nivel               text not null check (nivel in ('consulta', 'responsable', 'coordinador')),
  habilitado_por      uuid references public.usuarios(id) on delete set null,
  habilitado_por_nombre text,
  created_at          timestamptz not null default now()
);
create index pdm_permisos_habilitador_idx on public.pdm_permisos (habilitado_por);

create table public.pdm_historial (
  id           bigint generated always as identity primary key,
  plan_id      uuid not null references public.pdm_planes(id) on delete restrict,
  actor_id     uuid references public.usuarios(id) on delete set null,
  actor_nombre text not null check (btrim(actor_nombre) <> ''),
  accion       text not null,
  entidad      text not null,
  entidad_id   uuid,
  detalle      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index pdm_historial_plan_idx    on public.pdm_historial (plan_id, created_at desc);
create index pdm_historial_actor_idx   on public.pdm_historial (actor_id);
create index pdm_historial_entidad_idx on public.pdm_historial (entidad, entidad_id);

create trigger pdm_planes_updated_at before update on public.pdm_planes
  for each row execute function public.update_updated_at();
create trigger pdm_indicadores_updated_at before update on public.pdm_indicadores
  for each row execute function public.update_updated_at();

comment on table public.pdm_planes        is 'Plan de Desarrollo de un municipio. El nombre es un dato, no una constante: CD sirve a varias alcaldías.';
comment on table public.pdm_indicadores   is 'Indicadores de producto del plan. `codigo` es el del PROGRAMA y se repite; la clave de importación es `fila_origen`.';
comment on table public.pdm_metas         is 'Meta de cada indicador por año.';
comment on table public.pdm_cortes        is 'Cortes de seguimiento del plan.';
comment on table public.pdm_reportes      is 'Avances reportados. Solo se inserta: corregir es insertar otra fila con `corrige_a` y su motivo. UPDATE y DELETE están revocados.';
comment on table public.pdm_asignaciones  is 'Responsables por indicador. Un solo `principal` por indicador. Se borra con la persona.';
comment on table public.pdm_permisos      is 'Quién puede entrar al módulo y con qué alcance. El administrador no necesita fila.';
comment on table public.pdm_historial     is 'Bitácora: quién hizo qué. Solo se inserta; UPDATE y DELETE están revocados.';

-- ─── Ayudas de las políticas (esquema NO expuesto por la API) ───────────────
--
-- SECURITY DEFINER a propósito: leen `usuarios` y las tablas `pdm_` saltándose su
-- RLS para no evaluarlo dentro de otro RLS. Solo devuelven datos de QUIEN
-- PREGUNTA (auth.uid()) o un booleano sobre él: no filtran nada de terceros.

create function pdm_privado.mi_dependencia() returns uuid
language sql stable security definer set search_path = ''
as $$ select dependencia_id from public.usuarios where id = (select auth.uid()) $$;

create function pdm_privado.mi_nivel() returns text
language sql stable security definer set search_path = ''
as $$ select nivel from public.pdm_permisos where usuario_id = (select auth.uid()) $$;

create function pdm_privado.dependencia_de(p_usuario uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select dependencia_id from public.usuarios where id = p_usuario $$;

create function pdm_privado.dependencia_del_indicador(p_indicador uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select dependencia_id from public.pdm_indicadores where id = p_indicador $$;

create function pdm_privado.es_responsable(p_indicador uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.pdm_asignaciones
  where indicador_id = p_indicador and usuario_id = (select auth.uid())
) $$;

revoke all on function
  pdm_privado.mi_dependencia(), pdm_privado.mi_nivel(), pdm_privado.dependencia_de(uuid),
  pdm_privado.dependencia_del_indicador(uuid), pdm_privado.es_responsable(uuid)
from public;
grant execute on function
  pdm_privado.mi_dependencia(), pdm_privado.mi_nivel(), pdm_privado.dependencia_de(uuid),
  pdm_privado.dependencia_del_indicador(uuid), pdm_privado.es_responsable(uuid)
to authenticated;

-- ─── Permisos de tabla ──────────────────────────────────────────────────────
--
-- Se quita TODO a `anon`, `authenticated` y PUBLIC y se concede solo lo necesario:
-- los permisos por defecto de Supabase incluyen TRUNCATE, TRIGGER y REFERENCES.

alter table public.pdm_planes       enable row level security;
alter table public.pdm_indicadores  enable row level security;
alter table public.pdm_metas        enable row level security;
alter table public.pdm_cortes       enable row level security;
alter table public.pdm_reportes     enable row level security;
alter table public.pdm_asignaciones enable row level security;
alter table public.pdm_permisos     enable row level security;
alter table public.pdm_historial    enable row level security;

revoke all on
  public.pdm_planes, public.pdm_indicadores, public.pdm_metas, public.pdm_cortes,
  public.pdm_reportes, public.pdm_asignaciones, public.pdm_permisos, public.pdm_historial
from public, anon, authenticated;

grant select, insert, update, delete on
  public.pdm_planes, public.pdm_indicadores, public.pdm_metas, public.pdm_cortes,
  public.pdm_asignaciones, public.pdm_permisos
to authenticated;

-- Solo se escribe hacia adelante.
grant select, insert on public.pdm_reportes, public.pdm_historial to authenticated;

-- ─── Políticas ──────────────────────────────────────────────────────────────
--
-- Una por acción y por tabla (varias políticas permisivas para la misma acción
-- se evalúan TODAS en cada consulta, y es lo que el asesor de rendimiento avisa).
-- «admin» = (select public.get_user_rol()) = 'admin'. `mi_nivel()` es null para
-- quien no tiene fila en pdm_permisos: esa persona no ve nada.

-- pdm_planes · pdm_cortes: los ve quien está en el módulo; los escribe el administrador.
create policy pdm_planes_select on public.pdm_planes for select to authenticated
  using ((select public.get_user_rol()) = 'admin' or (select pdm_privado.mi_nivel()) is not null);
create policy pdm_planes_insert on public.pdm_planes for insert to authenticated
  with check ((select public.get_user_rol()) = 'admin');
create policy pdm_planes_update on public.pdm_planes for update to authenticated
  using ((select public.get_user_rol()) = 'admin') with check ((select public.get_user_rol()) = 'admin');
create policy pdm_planes_delete on public.pdm_planes for delete to authenticated
  using ((select public.get_user_rol()) = 'admin');

create policy pdm_cortes_select on public.pdm_cortes for select to authenticated
  using ((select public.get_user_rol()) = 'admin' or (select pdm_privado.mi_nivel()) is not null);
create policy pdm_cortes_insert on public.pdm_cortes for insert to authenticated
  with check ((select public.get_user_rol()) = 'admin');
create policy pdm_cortes_update on public.pdm_cortes for update to authenticated
  using ((select public.get_user_rol()) = 'admin') with check ((select public.get_user_rol()) = 'admin');
create policy pdm_cortes_delete on public.pdm_cortes for delete to authenticated
  using ((select public.get_user_rol()) = 'admin');

-- pdm_indicadores: cada quien ve lo que le corresponde. La estructura la escribe el administrador.
create policy pdm_indicadores_select on public.pdm_indicadores for select to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or (select pdm_privado.mi_nivel()) = 'consulta'
    or ((select pdm_privado.mi_nivel()) = 'coordinador' and dependencia_id = (select pdm_privado.mi_dependencia()))
    or pdm_privado.es_responsable(id)
  );
create policy pdm_indicadores_insert on public.pdm_indicadores for insert to authenticated
  with check ((select public.get_user_rol()) = 'admin');
create policy pdm_indicadores_update on public.pdm_indicadores for update to authenticated
  using ((select public.get_user_rol()) = 'admin') with check ((select public.get_user_rol()) = 'admin');
create policy pdm_indicadores_delete on public.pdm_indicadores for delete to authenticated
  using ((select public.get_user_rol()) = 'admin');

-- pdm_metas · pdm_reportes: se ven si se ve el indicador (la subconsulta ya aplica su RLS).
create policy pdm_metas_select on public.pdm_metas for select to authenticated
  using (exists (select 1 from public.pdm_indicadores i where i.id = pdm_metas.indicador_id));
create policy pdm_metas_insert on public.pdm_metas for insert to authenticated
  with check ((select public.get_user_rol()) = 'admin');
create policy pdm_metas_update on public.pdm_metas for update to authenticated
  using ((select public.get_user_rol()) = 'admin') with check ((select public.get_user_rol()) = 'admin');
create policy pdm_metas_delete on public.pdm_metas for delete to authenticated
  using ((select public.get_user_rol()) = 'admin');

create policy pdm_reportes_select on public.pdm_reportes for select to authenticated
  using (exists (select 1 from public.pdm_indicadores i where i.id = pdm_reportes.indicador_id));
-- Fase A: el administrador solo puede CORREGIR (con motivo), a su nombre. Reportar por
-- otro no: lo que un responsable reportó es suyo. Los responsables reportan en la Fase B.
create policy pdm_reportes_insert on public.pdm_reportes for insert to authenticated
  with check (
    (select public.get_user_rol()) = 'admin'
    and autor_id = (select auth.uid())
    and corrige_a is not null
  );

-- pdm_asignaciones: la secretaría asigna dentro de SU dependencia; el administrador, todo.
create policy pdm_asignaciones_select on public.pdm_asignaciones for select to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or usuario_id = (select auth.uid())
    or (select pdm_privado.mi_nivel()) = 'consulta'
    or ((select pdm_privado.mi_nivel()) = 'coordinador'
        and pdm_privado.dependencia_del_indicador(indicador_id) = (select pdm_privado.mi_dependencia()))
  );
create policy pdm_asignaciones_insert on public.pdm_asignaciones for insert to authenticated
  with check (
    asignado_por = (select auth.uid())
    and (
      (select public.get_user_rol()) = 'admin'
      or ((select pdm_privado.mi_nivel()) = 'coordinador'
          and pdm_privado.dependencia_del_indicador(indicador_id) = (select pdm_privado.mi_dependencia()))
    )
  );
create policy pdm_asignaciones_update on public.pdm_asignaciones for update to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador'
        and pdm_privado.dependencia_del_indicador(indicador_id) = (select pdm_privado.mi_dependencia()))
  )
  with check (
    (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador'
        and pdm_privado.dependencia_del_indicador(indicador_id) = (select pdm_privado.mi_dependencia()))
  );
create policy pdm_asignaciones_delete on public.pdm_asignaciones for delete to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador'
        and pdm_privado.dependencia_del_indicador(indicador_id) = (select pdm_privado.mi_dependencia()))
  );

-- pdm_permisos: cada quien ve el suyo. La secretaría habilita como `responsable` a gente de
-- SU dependencia (no puede darse ni dar más nivel). Subir de nivel es del administrador.
create policy pdm_permisos_select on public.pdm_permisos for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador'
        and pdm_privado.dependencia_de(usuario_id) = (select pdm_privado.mi_dependencia()))
  );
create policy pdm_permisos_insert on public.pdm_permisos for insert to authenticated
  with check (
    habilitado_por = (select auth.uid())
    and (
      (select public.get_user_rol()) = 'admin'
      or ((select pdm_privado.mi_nivel()) = 'coordinador'
          and nivel = 'responsable'
          and pdm_privado.dependencia_de(usuario_id) = (select pdm_privado.mi_dependencia()))
    )
  );
create policy pdm_permisos_update on public.pdm_permisos for update to authenticated
  using ((select public.get_user_rol()) = 'admin') with check ((select public.get_user_rol()) = 'admin');
create policy pdm_permisos_delete on public.pdm_permisos for delete to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador'
        and nivel = 'responsable'
        and pdm_privado.dependencia_de(usuario_id) = (select pdm_privado.mi_dependencia()))
  );

-- pdm_historial: lo lee el administrador. Cada quien solo puede anotar lo que hizo ÉL.
create policy pdm_historial_select on public.pdm_historial for select to authenticated
  using ((select public.get_user_rol()) = 'admin');
create policy pdm_historial_insert on public.pdm_historial for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and ((select public.get_user_rol()) = 'admin' or (select pdm_privado.mi_nivel()) is not null)
  );

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. RLS activo en todas las tablas pdm_
  select string_agg(c.relname, ', ') into v_malas
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and c.relname like 'pdm\_%' and not c.relrowsecurity;
  if v_malas is not null then raise exception 'PDM: sin RLS: %', v_malas; end if;

  -- 2. `anon` no puede nada; `authenticated` no puede TRUNCATE ni REFERENCES ni TRIGGER
  select string_agg(c.relname || ':' || p, ', ') into v_malas
  from pg_class c, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'pdm\_%'
    and (has_table_privilege('anon', c.oid, p)
         or (p in ('TRUNCATE','REFERENCES','TRIGGER') and has_table_privilege('authenticated', c.oid, p)));
  if v_malas is not null then raise exception 'PDM: permisos de sobra: %', v_malas; end if;

  -- 3. Las tablas de solo escritura no se pueden actualizar ni borrar
  select string_agg(c.relname || ':' || p, ', ') into v_malas
  from pg_class c, unnest(array['UPDATE','DELETE']) p
  where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_reportes', 'pdm_historial')
    and has_table_privilege('authenticated', c.oid, p);
  if v_malas is not null then raise exception 'PDM: se puede reescribir: %', v_malas; end if;

  -- 4. Ninguna política para PUBLIC o anon: solo authenticated
  select string_agg(tablename || '.' || policyname, ', ') into v_malas
  from pg_policies
  where schemaname = 'public' and tablename like 'pdm\_%' and roles <> '{authenticated}';
  if v_malas is not null then raise exception 'PDM: políticas fuera de authenticated: %', v_malas; end if;

  -- 5. Nunca NO ACTION ni RESTRICT hacia `usuarios`: solo CASCADE o SET NULL
  select string_agg(conrelid::regclass::text || '.' || conname, ', ') into v_malas
  from pg_constraint
  where contype = 'f' and confrelid = 'public.usuarios'::regclass
    and conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and confdeltype not in ('c', 'n');
  if v_malas is not null then raise exception 'PDM: bloquearía el borrado de usuarios: %', v_malas; end if;

  -- 6. Toda clave foránea tiene un índice que empieza por su primera columna
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into v_malas
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid and i.indkey[0] = c.conkey[1]
    );
  if v_malas is not null then raise exception 'PDM: clave foránea sin índice: %', v_malas; end if;

  -- 7. Las ayudas no son invocables por PUBLIC ni por anon
  -- (PUBLIC es el «grantee» 0 en la lista de permisos; no existe como rol con nombre.)
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pdm_privado'
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
    );
  if v_malas is not null then raise exception 'PDM: ayuda invocable de más: %', v_malas; end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
--   begin;
--   set local lock_timeout = '3s';
--   drop table public.pdm_historial, public.pdm_reportes, public.pdm_asignaciones,
--              public.pdm_permisos, public.pdm_metas, public.pdm_cortes,
--              public.pdm_indicadores, public.pdm_planes;
--   drop schema pdm_privado cascade;
--   commit;
--
-- Ningún objeto de Contratista Digital depende de estos.
