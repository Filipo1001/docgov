-- ============================================================================
-- Vigilancia de la contraseña inicial: ninguna cuenta activa puede tener todavía la cédula como contraseña SIN la marca
-- `debe_cambiar_clave` (migración 083, lib/clave-inicial.ts).
--
-- SOLO LEE. No escribe nada y no inicia sesión con nadie: compara el hash guardado de cada cuenta con el de su cédula,
-- como lo haría un atacante con acceso de lectura, y cuenta. No devuelve nombres, cédulas ni correos.
--
-- Cómo se corre: pegarlo en el editor SQL de Supabase. Antes de aplicar la 083, la primera fila sale `FALLA`
-- (es lo esperado: es lo que la migración corrige). Después, y siempre que se cree una cuenta por un camino nuevo,
-- debe decir `ok`. La última fila resume: `N comprobaciones, 0 fallas`.
-- ============================================================================
with cuentas as (
  select p.rol,
         coalesce((u.raw_app_meta_data ->> 'debe_cambiar_clave')::boolean, false) as marcada,
         (   u.encrypted_password = extensions.crypt(
               case when length(regexp_replace(p.cedula, '\D', '', 'g')) >= 6
                    then regexp_replace(p.cedula, '\D', '', 'g')
                    else lpad(regexp_replace(p.cedula, '\D', '', 'g'), 6, '0') end,
               u.encrypted_password)
          or u.encrypted_password = extensions.crypt(trim(p.cedula), u.encrypted_password)) as clave_inicial
    from public.usuarios p
    join auth.users u on u.id = p.id
   where p.activo and p.cedula ~ '\d'
),
comprobaciones as (
  select 'ninguna cuenta activa con la clave inicial está sin marcar (' ||
         count(*) filter (where clave_inicial and not marcada) || ' sin marcar)' as comprobacion,
         count(*) filter (where clave_inicial and not marcada) = 0 as ok
    from cuentas
  union all
  -- Una cuenta marcada que ya cambió su contraseña es normal un rato (la marca se quita al cambiarla); si hay muchas,
  -- algo no la está quitando.
  select 'las marcadas que ya no tienen la clave inicial son pocas (' ||
         count(*) filter (where marcada and not clave_inicial) || ')',
         count(*) filter (where marcada and not clave_inicial) <= 5
    from cuentas
)
select comprobacion, case when ok then 'ok' else 'FALLA' end as resultado from comprobaciones
union all
select count(*) || ' comprobaciones, ' || count(*) filter (where not ok) || ' fallas', ''
  from comprobaciones;
