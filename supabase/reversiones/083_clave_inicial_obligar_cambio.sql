-- Reversión de la migración 083: quita la marca `debe_cambiar_clave` de TODAS las cuentas.
-- Ojo: también quita la de las cuentas que la aplicación marcó después por su cuenta (cuentas nuevas, contraseñas fijadas
-- por administración). Si solo se quiere dejar de exigir el cambio, basta quitar la comprobación del middleware.
update auth.users
   set raw_app_meta_data = raw_app_meta_data - 'debe_cambiar_clave'
 where jsonb_exists(raw_app_meta_data, 'debe_cambiar_clave');
