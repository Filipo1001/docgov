-- Migration 048: el expediente del contrato pasa a tener un tipo, no seis
--
-- POR QUÉ. Había seis casillas fijas —contrato firmado, CDP, RP, RUT,
-- certificación bancaria, póliza— y una libre («otro»). De los 42 documentos
-- adjuntos que hay en producción, NINGUNO se subió en una de las seis: los 42
-- están en «otro», y ningún contrato tiene más de uno.
--
-- La razón es que la alcaldía no escanea los soportes por separado. Escanea el
-- expediente de legalización completo y sube un solo PDF: mediana de 104
-- páginas y 6,8 MB, con nombres como «CONTRATO 205.pdf» o «173-206.pdf». Las
-- seis casillas describían un trámite que nadie sigue, y la pantalla ponía un
-- «0 de 6» permanente encima de lo único que sí existía.
--
-- QUÉ HACE ESTA MIGRACIÓN. Reetiqueta esos adjuntos de `otro` a `contrato`,
-- que es lo que son. El tipo importa ahora porque el contrato VIAJA: entra en
-- el paquete de SECOP de la primera cuenta de cobro, y para eso el código
-- tiene que poder señalar cuál de los archivos es.
--
-- POR QUÉ SOLO LOS QUE ESTÁN SOLOS. Se reetiqueta únicamente el adjunto de un
-- contrato que no tiene ningún otro. Hoy eso son los 42 —ninguno tiene
-- compañía— pero la condición se deja escrita: si alguien subió dos archivos
-- entre que esto se escribe y se aplica, adivinar cuál de ellos es el contrato
-- sería inventar. Esos quedan en `otro` y se reclasifican a mano.
--
-- `tipo_documento` es texto libre y nullable, sin CHECK ni enum: la validación
-- vive en la aplicación (`TIPOS_DOCUMENTO_IDS`). No hay constraint que tocar.
--
-- REGLA 2 de CLAUDE.md: no aplica. Esto no añade una columna, y
-- `documentos_adjuntos` no tiene permisos por columna — el único
-- `REVOKE SELECT ON public.<tabla>` del historial es el de la 027 sobre
-- `usuarios`.

update public.documentos_adjuntos d
   set tipo_documento = 'contrato'
 where d.entidad_tipo   = 'contrato'
   and d.tipo_documento = 'otro'
   and d.eliminado_at is null
   and not exists (
         select 1 from public.documentos_adjuntos otro
          where otro.entidad_tipo = 'contrato'
            and otro.entidad_id   = d.entidad_id
            and otro.eliminado_at is null
            and otro.id <> d.id
       );

comment on column public.documentos_adjuntos.tipo_documento is
  'Para adjuntos de contrato: «contrato» (el expediente de legalización, que '
  'viaja en el paquete de SECOP de la primera cuenta de cobro) u «otro» '
  '(otrosíes, conceptos jurídicos, cualquier soporte que solo se archiva). '
  'Ver lib/documentos-contrato.ts para la regla de cuándo añadir un tipo.';
