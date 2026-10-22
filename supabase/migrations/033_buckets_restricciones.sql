-- Migration 033: Restricciones a nivel de bucket (hallazgo de seguridad)
--
-- ESTADO: APLICADA en producción el 21-oct-2026 (hora de Colombia), por orden de Felipe: versión 20261022020736, nombre
-- `buckets_restricciones`, con las sentencias de este archivo. Hasta entonces NUNCA se había aplicado: estuvo en el repositorio desde la
-- entrega de los adjuntos PDF, pero los tres espacios seguían sin tope ni lista de tipos (comprobado el 20-oct-2026: `file_size_limit` y
-- `allowed_mime_types` en NULL). Verificada después con supabase/tests/buckets_restricciones.sql (23 comprobaciones, 0 fallas) y con
-- subidas reales de prueba (tres rechazadas, una aceptada).
-- Se reescribió el 20-oct-2026 porque sus números eran de entonces y el código ya no los respeta: ver «QUÉ CAMBIÓ» más abajo.
--
-- PROBLEMA
-- Los buckets `evidencias`, `documentos` y `certificaciones` tenían (hasta el 21-oct-2026) allowed_mime_types = NULL y file_size_limit = NULL, es decir,
-- ninguna restricción de tipo ni de tamaño en el almacenamiento.
--
-- Eso importa por el patrón de subida: el archivo viaja del navegador DIRECTO a Storage mediante una URL prefirmada, sin pasar por
-- el servidor. La validación que hace la aplicación al emitir esa URL no puede impedir que se escriba contenido distinto del
-- declarado. En la práctica, la validación de tipo y de tamaño es cosmética: quien obtenga una URL legítima puede subir cualquier
-- cosa, de cualquier tamaño (hoy, hasta el límite global del almacenamiento: 100 MB desde el 20-oct-2026, antes 50 MB).
--
-- El daño está contenido porque esos archivos solo se renderizan como imágenes o se descargan como PDF desde la aplicación. Esta
-- migración cierra la puerta en el origen.
--
-- QUÉ CAMBIÓ RESPECTO DEL BORRADOR ORIGINAL (verificado contra el código y los datos el 20-oct-2026)
--
--   · `documentos`: el tope pasa de 10 a 15 MB. Desde el borrador original se añadió la FACTURA ELECTRÓNICA, que se sube a este
--     espacio con un tope propio de 15 MB (`FACTURA_MAX_BYTES`, lib/factura-electronica.ts): con 10 MB, una factura de entre 10 y
--     15 MB que la aplicación acepta habría fallado en el almacenamiento. También se añadió el SOPORTE DE PAGO (PDF, 10 MB).
--   · `documentos`: se quita `image/jpg` (el código no lo emite: las firmas llevan el tipo del archivo, que es jpeg, png o webp, y
--     lo demás son PDF con tipo fijo). Las planillas ya son solo PDF; las 4 fotos de planilla que existen son anteriores y siguen
--     ahí: el tope y la lista rigen para lo que se SUBA, no tocan lo ya guardado.
--   · `evidencias` y `certificaciones` quedan como estaban en el borrador.
--
-- LO QUE VIAJA A CADA ESPACIO Y POR QUÉ CABE (cada cifra sale del código; la prueba tests/cd/buckets-restricciones.test.ts vigila
-- que sigan cabiendo si alguien cambia un tope de la aplicación sin cambiar el del espacio)
--
--   evidencias       fotos de las actividades del informe (app/actions/evidencias.ts). Tipos: FILE_UPLOAD.TIPOS_IMAGEN. Tope de la
--                    aplicación: 10 MB (FILE_UPLOAD.TAMANO_MAX_BYTES). El cliente manda `image/*` o, si el navegador no declara
--                    tipo, `image/jpeg`: por eso ninguna subida legítima queda fuera.
--   documentos       planilla de seguridad social y su soporte de pago (PDF, 10 MB), factura electrónica (PDF, 15 MB), firma de
--                    cada persona y firma del alcalde (JPG, PNG o WEBP; Next.js limita esas acciones a 10 MB: next.config.ts).
--   certificaciones  certificados de retención generados por el servidor (siempre PDF; el mayor mide 111 KB).
--
-- DATOS REALES CONTRA LOS QUE SE COMPROBÓ (20-oct-2026): nada de lo guardado excede su tope ni su lista.
--
--   evidencias      7006 objetos · jpeg 6948, png 6, webp 41, heic 11 · el mayor: 3,4 MB
--   documentos       898 objetos · pdf 696 (facturas 16, planillas 677, soportes 3), png 198 (firmas), jpeg 4 · el mayor: 7,7 MB
--   certificaciones   58 objetos · pdf 58 · el mayor: 111 KB
--
-- NADA SE TOCA DE LO YA GUARDADO: Storage aplica estas restricciones a las subidas nuevas; los objetos existentes se siguen
-- leyendo igual. Los espacios `pdm-evidencias`, `adjuntos`, `pdf-cache`, `actas-terminacion` y `avatars` ya tienen las suyas.
--
-- NOTA SOBRE EL LÍMITE GLOBAL: Supabase exige que el límite global sea MAYOR O IGUAL que el de cada espacio. Estos topes (5, 10 y
-- 15 MB) están muy por debajo del global actual (100 MB), así que no interfieren con ese ajuste.

begin;

-- Evidencias: solo imágenes. Se incluyen heif y jpg no estándar porque el código los acepta (cámaras Samsung/Xiaomi y algunas
-- versiones de iOS).
update storage.buckets
set allowed_mime_types = array[
      'image/jpeg', 'image/jpg', 'image/png',
      'image/webp', 'image/heic', 'image/heif'
    ],
    file_size_limit = 10485760      -- 10 MB
where id = 'evidencias';

-- Documentos: PDF (planillas, soportes de pago, facturas) y firmas manuscritas escaneadas (JPG, PNG o WEBP).
update storage.buckets
set allowed_mime_types = array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp'
    ],
    file_size_limit = 15728640      -- 15 MB: el tope de la factura electrónica
where id = 'documentos';

-- Certificaciones: generadas por el servidor, siempre PDF.
update storage.buckets
set allowed_mime_types = array['application/pdf'],
    file_size_limit = 5242880       -- 5 MB
where id = 'certificaciones';

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_mb constant bigint := 1048576;
begin
  if (select count(*) from storage.buckets where id in ('evidencias', 'documentos', 'certificaciones')) <> 3 then
    raise exception 'Migración 033: falta alguno de los tres espacios de archivos';
  end if;

  if not exists (select 1 from storage.buckets where id = 'evidencias' and not public and file_size_limit = 10 * v_mb
                   and allowed_mime_types @> array['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
                   and array_length(allowed_mime_types, 1) = 6) then
    raise exception 'Migración 033: evidencias no quedó privado, de 10 MB y con sus 6 tipos de imagen';
  end if;
  if not exists (select 1 from storage.buckets where id = 'documentos' and not public and file_size_limit = 15 * v_mb
                   and allowed_mime_types @> array['application/pdf','image/jpeg','image/png','image/webp']
                   and array_length(allowed_mime_types, 1) = 4) then
    raise exception 'Migración 033: documentos no quedó privado, de 15 MB y con PDF más 3 tipos de imagen';
  end if;
  if not exists (select 1 from storage.buckets where id = 'certificaciones' and not public and file_size_limit = 5 * v_mb
                   and allowed_mime_types = array['application/pdf']) then
    raise exception 'Migración 033: certificaciones no quedó privado, de 5 MB y solo PDF';
  end if;

  -- Lo ya guardado cabe en su espacio: si no, quien lo descargue o lo reemplace chocaría con un tope que no conocía.
  if exists (select 1 from storage.objects o join storage.buckets b on b.id = o.bucket_id
              where b.id in ('evidencias', 'documentos', 'certificaciones')
                and (o.metadata->>'size')::bigint > b.file_size_limit) then
    raise exception 'Migración 033: hay objetos que superan el tope de su espacio';
  end if;
  if exists (select 1 from storage.objects o join storage.buckets b on b.id = o.bucket_id
              where b.id in ('evidencias', 'documentos', 'certificaciones')
                and coalesce(o.metadata->>'mimetype', '') <> all (b.allowed_mime_types)) then
    raise exception 'Migración 033: hay objetos de un tipo que su espacio no admite';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/033_buckets_restricciones.sql (los tres espacios vuelven a no tener tope ni lista
-- de tipos, que es como estaban).
