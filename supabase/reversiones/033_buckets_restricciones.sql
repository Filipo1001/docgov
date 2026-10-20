-- REVERSIÓN de la migración 033 (topes y lista de tipos de los espacios `evidencias`, `documentos` y `certificaciones`).
-- NO forma parte de la cadena de migraciones: se pega a mano.
-- Devuelve los tres espacios a como estaban antes: sin tope de tamaño propio y sin lista de tipos. Desde entonces rige solo el límite
-- GLOBAL del almacenamiento (panel de Supabase), que hoy es de 100 MB.
-- No toca ningún objeto: las subidas posteriores a la 033 se quedan donde están.

begin;

update storage.buckets
set allowed_mime_types = null,
    file_size_limit = null
where id in ('evidencias', 'documentos', 'certificaciones');

commit;
