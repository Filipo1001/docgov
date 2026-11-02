-- Migration 083: Contratista Digital — las cuentas que todavía tienen la contraseña inicial deben cambiarla
--
-- QUÉ HACE. Pone la marca `debe_cambiar_clave` en `auth.users.raw_app_meta_data` de cada cuenta activa cuya contraseña
-- sigue siendo la inicial (el número de cédula, ver lib/password-inicial.ts). La marca viaja en el token, el
-- middleware la lee y lleva a la persona a /cambiar-clave hasta que elija una propia (lib/clave-inicial.ts). La
-- aplicación la pone sola en las cuentas nuevas y cuando alguien de administración le fija una contraseña a otra persona;
-- esto cubre las que ya existían.
--
-- POR QUÉ. Auditoría del 2-nov-2026: 94 de 124 contratistas, 3 de 5 secretarios, el alcalde, contratación y 2 funcionarios
-- seguían con la cédula como contraseña, y cualquier sesión puede leer la cédula y el correo de todos (SEG-02). El
-- administrador ya la había cambiado.
--
-- QUÉ NO HACE. No cambia ninguna contraseña, no cierra ninguna sesión y no toca `public`. Las sesiones abiertas recogen la
-- marca cuando el token se renueva (en menos de una hora) y de ahí en adelante la persona pasa por /cambiar-clave.
--
-- IDEMPOTENTE: solo marca las cuentas que cumplen y todavía no tienen la marca; correrla otra vez no cambia nada. Una
-- cuenta que ya eligió su contraseña no coincide con la cédula y no se marca.
--
-- PARA REVERTIR: supabase/reversiones/083_clave_inicial_obligar_cambio.sql.

update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"debe_cambiar_clave": true}'::jsonb
  from public.usuarios p
 where p.id = u.id
   and p.activo
   and p.cedula ~ '\d'
   and coalesce((u.raw_app_meta_data ->> 'debe_cambiar_clave')::boolean, false) = false
   and (
     -- Como lo calcula lib/password-inicial.ts: solo dígitos, y relleno con ceros hasta 6.
     u.encrypted_password = extensions.crypt(
       case when length(regexp_replace(p.cedula, '\D', '', 'g')) >= 6
            then regexp_replace(p.cedula, '\D', '', 'g')
            else lpad(regexp_replace(p.cedula, '\D', '', 'g'), 6, '0') end,
       u.encrypted_password)
     -- La carga masiva usaba la cédula tal como venía escrita.
     or u.encrypted_password = extensions.crypt(trim(p.cedula), u.encrypted_password)
   );
