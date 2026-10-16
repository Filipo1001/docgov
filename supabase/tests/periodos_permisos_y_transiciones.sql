-- ============================================================================
-- Pruebas de la migración 065: permisos por columna y transiciones de estado de `periodos`.
--
-- Qué comprueba, sin simular a nadie ni escribir nada:
--   A. Permisos (catálogo): ni `anon` ni `authenticated` tienen UPDATE a nivel de tabla; `authenticated` puede
--      actualizar EXACTAMENTE seis columnas; `anon`, ninguna; el disparador está puesto y activo; los disparadores
--      que ya había se conservan; las funciones puras siguen siendo ejecutables por `authenticated` (el disparador
--      las llama con su sesión) y la del disparador no.
--   B. Tabla de verdad de `periodos_transicion_permitida(rol, de, a)`: lo que hace cada una de las 8 funciones de
--      app/actions/periodos.ts que escriben con la sesión del usuario, y lo que NO debe poder hacer nadie.
--   C. Casos de fila de `periodos_cambio_no_permitido(rol, antes, después)`: las columnas exactas que escribe cada
--      función, y los cambios que no valen (tocar un radicado, aprobar sin ser quien aprueba, revisar la planilla
--      propia, mover fechas fuera de su transición...).
--   D. (Informativo, no cuenta como falla) transiciones del historial que la tabla no permite a una sesión: son las
--      que hace el servidor con `service_role` (radicar, devolver como administrador) o flujos antiguos.
--
-- Cómo se corre: pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de la sesión). NO DEJA NADA
-- ESCRITO: todo pasa dentro de un bloque que termina con un error a propósito, y Postgres deshace la transacción
-- entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PERIODOS-065: N comprobaciones, 0 fallas» y la lista.
-- La última línea (1/0) es una red de seguridad por si el bloque terminara sin error.
-- ============================================================================

create temp table res_065 (n serial, ok boolean, linea text) on commit drop;

create or replace function pg_temp.chk(p_nombre text, p_ok boolean) returns void
language sql as $f$
  insert into res_065 (ok, linea)
  values (coalesce(p_ok, false), case when coalesce(p_ok, false) then 'ok     ' else 'FALLA  ' end || p_nombre)
$f$;

create or replace function pg_temp.fila(j jsonb) returns public.periodos
language sql as $f$ select jsonb_populate_record(null::public.periodos, j) $f$;

do $$
declare
  r record;
  cols_esperadas text[] := array['estado','fecha_aprobacion','fecha_envio','motivo_rechazo','planilla_comentario','planilla_estado'];
  cols_authenticated text[];
  cols_anon text[];
  motivo text;
  informativo text;
  total int; fallas int;
begin
  -- ── A. Permisos y disparadores ─────────────────────────────────────────────
  perform pg_temp.chk('A1 authenticated no tiene UPDATE a nivel de tabla', not has_table_privilege('authenticated', 'public.periodos', 'UPDATE'));
  perform pg_temp.chk('A2 anon no tiene UPDATE a nivel de tabla',          not has_table_privilege('anon', 'public.periodos', 'UPDATE'));

  select coalesce(array_agg(column_name::text order by column_name), '{}') into cols_authenticated
    from information_schema.columns where table_schema = 'public' and table_name = 'periodos'
     and has_column_privilege('authenticated', 'public.periodos', column_name, 'UPDATE');
  select coalesce(array_agg(column_name::text order by column_name), '{}') into cols_anon
    from information_schema.columns where table_schema = 'public' and table_name = 'periodos'
     and has_column_privilege('anon', 'public.periodos', column_name, 'UPDATE');
  perform pg_temp.chk(format('A3 authenticated actualiza exactamente 6 columnas (tiene: %s)', array_to_string(cols_authenticated, ', ')),
                      cols_authenticated = cols_esperadas);
  perform pg_temp.chk(format('A4 anon no actualiza ninguna columna (tiene: %s)', coalesce(nullif(array_to_string(cols_anon, ', '), ''), 'ninguna')),
                      cols_anon = '{}');

  perform pg_temp.chk('A5 el disparador periodos_proteger_cambios existe, activo, BEFORE UPDATE por fila',
    exists (select 1 from pg_trigger where tgrelid = 'public.periodos'::regclass and tgname = 'periodos_proteger_cambios'
             and tgenabled = 'O' and (tgtype & 19) = 19 and not tgisinternal));
  perform pg_temp.chk('A6 se conservan tr_periodos_updated y trg_prevent_historico_update',
    (select count(*) from pg_trigger where tgrelid = 'public.periodos'::regclass and tgenabled = 'O' and not tgisinternal
        and tgname in ('tr_periodos_updated', 'trg_prevent_historico_update')) = 2);
  perform pg_temp.chk('A7 la función del disparador no es ejecutable por authenticated ni anon',
    not has_function_privilege('authenticated', 'public.periodos_proteger_cambios()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.periodos_proteger_cambios()', 'EXECUTE'));
  perform pg_temp.chk('A8 las funciones puras SÍ son ejecutables por authenticated (el disparador las llama con su sesión)',
    has_function_privilege('authenticated', 'public.periodos_transicion_permitida(text, public.estado_periodo, public.estado_periodo)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.periodos_cambio_no_permitido(text, public.periodos, public.periodos)', 'EXECUTE'));
  perform pg_temp.chk('A9 la seguridad por filas (RLS) sigue activa en periodos',
    (select relrowsecurity from pg_class where oid = 'public.periodos'::regclass));
  perform pg_temp.chk('A10 get_user_rol() es ejecutable por authenticated (el disparador lo usa)',
    has_function_privilege('authenticated', 'public.get_user_rol()', 'EXECUTE'));

  -- ── B. Tabla de verdad de las transiciones ───────────────────────────────────
  for r in select * from (values
    -- contratista: solo enviar
    ('contratista','borrador','enviado',true), ('contratista','rechazado','enviado',true),
    ('contratista','borrador','aprobado',false), ('contratista','enviado','aprobado',false), ('contratista','revision','aprobado',false),
    ('contratista','rechazado','aprobado',false), ('contratista','enviado','borrador',false), ('contratista','aprobado','borrador',false),
    ('contratista','enviado','revision',false), ('contratista','aprobado','radicado',false), ('contratista','borrador','radicado',false),
    ('contratista','enviado','rechazado',false),
    -- asesor: revisar, rechazar, revocar; nunca aprobar ni enviar
    ('asesor','enviado','revision',true), ('asesor','enviado','rechazado',true), ('asesor','revision','rechazado',true), ('asesor','revision','enviado',true),
    ('asesor','enviado','aprobado',false), ('asesor','revision','aprobado',false), ('asesor','borrador','enviado',false),
    ('asesor','rechazado','enviado',false), ('asesor','aprobado','enviado',false), ('asesor','aprobado','radicado',false),
    -- supervisor: lo del asesor y aprobar; nunca enviar, deshacer una aprobación ni radicar
    ('supervisor','enviado','revision',true), ('supervisor','enviado','rechazado',true), ('supervisor','revision','rechazado',true),
    ('supervisor','revision','enviado',true), ('supervisor','enviado','aprobado',true), ('supervisor','revision','aprobado',true),
    ('supervisor','borrador','enviado',false), ('supervisor','rechazado','enviado',false), ('supervisor','borrador','aprobado',false),
    ('supervisor','rechazado','aprobado',false), ('supervisor','aprobado','enviado',false), ('supervisor','aprobado','revision',false),
    ('supervisor','aprobado','rechazado',false), ('supervisor','aprobado','borrador',false), ('supervisor','aprobado','radicado',false),
    ('supervisor','radicado','borrador',false), ('supervisor','radicado','aprobado',false),
    -- admin con sesión de usuario: la unión de lo anterior; devolver y radicar van por el servidor
    ('admin','borrador','enviado',true), ('admin','rechazado','enviado',true), ('admin','enviado','revision',true),
    ('admin','enviado','rechazado',true), ('admin','revision','enviado',true), ('admin','enviado','aprobado',true), ('admin','revision','aprobado',true),
    ('admin','aprobado','borrador',false), ('admin','aprobado','enviado',false), ('admin','aprobado','radicado',false),
    ('admin','radicado','borrador',false), ('admin','enviado','borrador',false),
    -- los demás roles y la ausencia de rol no mueven periodos
    ('contratacion','enviado','aprobado',false), ('contratacion','borrador','enviado',false),
    ('alcalde','enviado','aprobado',false), ('funcionario','enviado','revision',false), ('hacienda','revision','aprobado',false),
    (null::text,'enviado','revision',false), (null::text,'borrador','enviado',false)
  ) as t(rol, de, a, esperado) loop
    perform pg_temp.chk(format('B  %s: %s → %s  %s', coalesce(r.rol, '(sin rol)'), r.de, r.a, case when r.esperado then 'permitido' else 'rechazado' end),
      public.periodos_transicion_permitida(r.rol, r.de::public.estado_periodo, r.a::public.estado_periodo) = r.esperado);
  end loop;

  -- ── C. Casos de fila ───────────────────────────────────────────────────────
  -- «después» = «antes» con los cambios encima (jsonb ||). vale = la función devuelve null.
  for r in select * from (values
    -- Lo que escribe cada función de la aplicación, con sus columnas exactas
    ('enviarPeriodo, desde borrador',                     'contratista', '{"estado":"borrador"}',                                   '{"estado":"enviado","fecha_envio":"2026-10-15T10:00:00Z","motivo_rechazo":null}', true),
    ('enviarPeriodo, tras una devolución',                'contratista', '{"estado":"rechazado","motivo_rechazo":"Falta la planilla"}', '{"estado":"enviado","fecha_envio":"2026-10-15T10:00:00Z","motivo_rechazo":null}', true),
    ('enviarPeriodo, el administrador',                   'admin',       '{"estado":"borrador"}',                                   '{"estado":"enviado","fecha_envio":"2026-10-15T10:00:00Z","motivo_rechazo":null}', true),
    ('aprobarComoAsesor',                                 'asesor',      '{"estado":"enviado"}',                                    '{"estado":"revision","motivo_rechazo":null}', true),
    ('rechazarComoAsesor',                                'asesor',      '{"estado":"enviado"}',                                    '{"estado":"rechazado","motivo_rechazo":"Corregir el informe"}', true),
    ('revocarPreaprobacion',                              'supervisor',  '{"estado":"revision"}',                                   '{"estado":"enviado"}', true),
    ('aprobarPeriodos, desde revisión',                   'supervisor',  '{"estado":"revision"}',                                   '{"estado":"aprobado","motivo_rechazo":null,"fecha_aprobacion":"2026-10-15T10:00:00Z"}', true),
    ('aprobarPeriodos, desde enviado',                    'supervisor',  '{"estado":"enviado"}',                                    '{"estado":"aprobado","motivo_rechazo":null,"fecha_aprobacion":"2026-10-15T10:00:00Z"}', true),
    ('rechazarPeriodos sobre un periodo en revisión',     'supervisor',  '{"estado":"revision"}',                                   '{"estado":"enviado","motivo_rechazo":"Revisar de nuevo"}', true),
    ('rechazarPeriodos sobre un periodo enviado',         'supervisor',  '{"estado":"enviado"}',                                    '{"estado":"enviado","motivo_rechazo":"Revisar de nuevo"}', true),
    ('devolverPeriodoAContratista',                       'supervisor',  '{"estado":"enviado"}',                                    '{"estado":"rechazado","motivo_rechazo":"Falta la certificación"}', true),
    ('revisarPlanilla, asesor, informe enviado',          'asesor',      '{"estado":"enviado","planilla_estado":"pendiente"}',     '{"planilla_estado":"aprobada","planilla_comentario":null}', true),
    ('revisarPlanilla, supervisor, informe aprobado',     'supervisor',  '{"estado":"aprobado","planilla_estado":"aprobada"}',     '{"planilla_estado":"rechazada","planilla_comentario":"No coincide el IBC"}', true),
    ('actualización sin cambios en un borrador',          'contratista', '{"estado":"borrador"}',                                   '{}', true),
    -- Lo que nadie debe poder hacer con una sesión de usuario
    ('el contratista se aprueba desde borrador',          'contratista', '{"estado":"borrador"}',                                   '{"estado":"aprobado","fecha_aprobacion":"2026-10-15T10:00:00Z"}', false),
    ('el contratista se aprueba desde enviado',           'contratista', '{"estado":"enviado"}',                                    '{"estado":"aprobado","fecha_aprobacion":"2026-10-15T10:00:00Z"}', false),
    ('el contratista retira lo enviado',                  'contratista', '{"estado":"enviado"}',                                    '{"estado":"borrador"}', false),
    ('el contratista toca un periodo radicado',           'contratista', '{"estado":"radicado"}',                                   '{"motivo_rechazo":"x"}', false),
    ('el supervisor toca un periodo radicado',            'supervisor',  '{"estado":"radicado"}',                                   '{"planilla_estado":"rechazada"}', false),
    ('el administrador con sesión toca un radicado',      'admin',       '{"estado":"radicado"}',                                   '{"estado":"enviado"}', false),
    ('radicar desde una sesión (lo hace el servidor)',    'supervisor',  '{"estado":"aprobado"}',                                   '{"estado":"radicado"}', false),
    ('deshacer una aprobación desde una sesión (BE-07)',  'supervisor',  '{"estado":"aprobado"}',                                   '{"estado":"enviado","motivo_rechazo":"x"}', false),
    ('un aprobado no cambia su motivo',                   'supervisor',  '{"estado":"aprobado"}',                                   '{"motivo_rechazo":"x"}', false),
    ('un aprobado no cambia su fecha de aprobación',      'supervisor',  '{"estado":"aprobado","fecha_aprobacion":"2026-10-01T10:00:00Z"}', '{"fecha_aprobacion":"2026-10-15T10:00:00Z"}', false),
    ('el contratista revisa la planilla de un aprobado',  'contratista', '{"estado":"aprobado","planilla_estado":"pendiente"}',    '{"planilla_estado":"aprobada"}', false),
    ('el contratista se aprueba la planilla en borrador', 'contratista', '{"estado":"borrador","planilla_estado":"pendiente"}',    '{"planilla_estado":"aprobada"}', false),
    ('el asesor revisa una planilla en borrador',         'asesor',      '{"estado":"borrador","planilla_estado":"pendiente"}',    '{"planilla_estado":"aprobada"}', false),
    ('el supervisor revisa una planilla en rechazado',    'supervisor',  '{"estado":"rechazado","planilla_estado":"pendiente"}',   '{"planilla_estado":"aprobada"}', false),
    ('fecha de aprobación sin aprobar',                   'contratista', '{"estado":"borrador"}',                                   '{"fecha_aprobacion":"2026-10-15T10:00:00Z"}', false),
    ('fecha de envío sin enviar',                         'supervisor',  '{"estado":"enviado"}',                                    '{"fecha_envio":"2026-10-15T10:00:00Z"}', false),
    ('sin rol (no hay fila en usuarios)',                 null,          '{"estado":"enviado"}',                                    '{"estado":"revision"}', false),
    ('contratacion no mueve periodos',                    'contratacion','{"estado":"enviado"}',                                    '{"estado":"aprobado"}', false)
  ) as t(descripcion, rol, antes, cambios, vale) loop
    motivo := public.periodos_cambio_no_permitido(r.rol, pg_temp.fila(r.antes::jsonb), pg_temp.fila(r.antes::jsonb || r.cambios::jsonb));
    perform pg_temp.chk(format('C  %s  [%s]%s', r.descripcion, coalesce(r.rol, '(sin rol)'),
                               case when motivo is null then '' else ' → «' || motivo || '»' end),
                        (motivo is null) = r.vale);
  end loop;

  -- ── D. Informativo: transiciones históricas que una sesión de usuario no podría hacer hoy ───────────
  select string_agg(format('       %s · %s → %s ×%s', rol, de, a, n), E'\n' order by rol, de, a) into informativo
  from (
    select coalesce(u.rol::text, '(sin usuario)') as rol, h.estado_anterior::text as de, h.estado_nuevo::text as a, count(*) as n
      from public.historial_periodos h left join public.usuarios u on u.id = h.usuario_id
     where h.estado_anterior is not null and h.estado_nuevo is not null and h.estado_anterior <> h.estado_nuevo
       and not public.periodos_transicion_permitida(coalesce(u.rol::text, ''), h.estado_anterior, h.estado_nuevo)
     group by 1, 2, 3
  ) t;

  select count(*), count(*) filter (where not ok) into total, fallas from res_065;
  raise exception using message = format(E'PERIODOS-065: %s comprobaciones, %s fallas\n%s\n\nD (informativo) transiciones del historial que una sesión no podría hacer hoy (las hace el servidor con service_role o son flujos antiguos):\n%s',
    total, fallas,
    (select string_agg(linea, E'\n' order by n) from res_065),
    coalesce(informativo, '       (ninguna)'));
end $$;

select 1/0;  -- red de seguridad: si el bloque de arriba terminara sin error, esto aborta la transacción
