-- ============================================================================
-- Pruebas de DESHACER OPERACIONES del módulo Plan de Desarrollo (migración 067).
--
-- Qué comprueba, con operaciones REALES (las mismas funciones que usa la pantalla), contra los datos de la base:
--
--   · Para cada tipo de operación —asignar principal, asignar apoyo, quitar apoyo, asignar grupo, crear / editar /
--     eliminar un grupo, dar / cambiar / quitar un acceso— que después de deshacerla TODO queda exactamente como estaba
--     (una huella de las asignaciones, los grupos, los miembros y los accesos, antes y después).
--   · Que se deshace de la más nueva a la más vieja (desenrollar una pila), y que lo ya cambiado después lo impide.
--   · Que una operación ya deshecha no se deshace dos veces, y que deshacer la reversión («rehacer») la vuelve a aplicar.
--   · Que solo el administrador puede, que el motivo es obligatorio, y que una operación que no es de reparto no se toca.
--   · Que la lista de operaciones (`pdm_operaciones`) dice el estado correcto: se puede / bloqueada / deshecha.
--
-- Cómo se corre: pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de la sesión). NO DEJA NADA
-- ESCRITO, ni en producción: todo pasa dentro de un bloque que termina con un error a propósito, y Postgres deshace la
-- transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PDM-DESHACER: N comprobaciones, 0 fallas» y la lista.
-- La última línea (1/0) es una red de seguridad por si el bloque terminara sin error.
--
-- No lleva identificadores de personas: elige del propio contenido de la base a un administrador, dos indicadores de la
-- misma secretaría con responsable y cuatro personas activas sin acceso ni asignaciones.
-- ============================================================================

create temp table res (descr text, ok boolean) on commit drop;

create or replace function pg_temp.chequear(p_descr text, p_ok boolean) returns void
language sql as $f$ insert into res values (p_descr, coalesce(p_ok, false)) $f$;

-- Ejecuta una instrucción COMO esa persona (con la sesión que tendría desde la aplicación) y devuelve su resultado.
create or replace function pg_temp.como(p_uid uuid, p_sql text) returns jsonb
language plpgsql as $f$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into r;
  exception when others then
    execute 'reset role';
    raise;
  end;
  execute 'reset role';
  return r;
end $f$;

-- Lo que dice una instrucción que debe FALLAR: el código de error y el mensaje, o null si no falló.
create or replace function pg_temp.fallo_de(p_uid uuid, p_sql text) returns text
language plpgsql as $f$
begin
  perform pg_temp.como(p_uid, p_sql);
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $f$;

-- Una huella de TODO lo que deshacer puede tocar: si dos huellas son iguales, el estado es el mismo.
create or replace function pg_temp.foto() returns text
language sql as $f$
  select md5(
    coalesce((select string_agg(indicador_id::text || '|' || usuario_id::text || '|' || principal::text || '|' || coalesce(grupo_id::text, ''), ';' order by indicador_id, usuario_id) from public.pdm_asignaciones), '') || '#' ||
    coalesce((select string_agg(id::text || '|' || nombre || '|' || dependencia_id::text || '|' || coalesce(descripcion, ''), ';' order by id) from public.pdm_grupos), '') || '#' ||
    coalesce((select string_agg(grupo_id::text || '|' || usuario_id::text || '|' || es_lider::text, ';' order by grupo_id, usuario_id) from public.pdm_grupo_miembros), '') || '#' ||
    coalesce((select string_agg(usuario_id::text || '|' || nivel, ';' order by usuario_id) from public.pdm_permisos), ''))
$f$;

-- El lote de la última operación hecha por esas funciones que no devuelven el lote (las de grupos).
create or replace function pg_temp.ultimo_lote() returns uuid
language sql as $f$
  select (detalle->>'lote')::uuid from public.pdm_historial
  where detalle ? 'lote' and accion not like 'lote\_%' order by id desc limit 1
$f$;

do $$
declare
  v_admin uuid; v_i1 uuid; v_i2 uuid; v_dep uuid;
  v_p uuid[]; v_a uuid; v_b uuid; v_c uuid; v_d uuid;
  v_f0 text; v_f1 text; v_f2 text; v_f3 text;
  v_r jsonb; v_lote uuid; v_lote2 uuid; v_lote3 uuid; v_ur jsonb;
  v_g uuid; v_msg text; v_n int; v_estado text;
  v_mot constant text := 'Prueba automática de deshacer';
  v_resultado text; v_fallas int; v_total int;
begin
  -- ── Quiénes y sobre qué ─────────────────────────────────────────────────
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by created_at limit 1;
  if v_admin is null then raise exception 'PDM-DESHACER: no hay un administrador activo para probar'; end if;

  select i.id, i.dependencia_id into v_i1, v_dep
  from public.pdm_indicadores i
  where exists (select 1 from public.pdm_asignaciones a where a.indicador_id = i.id and a.principal)
  order by i.id limit 1;
  select i.id into v_i2
  from public.pdm_indicadores i
  where i.dependencia_id = v_dep and i.id <> v_i1
    and exists (select 1 from public.pdm_asignaciones a where a.indicador_id = i.id and a.principal)
  order by i.id limit 1;
  if v_i1 is null or v_i2 is null then raise exception 'PDM-DESHACER: faltan dos indicadores de una misma secretaría con responsable'; end if;

  select array_agg(id) into v_p from (
    select u.id from public.usuarios u
    where u.activo and u.rol::text <> 'admin'
      and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
      and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
      and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    order by u.id limit 4) q;
  if v_p is null or cardinality(v_p) < 4 then raise exception 'PDM-DESHACER: faltan cuatro personas activas sin acceso ni asignaciones'; end if;
  v_a := v_p[1]; v_b := v_p[2]; v_c := v_p[3]; v_d := v_p[4];

  v_f0 := pg_temp.foto();

  -- ── 1. Asignar como principal ───────────────────────────────────────────
  v_r := pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, true, ''apoyo'', %L)', v_i1, v_a, v_mot));
  v_lote := (v_r->>'lote')::uuid;
  perform pg_temp.chequear('asignar principal cambia el estado', pg_temp.foto() <> v_f0);
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('deshacer «asignar principal» deja todo como estaba', pg_temp.foto() = v_f0);

  -- ── 2. Asignar principal quitando al anterior ───────────────────────────
  v_r := pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, true, ''quitar'', %L)', v_i1, v_a, v_mot));
  v_lote := (v_r->>'lote')::uuid;
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('deshacer «asignar principal quitando al anterior» devuelve al principal anterior', pg_temp.foto() = v_f0);

  -- ── 3. Asignar como apoyo ───────────────────────────────────────────────
  v_r := pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L, %L]::uuid[], %L::uuid, false, ''apoyo'', %L)', v_i1, v_i2, v_b, v_mot));
  v_lote := (v_r->>'lote')::uuid;
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('deshacer «asignar apoyo en dos indicadores» deja todo como estaba', pg_temp.foto() = v_f0);

  -- ── 4. Desenrollar una pila: asignar apoyo (A), quitarlo (B); se deshace B y luego A ──
  v_r := pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, false, ''apoyo'', %L)', v_i1, v_b, v_mot));
  v_lote := (v_r->>'lote')::uuid;              -- A
  v_f1 := pg_temp.foto();                      -- con el apoyo
  v_r := pg_temp.como(v_admin, format('select public.pdm_quitar(array[%L]::uuid[], %L::uuid, %L)', v_i1, v_b, v_mot));
  v_lote2 := (v_r->>'lote')::uuid;             -- B
  perform pg_temp.chequear('quitar un apoyo cambia el estado', pg_temp.foto() <> v_f1);
  v_f3 := pg_temp.foto();
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('no se deshace A mientras B (más nueva, sobre lo mismo) sigue en pie', v_msg like '23514%volvió a cambiar%');
  perform pg_temp.chequear('el intento fallido no cambió nada', pg_temp.foto() = v_f3);
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote2, v_mot));
  perform pg_temp.chequear('deshacer B («quitar apoyo») devuelve el apoyo', pg_temp.foto() = v_f1);
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('después de deshacer B, se puede deshacer A: todo como al principio', pg_temp.foto() = v_f0);

  -- ── 5. Ya deshecha / rehacer ────────────────────────────────────────────
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('una operación ya deshecha no se deshace dos veces', v_msg like '23514%ya se deshizo%');
  v_lote3 := pg_temp.ultimo_lote();            -- la reversión de A
  v_ur := pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote3, v_mot));
  perform pg_temp.chequear('deshacer la reversión («rehacer») vuelve a aplicar la operación', pg_temp.foto() = v_f1);
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', (v_ur->>'lote')::uuid, v_mot));
  perform pg_temp.chequear('y se puede volver a deshacer la rehecha', pg_temp.foto() = v_f0);

  -- ── 6. Crear un grupo ───────────────────────────────────────────────────
  v_f1 := pg_temp.foto();
  perform pg_temp.como(v_admin, format('select to_jsonb(public.pdm_grupo_guardar(null, %L, %L::uuid, %L::uuid, array[%L, %L]::uuid[], %L, %L))',
    'Grupo de prueba deshacer', v_dep, v_a, v_a, v_b, v_mot, 'Descripción de prueba'));
  v_lote := pg_temp.ultimo_lote();
  select id into v_g from public.pdm_grupos where nombre = 'Grupo de prueba deshacer';
  perform pg_temp.chequear('crear un grupo lo crea con sus miembros', v_g is not null and (select count(*) from public.pdm_grupo_miembros where grupo_id = v_g) = 2);
  v_f2 := pg_temp.foto();
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('deshacer «crear un grupo» lo quita con sus miembros', pg_temp.foto() = v_f1 and not exists (select 1 from public.pdm_grupos where nombre = 'Grupo de prueba deshacer'));
  -- Y rehacer lo vuelve a crear idéntico.
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', pg_temp.ultimo_lote(), v_mot));
  perform pg_temp.chequear('rehacer «crear un grupo» lo devuelve igual (mismo id, mismos miembros)', pg_temp.foto() = v_f2);

  -- ── 7. Editar el grupo (nombre, miembros, líder) ─────────────────────────
  perform pg_temp.como(v_admin, format('select to_jsonb(public.pdm_grupo_guardar(%L::uuid, %L, %L::uuid, %L::uuid, array[%L, %L]::uuid[], %L, %L))',
    v_g, 'Grupo de prueba deshacer 2', v_dep, v_b, v_b, v_c, v_mot, 'Otra descripción'));
  v_lote := pg_temp.ultimo_lote();
  perform pg_temp.chequear('editar el grupo cambia nombre, miembros y líder', pg_temp.foto() <> v_f2);
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('deshacer «editar un grupo» lo deja exactamente como estaba', pg_temp.foto() = v_f2);

  -- ── 8. Asignar el grupo a un indicador ──────────────────────────────────
  v_r := pg_temp.como(v_admin, format('select public.pdm_asignar_grupo(array[%L]::uuid[], %L::uuid, ''apoyo'', %L)', v_i1, v_g, v_mot));
  v_lote := (v_r->>'lote')::uuid;
  v_f3 := pg_temp.foto();
  perform pg_temp.chequear('asignar el grupo cambia las asignaciones', v_f3 <> v_f2);
  -- Con el grupo ya usado, no se puede deshacer su creación (Y tampoco la de sus miembros).
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', (select (detalle->>'lote')::uuid from public.pdm_historial where accion = 'grupo_creado' and entidad_id = v_g order by id limit 1), v_mot));
  perform pg_temp.chequear('no se deshace la creación de un grupo que ya se usó después', v_msg like '23514%');
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('deshacer «asignar un grupo» deja todo como estaba', pg_temp.foto() = v_f2);

  -- ── 9. Eliminar un grupo que tiene asignaciones ─────────────────────────
  perform pg_temp.como(v_admin, format('select public.pdm_asignar_grupo(array[%L]::uuid[], %L::uuid, ''apoyo'', %L)', v_i1, v_g, v_mot));
  v_f3 := pg_temp.foto();
  perform pg_temp.como(v_admin, format('select public.pdm_grupo_eliminar(%L::uuid, %L)', v_g, v_mot));
  v_lote := pg_temp.ultimo_lote();
  perform pg_temp.chequear('eliminar el grupo lo quita y deja sus asignaciones como individuales', not exists (select 1 from public.pdm_grupos where id = v_g) and pg_temp.foto() <> v_f3);
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('deshacer «eliminar un grupo» devuelve el grupo, sus miembros y sus asignaciones', pg_temp.foto() = v_f3);

  -- ── 10. Accesos ─────────────────────────────────────────────────────────
  v_f1 := pg_temp.foto();
  v_r := pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''consulta'', %L)', v_c, v_mot));
  v_lote := (v_r->>'lote')::uuid;
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('deshacer «dar un acceso» lo quita', pg_temp.foto() = v_f1);

  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''consulta'', %L)', v_c, v_mot));
  v_f2 := pg_temp.foto();
  v_r := pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_c, v_mot));
  v_lote := (v_r->>'lote')::uuid;
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('deshacer «cambiar el nivel de un acceso» devuelve el nivel anterior', pg_temp.foto() = v_f2);

  v_r := pg_temp.como(v_admin, format('select public.pdm_deshabilitar(%L::uuid, %L)', v_c, v_mot));
  v_lote := (v_r->>'lote')::uuid;
  perform pg_temp.chequear('quitar el acceso lo quita', pg_temp.foto() <> v_f2);
  perform pg_temp.como(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('deshacer «quitar un acceso» lo devuelve con su nivel', pg_temp.foto() = v_f2);

  -- ── 11. Quién y con qué motivo ──────────────────────────────────────────
  -- Quien no es administrador (aquí, una sesión de alguien que ni existe en el sistema: no es admin de ninguna manera).
  v_msg := pg_temp.fallo_de(gen_random_uuid(), format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, v_mot));
  perform pg_temp.chequear('quien no es administrador no puede deshacer', v_msg like '42501%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', v_lote, 'corto'));
  perform pg_temp.chequear('sin motivo de al menos 10 caracteres no se deshace', v_msg like '22023%motivo%' or v_msg like '22023%explica%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_deshacer(%L::uuid, null)', v_lote));
  perform pg_temp.chequear('sin motivo no se deshace', v_msg like '22023%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_deshacer(%L::uuid, %L)', gen_random_uuid(), v_mot));
  perform pg_temp.chequear('una operación que no existe se rechaza con una frase clara', v_msg like '23514%No hay nada que deshacer%');
  v_msg := pg_temp.fallo_de(gen_random_uuid(), 'select to_jsonb(count(*)) from public.pdm_operaciones()');
  perform pg_temp.chequear('quien no es administrador no ve la lista de operaciones', v_msg like '42501%');

  -- ── 12. La lista de operaciones ─────────────────────────────────────────
  v_n := (pg_temp.como(v_admin, 'select to_jsonb(count(*)) from public.pdm_operaciones(100)'))::text::int;
  perform pg_temp.chequear('la lista trae operaciones', v_n > 0);
  v_estado := (pg_temp.como(v_admin, format('select to_jsonb(estado) from public.pdm_operaciones(100) where lote = %L::uuid', v_lote)))#>>'{}';
  perform pg_temp.chequear('«quitar un acceso», ya deshecha, figura como «deshecha»', v_estado = 'deshecha');
  v_estado := (pg_temp.como(v_admin, format('select to_jsonb(estado) from public.pdm_operaciones(100) where lote = %L::uuid', pg_temp.ultimo_lote())))#>>'{}';
  perform pg_temp.chequear('su reversión, la más reciente, figura como «se puede» (para rehacer)', v_estado = 'se_puede');
  v_estado := (pg_temp.como(v_admin, format('select to_jsonb(estado) from public.pdm_operaciones(100) where lote = %L::uuid', v_lote2)))#>>'{}';
  perform pg_temp.chequear('una operación vieja cuyo sujeto volvió a cambiar figura como «bloqueada» o «deshecha», nunca «se puede»', v_estado in ('bloqueada', 'deshecha'));

  -- ── Resultado ───────────────────────────────────────────────────────────
  select count(*) filter (where not ok), count(*) into v_fallas, v_total from res;
  select format('PDM-DESHACER: %s comprobaciones, %s fallas', v_total, v_fallas)
         || coalesce(E'\n' || (select string_agg(case when ok then '  ok     ' else '  FALLA  ' end || descr, E'\n') from res), '')
    into v_resultado;
  raise exception '%', v_resultado;
end $$;

select 1/0;   -- red de seguridad: si el bloque terminara sin error, esto lo hace fallar y deshace todo
