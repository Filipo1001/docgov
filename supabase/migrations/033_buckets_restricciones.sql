-- Migration 033: Restricciones a nivel de bucket (hallazgo de seguridad)
--
-- PROBLEMA
-- Los buckets `evidencias`, `documentos` y `certificaciones` tenían
-- allowed_mime_types = NULL y file_size_limit = NULL, es decir, ninguna
-- restricción de tipo ni de tamaño en el almacenamiento.
--
-- Eso importa por el patrón de subida: el archivo viaja del navegador DIRECTO
-- a Storage mediante una URL prefirmada, sin pasar por el servidor. La
-- validación que hace la aplicación al emitir esa URL no puede impedir que se
-- escriba contenido distinto del declarado. En la práctica, la validación de
-- tipo era cosmética: quien obtuviera una URL legítima podía subir cualquier
-- cosa, de cualquier tamaño.
--
-- El daño estaba contenido porque esos archivos solo se renderizan como
-- imágenes. Al habilitar adjuntos descargables, deja de estarlo.
--
-- SEGURIDAD DEL CAMBIO
-- Los tipos permitidos se derivaron de lo que hay REALMENTE almacenado en
-- producción más lo que el código puede emitir. El cliente normaliza siempre
-- el Content-Type antes del PUT (image/* con respaldo a image/jpeg, o
-- application/pdf fijo para planillas), así que ninguna subida legítima queda
-- fuera de la lista. Verificado contra los datos de producción:
--
--   evidencias      image/jpeg 3092 · image/webp 41 · image/heic 11 · image/png 6
--   documentos      application/pdf 302 · image/png 96 · image/jpeg 4
--   certificaciones application/pdf 12
--
-- El límite de tamaño (10 MB) coincide con FILE_UPLOAD.TAMANO_MAX_BYTES, que
-- ya se aplica en la aplicación; el mayor objeto existente pesa 3,3 MB.

-- Evidencias: solo imágenes. Se incluyen heif y jpg no estándar porque el
-- código los acepta (cámaras Samsung/Xiaomi y algunas versiones de iOS).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg', 'image/jpg', 'image/png',
      'image/webp', 'image/heic', 'image/heif'
    ],
    file_size_limit = 10485760      -- 10 MB
WHERE id = 'evidencias';

-- Documentos: planillas de seguridad social (PDF o foto) y firmas manuscritas (PNG).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp'
    ],
    file_size_limit = 10485760      -- 10 MB
WHERE id = 'documentos';

-- Certificaciones: generadas por el servidor, siempre PDF.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf'],
    file_size_limit = 5242880       -- 5 MB
WHERE id = 'certificaciones';
