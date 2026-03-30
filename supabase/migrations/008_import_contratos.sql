-- =============================================================
-- DocGov — Import 112 contracts from Excel (vigencia 2026)
-- Migration: 008_import_contratos.sql
--
-- PREREQUISITES (run first if not done):
--   1. Migrations 001–007 applied
--   2. Dependencias populated (run STEP 1 below)
--   3. Supervisor user accounts exist in auth.users + usuarios
--      (migrations 004 inserted them as contratistas_importados —
--       they must be activated with rol='supervisor' first)
--
-- EXECUTION ORDER:
--   STEP 1: Ensure dependencias
--   STEP 2: Diagnostic — see contractor account coverage
--   STEP 3: Insert contracts (skips contractors without accounts)
--   STEP 4: Verify results
--
-- IDEMPOTENT: Safe to run multiple times (ON CONFLICT DO NOTHING).
-- Re-run after activating more contractor accounts to pick up skipped ones.
-- =============================================================

-- ── STEP 1: Ensure all dependencias exist ────────────────────
INSERT INTO public.dependencias (nombre)
VALUES
  ('Secretaria General y de Gobierno'),
  ('Secretaria de Hacienda'),
  ('Secretaria de Bienestar Social'),
  ('Secretaria de Desarrollo Territorial'),
  ('Comisaria de Familia')
ON CONFLICT (nombre) DO NOTHING;


-- ── STEP 2: Diagnostic — contract coverage check ─────────────
-- Run this SELECT before Step 3 to see how many contracts will insert.
-- Contracts where contratista_activado=FALSE will be SKIPPED.
-- Activate those accounts first, then re-run Step 3.
SELECT
  d.numero      AS contrato,
  d.cedula,
  ci.nombre_completo,
  ci.activado   AS contratista_activado,
  ci.usuario_id IS NOT NULL AS tiene_cuenta,
  d.dependencia,
  d.supervisor,
  sup.id IS NOT NULL AS supervisor_existe
FROM (VALUES
  ('002-2026','1037634680','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('003-2026','8465567','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('004-2026','21982267','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('005-2026','1041146919','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('007-2026','1041146358','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('008-2026','1041147758','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('009-2026','1020472944','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('010-2026','8466043','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('011-2026','1001371404','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('012-2026','1128396512','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('013-2026','1041150650','Secretaria de Hacienda','Ivan Montoya Murillo'),
  ('014-2026','32205180','Secretaria de Hacienda','Ivan Montoya Murillo'),
  ('015-2026','43414846','Secretaria de Hacienda','Ivan Montoya Murillo'),
  ('017-2026','70784232','Secretaria de Hacienda','Ivan Montoya Murillo'),
  ('018-2026','42730628','Secretaria de Hacienda','Ivan Montoya Murillo'),
  ('019-2026','1000766011','Secretaria de Hacienda','Ivan Montoya Murillo'),
  ('020-2026','8430584','Secretaria de Hacienda','Ivan Montoya Murillo'),
  ('021-2026','1017276694','Secretaria de Hacienda','Ivan Montoya Murillo'),
  ('024-2026','43806393','Comisaria de Familia','Biviana Inmaculada Hoyos Mondragon'),
  ('025-2026','1037640364','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('026-2026','1007633889','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('027-2026','32160770','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('028-2026','21737896','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('029-2026','1152434726','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('030-2026','1152434294','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('031-2026','1041151216','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('032-2026','1033343280','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('033-2026','21792489','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('034-2026','1152203945','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('035-2026','1032257037','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('036-2026','70082275','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('037-2026','8464867','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('038-2026','1041150322','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('039-2026','98710816','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('040-2026','98710816','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('041-2026','1038360521','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('042-2026','1041146425','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('043-2026','1041149852','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('044-2026','70230420','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('045-2026','1000940222','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('046-2026','1041150263','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('047-2026','8460397','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('048-2026','1007496848','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('049-2026','1007681134','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('050-2026','1001359851','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('051-2026','8464986','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('052-2026','1026152027','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('053-2026','1041146117','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('054-2026','1046669032','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('055-2026','32160490','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('056-2026','1015332771','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('057-2026','32160996','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('058-2026','1041146326','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('059-2026','1007347664','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('064-2026','1041149202','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('065-2026','1041149023','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('066-2026','3455047','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('067-2026','32161152','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('068-2026','42732594','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('069-2026','1041150069','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('070-2026','1152200195','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('071-2026','8464638','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('073-2026','8465244','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('074-2026','8462873','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('075-2026','8463936','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('076-2026','1041148101','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('077-2026','1007284916','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('078-2026','32161150','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('079-2026','1007496531','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('082-2026','32160617','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('083-3036','8465629','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('084-2026','1033342249','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('085-2026','1007496693','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('086-2026','1041148995','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('087-2026','8466487','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('088-2026','1000086463','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('089-2026','1045112814','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('090-2026','1041148232','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('092-2026','8460907','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('093-2026','1007310617','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('094-2026','8465684','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('095-2026','1001237715','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('096-2026','21738072','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('097-2026','21739967','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('098-2026','8466565','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('099-2026','8459552','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('100-2026','901348545','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('101-2026','32161081','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('102-2026','1041151342','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('103-2026','900873352','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('104-2026','1000918837','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('105-2026','1041148191','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('106-2026','1041146853','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('107-2026','1041151419','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('108-2026','8461709','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('109-2026','8464881','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('110-2026','32160559','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('130-2026','1007496731','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('131-2026','21739806','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('132-2026','8462155','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('133-2026','1041148811','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('134-2026','22052441','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('135-2026','8462103','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('136-2026','43413568','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('137-2026','1041148253','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('138-2026','1041147348','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('139-2026','42821811','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('140-2026','1026134149','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('141-2026','1017184227','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno'),
  ('142-2026','43508671','Secretaria General y de Gobierno','Sara Sanchez Velez'),
  ('143-2026','1000903280','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa'),
  ('145-2026','32160572','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno')
) AS d(numero, cedula, dependencia, supervisor)
LEFT JOIN public.contratistas_importados ci ON ci.cedula = d.cedula
LEFT JOIN public.usuarios sup ON unaccent(lower(trim(sup.nombre_completo))) = unaccent(lower(trim(d.supervisor)))
  AND sup.rol = 'supervisor'
ORDER BY ci.activado NULLS LAST, d.numero;


-- ── STEP 3: Insert contracts ──────────────────────────────────
-- Requires pg_trgm + unaccent extensions (enabled in Supabase by default).
-- Contracts without an activated contratista account are SILENTLY SKIPPED.
-- Re-run after activating contractor accounts.
WITH source_data (numero, cedula, objeto, modalidad, dependencia, supervisor, valor_total, valor_mensual, fecha_inicio, fecha_fin, cdp, crp) AS (
  VALUES
  ('002-2026','2026','PRESTAR LOS SERVICIOS PROFESIONALES PARA LA ESTRUCTURACIÓN, DESARROLLO TECNICO Y METODOLOGICO DE LOS PROCESOS DE CONTRATACIÓN EN LA FASE PRECONTRACTUAL, CONTRACTUAL Y TERMINACIÓN EN LA VIGENCIA 2026','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1037634680',49600000::bigint,6200000::bigint,'2026-01-14'::date,'2026-08-31'::date,'1','1'),
  ('003-2026','2026','PRESTAR LOS SERVICIOS PROFESIONALES COMO ADMINISTRADOR PÚBLICO PARA APOYAR LA GESTIÓN ADMINISTRATIVA EN EL ACOMPAÑAMIENTO TÉCNICO, LA PLANEACIÓN, EJECUCIÓN, SEGUIMIENTO Y EVALUACIÓN DE LOS PROCESOS DE LA ENTIDAD; SEGUIMIENTO A PLANES, PROGRAMAS Y PROYECTOS INSTITUCIONALES PARA LA VIGENCIA 2026','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','8465567',48800000::bigint,6100000::bigint,'2026-01-14'::date,'2026-08-31'::date,'3','3'),
  ('004-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN EL REPORTE DE LA INFORMACION CONTRACTUAL DEL MUNICIPIO DE FREDONIA A TRAVÉS DE LA PLATAFORMA QUE ESTABLEZCA LA CONTRALORÍA GENERAL DE ANTIOQUIA DURANTE LA VIGENCIA 2026','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','21982267',24000000::bigint,3000000::bigint,'2026-01-16'::date,'2026-08-31'::date,'16','4'),
  ('005-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTION EN EL AREA DE SERVICIOS ADMINISTRATIVOS COMO CONTRIBUCIÓN AL MEJORAMIENTO DE LOS PROCEDIMIENTOS ASISTENCIALES RELACIONADOS CON LAS HISTORIAS LABORALES Y RIESGOS LABORALES, AL IGUAL QUE LA ADMINISTRACIÓN DEL SISTEMA DE INFORMACIÓN Y GESTIÓN DEL EMPLEO PÚBLICO DE LOS FUNCIONARIOS Y CONTRATISTAS DEL MUNICIPIO DE FREDONIA','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1041146919',21600000::bigint,2700000::bigint,'2026-01-16'::date,'2026-08-31'::date,'15','5'),
  ('007-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN COMO ENLACE PERMANENTE ANTE LA UNIDAD DE VICTIMAS DEL CONFLICTO ARMADO PARA LA ENTREGA DE INFORMACIÓN Y ORIENTACIÓN A LAS VICTIMAS, SOBRE LA RUTA DE ATENCIÓN, ASISTENCIA Y REPARACIÓN INTEGRAL EN EL MUNICIPIO DE FREDONIA DURANTE LA VIGENCIA 2026 Y ASESORAR, ORIENTAR Y DESARROLLO DE LAS ACCIONES DE PROMOCIÓN DE LOS DERECHOS HUMANOS, CONSEJO MUNICIPAL DE PAZ, JUECES DE PAZ, ALERTAS TEMPRANAS, CAPACITACIÓN Y FORMACIÓN EN DERECHOS HUMANOS, AL IGUAL QUE APOYO EN LO QUE RESPECTA AL COMPONENTE HUMANITARIO EN LA CÁRCEL EN EL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1041146358',27000000::bigint,3500000::bigint,'2026-01-19'::date,'2026-08-31'::date,'14','7'),
  ('008-2026','2026','PRESTAR LOS SERVICIOS DE PROFESIONALES EN EL FORTALECIMIENTO A LAS LABORES OPERATIVAS Y ADMINISTRATIVASEN DE LA OFICINA DE CATASTRO PARA EL FORTALECIMIENTO, ACTUALIZACIÓN Y CONSERVACIÓN DE LA BASE DE DATOS PREDIALES Y FICHAS CATASTRALES DE LOS PREDIOS URBANOS Y RURALES DEL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1041147758',54276000::bigint,4523000::bigint,'2026-01-20'::date,'2026-12-31'::date,'17','8'),
  ('009-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES COMO INGENIERA CIVIL PARA LA FORMULACIÓN, ESTRUCTURACIÓN Y SEGUIMIENTO DE PROYECTOS DESDE LA FASE PRECONTRACTUAL, CONTRACTUAL Y POSTCONTRACTUAL QUE SE ADELANTEN DESDE LA SECRETARÍA DE DESARROLLO TERRITORIAL DEL MUNICIPIO DE FREDONIA, ANTIOQUIA','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1020472944',62400000::bigint,5200000::bigint,'2026-01-20'::date,'2026-12-31'::date,'21','9'),
  ('010-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN LA EJECUCIÓN DE LAS ACTIVIDADES DE CONTROL URBANISTICO Y EL APOYO EN LA ELABORACIÓN DE CERTIFICADOS Y CONCEPTOS DE USO DE SUELO, AMBIENTAL Y DE ZONA DE RIESGO, RELACIONADOS CON EL ESQUEMA DE ORDENAMIENTO TERRITORIAL DEL MUNICIPIO DE FREDONIA, ANTIOQUIA','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','8466043',44400000::bigint,3900000::bigint,'2026-01-20'::date,'2026-12-31'::date,'24','10'),
  ('011-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL DESARROLLO DE ACTIVIDADES OPERATIVAS Y TÉCNICAS DE LA SECRETARÍA DE DESARROLLO TERRITORIAL DEL MUNICIPIO DE FREDONIA, ANTIOQUIA','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1001371404',22800000::bigint,3800000::bigint,'2026-01-20'::date,'2026-06-30'::date,'23','11'),
  ('012-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA EL FORTALECIMIENTO, ACOMPAÑAMIENTO Y SUPERVISIÓN DE LOS CONTRATOS Y CONVENIOS DE PROYECTOS DE OBRA PÚBLICA ASOCIADOS A LA SECRETARÍA DE DESARROLLO TERRITORIAL, ASI COMO EL APOYO A LA GESTIÓN DEL RIESGO DEL MUNICIPIO DE FREDONIA, ANTIOQUIA','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1128396512',28800000::bigint,5250000::bigint,'2026-01-20'::date,'2026-06-30'::date,'20','12'),
  ('013-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN PARA EL FORTALECIMIENTO A LA SECRETARÍA DE HACIENDA COMO AUXILIAR CONTABLE DEL MUNICIPIO DE FREDONIA, ANTIOQUIA','Contratacion Directa','Secretaria de Hacienda','Ivan Montoya Murillo','1041150650',37200000::bigint,3100000::bigint,'2026-01-20'::date,'2026-12-31'::date,'7','13'),
  ('014-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN PARA EL FORTALECIMIENTO A LA SECRETARÍA DE HACIENDA EN EL MANEJO PRESUPUESTAL DEL MUNICIPIO DE FREDONIA, ANTIOQUIA','Contratacion Directa','Secretaria de Hacienda','Ivan Montoya Murillo','32205180',44520000::bigint,3710000::bigint,'2026-01-20'::date,'2026-12-31'::date,'6','14'),
  ('015-2026','2026','PRESTACIÓN DE SERVICIO DE APOYO A LA GESTIÓN PARA LA DISTRIBUCIÓN DE FACTURAS A LOS CONTRIBUYENTES DE IMPUESTOS (PREDIAL E INDUSTRIA Y COMERCIO) Y REALIZAR NOTIFICACIONES PERSONALES TANTO EN LA ZONA URBANA COMO RURAL DEL MUNICIPIO DE FREDONIA ANTIOQUIA','Contratacion Directa','Secretaria de Hacienda','Ivan Montoya Murillo','43414846',45000000::bigint,0::bigint,'2026-01-20'::date,'2026-12-31'::date,'12','15'),
  ('017-2026','2026','PRESTAR LOS SERVICIOS PROFESIONALES DE ASESORÍA PARA EL MEJORAMIENTO Y DESARROLLO DE COMPETENCIAS Y HABILIDADES EN LOS PROCESOS DE PLANIFICACIÓN INSTITUCIONAL, FISCAL Y FINANCIERO DE LA SECRETARÍA DE HACIENDA','Contratacion Directa','Secretaria de Hacienda','Ivan Montoya Murillo','70784232',78000000::bigint,6500000::bigint,'2026-01-20'::date,'2026-12-31'::date,'5','17'),
  ('018-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES ESPECIALIZADO EN LA GESTIÓN CONTABLE DEL MUNICIPIO DE FREDONIA, ORIENTADOS AL FORTALECIMIENTO, SOSTENIBILIDAD Y MEJORA CONTINUA DE LOS PROCESOS DE REGISTRO, PREPARACIÓN, ANÁLISIS Y PRESENTACIÓN DE LA INFORMACIÓN FINANCIERA Y CONTABLE A LOS ENTES DE CONTROL, ADEMÁS DE APOYAR EL PROCESO DE TRANSMISIÓN Y ENVIÓ DE INFORMACIÓN PRESUPUESTAL Y DE TESORERÍA EN LA PLATAFORMA CHIP','Contratacion Directa','Secretaria de Hacienda','Ivan Montoya Murillo','42730628',82800000::bigint,6900000::bigint,'2026-01-20'::date,'2026-12-31'::date,'4','18'),
  ('019-2026','2026','PRESTAR LOS SERVICIOS PROFESIONALES PARA EL FORTALECIMIENTO DE CAPACIDADES TÉCNICAS Y OPERATIVAS EN LA REALIZACIÓN DE REPORTE DE INFORMACIÓN (RENDICIÓN DE LA CUENTA, SIRECI ANUAL, CUIPO, SIFFMA, APPUI) A LOS DIFERENTES ENTES DE CONTROL, ASÍ COMO EL APOYO EN LA RENDICIÓN Y CERTIFICACIÓN DEL FONDO LOCAL DE SALUD EN LA PARTE FINANCIERA','Contratacion Directa','Secretaria de Hacienda','Ivan Montoya Murillo','1000766011',63600000::bigint,5300000::bigint,'2026-01-20'::date,'2026-12-31'::date,'11','19'),
  ('020-2026','2026','PRESTAR LOS SERVICIOS PROFESIONALES EN CALIDAD DE ABOGADO ESPECIALISTA EN LEGISLACION TRIBUTARIA, ASESORANDO Y ACOMPAÑANDO LA FISCALIZACIÓN DE CONTRIBUYENTES DE INDUSTRIA Y COMERCIO, Y OTRAS RENTAS, HASTA LA DETERMINACIÓN DEL DEBIDO COBRAR Y LAS SANCIONES QUE DIERE LUGAR, ADEMÁS DE SU COBRANZA Y COBRO COACTIVO DEL IMPUESTO PREDIAL, INDUSTRIA Y COMERCIO Y OTRAS RENTAS QUE SEAN NECESARIAS COMO SANCIONES DE TRÁNSITO Y POLICÍA EN EL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria de Hacienda','Ivan Montoya Murillo','8430584',68794000::bigint,6254000::bigint,'2026-02-02'::date,'2026-12-31'::date,'10','20'),
  ('021-2026','2026','PRESTAR LOS SERVICIOS PROFESIONALES DE ASESORÍA PARA EL MEJORAMIENTO Y DESARROLLO DE COMPETENCIAS Y HABILIDADES EN LOS PROCESOS ADMINISTRATIVOS DE LA SECRETARÍA DE HACIENDA DEL MUNICIPIO DE FREDONIA','Contratacion Directa','Secretaria de Hacienda','Ivan Montoya Murillo','1017276694',60500000::bigint,5500000::bigint,'2026-02-02'::date,'2026-12-31'::date,'13','21'),
  ('024-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN EN LA CONTRATACIÓN DEL SERVICIO DE HOGAR DE PASO PARA LA ATENCIÓN INTEGRAL A LOS NIÑOS, NIÑAS Y ADOLESCENTES QUE ASÍ LO REQUIERAN, DENTRO DEL PROCESO ADMINISTRATIVO DE RESTABLECIMIENTO DE DERECHOS EN EL MUNICIPIO DE FREDONIA.','Contratacion Directa','Comisaria de Familia','Biviana Inmaculada Hoyos Mondragon','43806393',24999993::bigint,2777777::bigint,'2026-01-22'::date,'2026-09-30'::date,'26','24'),
  ('025-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN EL ÁREA DE CONTRUCCIONES CIVILES PARA EL APOYO Y ACOMPAÑAMIENTO TÉCNICO A LOS PROCESOS DE CONTROL URBANÍSTICO Y DEMAS PROCESOS QUE SE ADELANTEN DESDE EN LA INSPECCIÓN DE POLICÍA Y TRÁNSITO DEL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1037640364',22720000::bigint,2840000::bigint,'2026-02-18'::date,'2026-09-30'::date,'37','25 - 255'),
  ('026-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN EL FORTALECIMIENTO DEL SOPORTE TÉCNICO DE LA INFRAESTRUCTURA INFORMÁTICA DE LA ADMINISTRACIÓN MUNICIPAL Y EL ACOMPAÑAMIENTO ASISTENCIAL EN EL AVANCE DE LA POLÍTICA DE GOBIERNO DIGITAL DE LA ADMINISTRACIÓN MUNICIPAL DE FREDONIA','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1007633889',19200000::bigint,2400000::bigint,'2026-02-02'::date,'2026-09-30'::date,'30','26'),
  ('027-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL FORTALECIMIENTO DE LOS ESPACIOS DE PARTICIPACIÓN CIUDADANA Y COMUNITARIA EN EL MARCO DE LA IMPLEMENTACIÓN DE LA POLITICA PUBLICA DE LAS JUNTAS DE ACCIÓN COMUNAL.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','32160770',22400000::bigint,2800000::bigint,'2026-02-02'::date,'2026-09-30'::date,'31','27'),
  ('028-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN COMO ASISTENTE DEL DESPACHO DEL ALCALDE Y LA EJECUCIÓN DE LAS ACCIONES VINCULADAS A LAS RELACIONES CORPORATIVAS DE LA ENTIDAD.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','21737896',36800000::bigint,4600000::bigint,'2026-01-21'::date,'2026-08-31'::date,'27','28'),
  ('029-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA EL FORTALECIMIENTO DE LA SECRETARÍA DE DESARROLLO TERRITORIAL EN EL MANEJO, ACTUALIZACIÓN Y REPORTE AL BANCO DE PROGRAMAS Y PROYECTOS DE INVERSIÓN MUNICIPAL, LA MGA, LAS PLATAFORMAS Y EL REPORTE DE SISTEMAS DE INFORMACIÓN DEL SISTEMA GENERAL DE REGALÍAS - SGR DEL MUNICIPIO DE FREDONIA, ANTIOQUIA.','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1152434726',66000000::bigint,5800000::bigint,'2026-01-21'::date,'2026-12-31'::date,'22','29'),
  ('030-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES COMO ABOGADA, BRINDANDO ASESORÍA JURÍDICA EN LOS PROCESOS, Y PROCEDIMIENTOS CONTRACTUALES Y DEMÁS ACTUACIONES QUE ADELANTA LA SECRETARÍA DE DESARROLLO TERRITORIAL DEL MUNICIPIO DE FREDONIA, ANTIOQUIA.','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1152434294',48000000::bigint,8000000::bigint,'2026-01-21'::date,'2026-06-30'::date,'42','30'),
  ('031-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN MEDIANTE LA ASISTENCIA TÉCNICA AGROPECUARIA EN LA ATENCIÓN Y ORIENTACIÓN A LOS USUARIOS DEL CONVENIO ICA, APOYANDO LOS PROCESOS TÉCNICOS, ADMINISTRATIVOS Y OPERATIVOS DE LA OFICINA, ASÍ COMO LA PLANEACIÓN Y EJECUCIÓN DE LAS JORNADAS DE BIENESTAR ANIMAL, CONFORME A LOS LINEAMIENTOS INSTITUCIONALES Y LA NORMATIVIDAD VIGENTE.','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1041151216',31350000::bigint,2850000::bigint,'2026-02-02'::date,'2026-12-31'::date,'39','31'),
  ('032-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES EN INGENIERÍA AMBIENTAL PARA BRINDAR ASESORÍA TÉCNICA Y EL ACOMPAÑAMIENTO CONTINUO A LOS ACUEDUCTOS RURALES, LA GESTIÓN Y EL ACOMPAÑAMIENTO A LOS TRÁMITES AMBIENTALES QUE ADELANTE LA COMUNIDAD, SERVIR COMO ENLACE ANTE CORANTIOQUIA, ASI COMO LA ASISTENCIA AMBIENTAL PARA EL CUMPLIMIENTO DE LA NORMATIVIDAD VIGENTE EN EL MUNICIPIO DE FREDONIA ANTIOQUIA','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1033343280',39600000::bigint,3600000::bigint,'2026-02-02'::date,'2026-12-31'::date,'41','32'),
  ('033-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL CUIDADO INTEGRAL DE LOS ANIMALES DEL ALBERGUE MUNICIPAL Y EL APOYO EN LA EJECUCIÓN Y FORTALECIMIENTO DE LOS PROGRAMAS DE BIENESTAR ANIMAL EN EL MUNICIPIO DE FREDONIA','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','21792489',27500000::bigint,2500000::bigint,'2026-02-02'::date,'2026-12-31'::date,'40','33'),
  ('034-2026','2026','PRESTACIÓN DE SERVICIOS COMO AGENTE DE TRÁNSITO PEDAGÓGICO PARA LA REGULACIÓN, CONTROL Y APLICACIÓN DE LAS NORMAS DE TRÁNSITO Y TRANSPORTE, CON EL FIN DE GARANTIZAR LA MOVILIDAD SEGURA, LA PREVENCIÓN DE ACCIDENTES EN EL MUNICIPIO DE FREDONIA, ANTIOQUIA','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1152203945',28000000::bigint,3500000::bigint,'2026-02-02'::date,'2026-09-30'::date,'34','34'),
  ('035-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA LA ELABORACIÓN, EVALUACIÓN, REVISIÓN Y EXPEDICIÓN DE ACTOS ADMINISTRATIVOS REFERENTES A LICENCIAS URBANÍSTICAS EN SUS MODALIDADES Y MODIFICACIONES DE ACUERDO AL ESQUEMA DE ORDENAMIENTO TERRITORIAL EN EL MUNICIPIO DE FREDONIA, ANTIOQUIA','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1032257037',25600000::bigint,4800000::bigint,'2026-01-22'::date,'2026-06-30'::date,'25','35'),
  ('036-2026','2026','PRESTAR LOS SERVICIOS PROFESIONALES PARA EL ANÁLISIS, VERIFICACIÓN Y PROYECCIÓN DE LOS PROCESOS REMITIDOS PARA RESOLVER EN SEGUNDA INSTANCIA ADMINISTRATIVA EN EL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','70082275',34400000::bigint,4300000::bigint,'2026-02-02'::date,'2026-09-30'::date,'47','36'),
  ('037-2026','2026','PRESTACIÓN DE APOYO A LA GESTIÓN EN EL FORTALECIMIENTO DE LOS PROCESOS DE COMUNICACIÓN RELACIONADOS CON LA EJECUCIÓN DEL PLAN DE DESARROLLO DE LA ADMINISTRACIÓN MUNICIPAL DE FREDONIA VIGENCIA 2026.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','8464867',32400000::bigint,4050000::bigint,'2026-02-02'::date,'2026-09-30'::date,'29','37'),
  ('038-2026','2026','PRESTAR LOS SERVICIOS PROFESIONALES COMO COMUNICADOR SOCIAL Y PERIODISTA PARA LA GESTIÓN DE LOS PROCESOS COMUNICACIONALES EXTERNOS DE LA ADMINISTRACIÓN MUNICIPAL DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1041150322',35200000::bigint,4400000::bigint,'2026-02-02'::date,'2026-09-30'::date,'45','38'),
  ('039-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA EL DESARROLLO DE ACCIONES CONTEMPLADAS EN LOS PROYECTOS "IMPLEMENTACIÓN DE ESTRATEGIAS DE INSPECCIÓN, VIGILANCIA Y CONTROL DEL SECTOR SALUD EN EL MUNICIPIO DE FREDONIA" Y "MEJORAMIENTO DE LA PRESENTACIÓN DE SERVICIOS DE SALUD EN EL MUNICIPIO DE FREDONIA" EN EL FORTALECIMIENTO A LA SECRETARIA DE BIENESTAR SOCIAL EN RELACIÓN EN SISTEMAS DE INFORMACIÓN DE SALUD PUBLICA Y ASEGURAMIENTO','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','98710816',66000000::bigint,5750000::bigint,'2026-01-24'::date,'2026-12-31'::date,'64','39'),
  ('040-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES DE APOYO A LA GESTIÓN PARA EL APOYO A LA SECRETARIA DE BIENESTAR SOCIAL EN EL COMPONENTE DE SALUD EN EL CUMPLIMIENTO DE LA CIRCULAR 001 DE 2020 AUDITORIAS SUPERSALUD GAUDI SEGUNDO SEMESTRE DE 2025 DEL MUNICIPIO DE FREDONIA','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','98710816',20000000::bigint,5000000::bigint,'2026-03-02'::date,'2026-06-30'::date,'63','40'),
  ('041-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA LA COORDINACIÓN DE ACCIONES CONTEMPLADAS EN LOS PROYECTOS  "IMPLEMENTACIÓN DE ESTRATEGIAS DE INSPECCIÓN, VIGILANCIA Y CONTROL DEL SECTOR SALUD EN EL MUNICIPIO DE FREDONIA"  Y "MEJORAMIENTO DE LA PRESENTACIÓN DE SERVICIOS DE SALUD EN EL MUNICIPIO DE FREDONIA" EN EL FORTALECIMIENTO A LA SECRETARIA DE BIENESTAR SOCIAL EN RELACIÓN  A LA GESTIÓN DE LA SALUD PÚBLICA, ACCIONES INTERSECTORIALES, PLANEACIÓN EN SALUD, POLITICAS SOCIALES Y DE ATENCIÓN A LA POBLACIÓN VULNERABLE','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1038360521',84000000::bigint,7300000::bigint,'2026-01-24'::date,'2026-12-30'::date,'62','41'),
  ('042-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA EL FORTALECIMIENTO DE LA SECRETARÍA DE BIENESTAR SOCIAL DE FREDONIA, EN PROCESOS DE VIGILANCIA EN SALUD PÚBLICA, VIGILANCIA COMUNITARIA, PROGRAMA AMPLIADO DE INMUNIZACIONES, RESPUESTA INMEDIATA EN SALUD.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041146425',28980000::bigint,4600000::bigint,'2026-01-24'::date,'2026-07-31'::date,'65','42'),
  ('043-2026','2026','PRESTACIÓN DE SERVICIOS PARA EL DESARROLLO DE ACCIONES CONTEMPLADAS EN LOS PROYECTOS "IMPLEMENTACIÓN DE ESTRATEGIAS DE INSPECCIÓN, VIGILANCIA Y CONTROL DEL SECTOR SALUD EN EL MUNICIPIO DE FREDONIA" Y "MEJORAMIENTO DE LA PRESENTACIÓN DE SERVICIOS DE SALUD EN EL MUNICIPIO DE FREDONIA" EN LOS COMPONENTES DE VIGILANCIA EN SALUD PÚBLICA, PARTICIPACIÓN SOCIAL EN SALUD','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041149852',20160000::bigint,3200000::bigint,'2026-01-24'::date,'2026-07-31'::date,'66','43'),
  ('044-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA LA ASESORÍA JURÍDICA ESPECIALIZADA EN LOS PROCESOS DE CONTRATACIÓN DE BIENES Y SERVICIOS DEL MUNICIPIO, EN LA VIGENCIA FISCAL 2026','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','70230420',32000000::bigint,4000000::bigint,'2026-02-02'::date,'2026-09-30'::date,'50','44'),
  ('045-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES EN DERECHO PARA EL APOYO JURÍDICO, ACOMPAÑAMIENTO EN PROCESOS ADMINISTRATIVOS SANCIONATORIOS, ELABORACIÓN DE ACTOS ADMINISTRATIVOS, DEFENSA JURÍDICA DEL MUNICIPIO EN ASUNTOS DE TRÁNSITO Y MOVILIDAD, Y CAPACITACIÓN DEL PERSONAL DE LA INSPECCIÓN DE POLICÍA, CON EL FIN DE CONTRIBUIR AL CUMPLIMIENTO DE SUS FUNCIONES Y AL FORTALECIMIENTO DE LAS ACCIONES DE PREVENCIÓN, PROMOCIÓN Y REGULACIÓN ESTABLECIDAS EN LA LEY 1801 DE 2016 – CÓDIGO NACIONAL DE SEGURIDAD Y CONVIVENCIA CIUDADANA EN EL MUNICIPIO DE FREDONIA, ANTIOQUIA Y EL SEGUIMIENTO A LAS ACCIONES POPULARES DEL MUNICIPIO DE FREDONIA ANTIOQUIA','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1000940222',32000000::bigint,4000000::bigint,'2026-02-02'::date,'2026-09-30'::date,'51','45'),
  ('046-2026','2026','PRESTAR LOS SERVICIOS PROFESIONALES PARA EL DISEÑO Y COORDINACIÓN DE LOS PROCESOS DE IMPLEMENTACIÓN DEL SISTEMA DE GESTIÓN DE SEGURIDAD Y SALUD EN EL TRABAJO PARA ASEGURAR EL CUMPLIMIENTO DE LAS NORMAS QUE COMPONEN EL SISTEMA GENERAL DE RIESGOS LABORALES PARA LA PROTECCIÓN DE LA INTEGRIDAD DEL PERSONAL QUE REALIZA EL TRABAJO, LABOR O ACTIVIDAD PARA CON EL MUNICIPIO DE FREDONIA VIGENCIA 2026.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1041150263',30400000::bigint,3800000::bigint,'2026-02-02'::date,'2026-09-30'::date,'46','46'),
  ('047-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN PARA LA DIFUSIÓN Y COMUNICACIÓN DE LOS ACTOS, EVENTOS Y ACTIVIDADES QUE REALIZA LA ADMINISTRACIÓN MUNICIPAL A TRAVÉS DE LOS CANALES DE COMUNICACIÓN DISPONIBLES EN PLATAFORMAS VIRTUALES, ANÁLOGAS Y DE AMPLIO ALCANCE CON LAS QUE CUENTE EL EJECUTOR','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','8460397',32000000::bigint,4000000::bigint,'2026-02-02'::date,'2026-09-30'::date,'28','47'),
  ('048-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN EN EL DESARROLLO E IMPLEMENTACIÓN DEL PROYECTO TURÍSTICO EN EL MUNICIPIO DE FREDONIA, ORIENTADO A LA PROMOCIÓN, FORTALECIMIENTO DE LA OFERTA TURÍSTICA LOCAL, ASÍ COMO EL ACOMPAÑAMIENTO EN PROCESOS DE INFORMACIÓN, ARTICULACIÓN Y ATENCIÓN A LOS DIFERENTES ACTORES DEL SECTOR.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1007496848',22400000::bigint,2800000::bigint,'2026-02-02'::date,'2026-09-30'::date,'72','48'),
  ('049-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN EN EL DESARROLLO E IMPLEMENTACIÓN DEL PROYECTO TURISTICO EN EL MUNICIPIO DE FREDONIA, ORIENTADO A LA PROMOCIÓN, FORTALECIMIENTO DE LA OFERTA TURISTICA LOCAL, ASI COMO EL ACOMPAÑAMIENTO EN PROCESOS DE INFORMACION, ARTICULACIÓN Y ATENCIÓN A LOS DIFERENTES ACTORES DEL SECTOR','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1007681134',22400000::bigint,2800000::bigint,'2026-02-02'::date,'2026-09-30'::date,'73','49'),
  ('050-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN COMO TÉCNICO EN LA IMPLEMENTACIÓN DE LOS PROCESOS DE GESTIÓN ADMINISTRATIVA Y OPERATIVA EN EL FORTALECIMIENTO DEL TALENTO HUMANO, CON ÉNFASIS EN EL MEJORAMIENTO DE LAS COMPETENCIAS Y BIENESTAR LABORAL EN LA ALCALDÍA MUNICIPAL DE FREDONIA','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1001359851',19600000::bigint,2800000::bigint,'2026-03-02'::date,'2026-09-30'::date,'54','50'),
  ('051-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES EN LA COORDINACIÓN DEL PROCESO DE FORMULACIÓN, PLANEACIÓN, EJECUCIÓN Y SEGUIMIENTO DE LAS POLÍTICAS PÚBLICAS DIRECCIONADAS DESDE LA SECRETARIA DE BIENESTAR SOCIAL PARA LA VIGENCIA 2026','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','8464986',28800000::bigint,4800000::bigint,'2026-02-02'::date,'2026-07-31'::date,'55','51'),
  ('052-2026','2026','PRESTACIÓN DE SERVICIOS PARA COORDINAR ACCIONES EN EL PROYECTO DE INVERSION DENOMINADO FORTALECIMIENTO DE LOS ESPACIOS DE PARTICIPACION CIUDADANA Y COMUNITARIA EN EL MUNICIPIO DE FREDONIA EN EL COMPONENTE DE MUJER, GENERO Y DIVERSIDAD SEXUAL EN LA ZONA URBANA Y RURAL.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1026152027',24000000::bigint,4000000::bigint,'2026-02-02'::date,'2026-07-31'::date,'56','52'),
  ('053-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA LA COORDINACIÓN DEL PROGRAMA DE DISCAPACIDAD Y EL FORTALECIMIENTO DE LA SALUD MENTAL DE LOS ADULTOS MAYORES DEL CENTRO DÍA DEL MUNICIPIO DE FREDONIA EN EL MARCO DE LA ESTRATEGIA DE DISPOSITIVOS COMUNITARIOS.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041146117',26400000::bigint,4400000::bigint,'2026-02-02'::date,'2026-07-31'::date,'58','53'),
  ('054-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES EN EL DESARROLLO DE ACCIONES EN EL MARCO DEL PROYECTO “DESARROLLO INTEGRAL DE NIÑOS, NIÑAS, ADOLESCENTES Y SUS FAMILIAS EN EL MUNICIPIO DE FREDONIA” EN EL COMPONENTE DE INFANCIA, ADOLESCENCIA, FAMILIA Y JUVENTUD.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1046669032',27000000::bigint,4500000::bigint,'2026-02-02'::date,'2026-07-31'::date,'57','54'),
  ('055-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN EL FORTALECIMIENTO DEL PROGRAMA DE TRÁNSITO A RENTA CIUDADANA Y INCENTIVOS ECONÓMICOS PARA LA ATENCIÓN A LA POBLACIÓN VULNERABLE DEL MUNICIPIO DE FREDONIA EN LA ZONA URBANA Y RURAL','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','32160490',31900000::bigint,2900000::bigint,'2026-02-02'::date,'2026-12-30'::date,'59','55'),
  ('056-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN AL MUNICIPIO DE FREDONIA EN EL PROCESO DE GESTIÓN DOCUMENTAL PARA FORTALECER LOS DIFERENTES ARCHIVOS DE GESTIÓN QUE HACEN PARTE DE LA ENTIDAD','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1015332771',19200000::bigint,2400000::bigint,'2026-02-02'::date,'2026-09-30'::date,'48','56'),
  ('057-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN EL FORTALECIMIENTO AL PROCESO DE QUE SE REALIZA EN LA VENTANILLA UNICA DEL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','32160996',20000000::bigint,2500000::bigint,'2026-02-02'::date,'2026-09-30'::date,'49','57'),
  ('058-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO Y ASESORIA EN TEMAS DE SEGURIDAD E IMPLEMENTACIÓN DE LOS PLANES DE RESOCIALIZACIÓN Y REPORTES A LOS ENTES DE CONTROL ACERCA DEL FUNCIONAMIENTO DE LA CARCEL MUNICIPAL DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1041146326',28000000::bigint,3500000::bigint,'2026-02-02'::date,'2026-09-30'::date,'32','95'),
  ('059-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN LOGÍSTICA Y OPERATIVA DE LA SECRETARIA GENERAL Y DE GOBIERNO DEL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1007347664',19200000::bigint,2400000::bigint,'2026-03-02'::date,'2026-10-31'::date,'53','125'),
  ('064-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN COMO COORDINADOR DE LAS ACCIONES DE INTERVENCIÓN DEL ESPACIO PÚBLICO Y APOYO LOGÍSTICO DE LAS ACTIVIDADES INTERSECTORIALES REALIZADAS POR LA ADMINISTRACIÓN MUNICIPAL','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1041149202',23200000::bigint,2900000::bigint,'2026-02-02'::date,'2026-09-30'::date,'18','58'),
  ('065-2026','2026','DESARROLLO DE ACCIONES EN EL MARCO DE LOS PROYECTOS DE INVERSIÓN “MEJORAMIENTO DE LAS CONDICIONES DE ACCESO A LA CALIDAD Y COBERTURA DE LA EDUCACIÓN EN EL MUNICIPIO DE FREDONIA” Y “IMPLEMENTACION DE PROGRAMAS PARA LA ATENCIÓN INTEGRAL EN SALUD A LA POBLACIÓN DEL MUNICIPIO DE FREDONIA” EN EL COMPONENTE DE SALUD MENTAL, DISPOSITIVOS COMUNITARIOS, ZONAS DE ORIENTACIÓN ESCOLAR EN LA INSTITUCIÓN EDUCATIVA DE MINAS SEDE PRINCIPAL Y SEDE MURRAPAL, APOYO A LA POBLACIÓN EN SITUACION DE DESPROTECCIÓN HABITANTE DE CALLE','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041149023',18450000::bigint,4100000::bigint,'2026-02-02'::date,'2026-06-15'::date,'69','59'),
  ('066-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN LA PROMOCIÓN DE ESTRATEGIAS DE COMUNICACIÓN Y BILINGÜISMO EN EL MUNICIPIO DE FREDONIA, EN LA ZONA URBANA Y RURAL CON ADOLESCENTES, JÓVENES Y ADULTOS.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','3455047',13950000::bigint,3100000::bigint,'2026-02-02'::date,'2026-06-15'::date,'70','60'),
  ('067-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN LA PROMOCIÓN DE ESTRATEGIAS DE COMUNICACIÓN EFECTIVA Y BILINGÜISMO EN EL MUNICIPIO DE FREDONIA, EN LA ZONA URBANA Y RURAL, CON PRIMERA INFANCIA E INFANCIA PRIMER SEMESTRE 2026.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','32161152',13950000::bigint,3100000::bigint,'2026-02-02'::date,'2026-06-15'::date,'71','61'),
  ('068-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA ACOMPAÑAR LOS SERVICIOS Y PROCESOS DEL DESPACHO DE LA SECRETARIA DE BIENESTAR SOCIAL DEL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','42732594',15000000::bigint,2500000::bigint,'2026-02-02'::date,'2026-07-31'::date,'67','62'),
  ('069-2026','2026','PRESTACIÓN DE SERVICIOS PARA EL APOYO A LA GESTIÓN COMO ENLACE DEL PROGRAMA DE ALIMENTACIÓN ESCOLAR (PAE) Y LOS PROGRAMAS DE COMPLEMENTACIÓN ALIMENTARIA EN EL MARCO DE LA IMPLEMENTACIÓN DE LA POLÍTICA PÚBLICA DE SEGURIDAD ALIMENTARIA DEL MUNICIPIO DE FREDONIA EN EL FORTALECIMIENTO DE LOS PROGRAMAS DE ATENCIÓN A LA POBLACIÓN VULNERABLE PARA LA VIGENCIA 2026.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041150069',33000000::bigint,3000000::bigint,'2026-02-02'::date,'2026-12-30'::date,'68','63'),
  ('070-2026','2026','PRESTACION DE SERVICIOS PROFESIONALES PARA EL MEJORAMIENTO DE LAS CONDICIONES DE ACCESO A LA CALIDAD Y COBERTURA DE LA EDUCACIÓN EN EL MUNICIPIO DE FREDONIA” EN EL COMPONENTE DE SALUD MENTAL, DISPOSITIVOS COMUNITARIOS, ZONAS DE ORIENTACIÓN ESCOLAR EN LA INSTITUCIÓN EDUCATIVA JOSE MARIA OBANDO Y SUS SEDES.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1152200195',18450000::bigint,4100000::bigint,'2026-02-02'::date,'2026-06-15'::date,'140','136'),
  ('071-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN DE MANERA ASISTENCIAL PARA LA GESTIÓN ADMINISTRATIVA EN EL PROCESO DE LA ESTRATIFICACIÓN SOCIOECONÓMICA, LA ATENCIÓN EN CAMPO DE LAS SOLICITUDES Y EL APOYO TÉCNICO EN VISITAS A PROYECTOS QUE SE ADELANTEN DESDE LA SECRETARÍA DE DESARROLLO TERRITORIAL DEL MUNICIPIO DE FREDONIA, ANTIOQUIA.','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','8464638',35200000::bigint,3200000::bigint,'2026-02-02'::date,'2026-12-30'::date,'38','71'),
  ('073-2026','2026','PRESTAR LOS SERVICIOS PROFESIONALES EN LA COORDINACIÓN Y DINAMIZACIÓN DEL CENTRO DE ACOPIO VEHICULAR DEL MUNICIPIO DE FREDONIA','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','8465244',32000000::bigint,4000000::bigint,'2026-02-02'::date,'2026-09-30'::date,'80','73'),
  ('074-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN PARA LA EJECUCIÓN DE ACCIONES DE MANTENIMIENTO, ORNAMENTACIÓN, CUIDADO Y PROTECCIÓN DE LOS BIENES Y ENSERES DE LOS EDIFICIOS PÚBLICOS DEL MUNICIPIO DE FREDONIA, CON EL FIN DE GARANTIZAR SU ADECUADA CONSERVACIÓN, FUNCIONALIDAD Y PRESENTACIÓN.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','8462873',20000000::bigint,2500000::bigint,'2026-02-02'::date,'2026-09-30'::date,'82','74'),
  ('075-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES DE ACOMPAÑAMIENTO TÉCNICO Y OPERATIVO EN RECORRIDOS DE CAMPO, SEGUIMIENTO A PROYECTOS DE OBRA PÚBLICA, APOYO A PROCESOS CATASTRALES Y CONSOLIDACIÓN DOCUMENTAL DE CONVENIOS SOLIDARIOS, REALIZADOS POR LA SECRETARÍA DE DESARROLLO TERRITORIAL DEL MUNICIPIO DE FREDONIA, ANTIOQUIA.','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','8463936',15000000::bigint,3000000::bigint,'2026-02-02'::date,'2026-06-30'::date,'134','126'),
  ('076-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL FORTALECIMIENTO DE LA PLATAFORMA SIMAT, CARACTERIZACIÓN Y APOYO DE LAS ESTRATEGIAS DE PERMANENCIA ESCOLAR COMO LOS PROGRAMA DE ALIMENTACION Y TRANSPORTE ESCOLAR.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041148101',13050000::bigint,2900000::bigint,'2026-02-02'::date,'2026-06-15'::date,'92','76'),
  ('077-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN PARA EL SEGUIMIENTO, VERIFICACIÓN Y CONSOLIDACIÓN DE LA INFORMACIÓN DEL SISTEMA DE INVENTARIOS DE LA ALCALDÍA DE FREDONIA, CON EL FIN DE FORTALECER LA ADMINISTRACIÓN, CONTROL Y ACTUALIZACIÓN DE LOS BIENES DE PROPIEDAD DEL MUNICIPIO.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1007284916',17500000::bigint,2500000::bigint,'2026-03-02'::date,'2026-09-30'::date,'81','77'),
  ('078-2026','2026','PRESTACIÓN DE SERVICIOS PARA EL DESARROLLO DE ACCIONES ENMARCADAS EN EL PROYECTO DE INVERSIÓN “IMPLEMENTACIÓN DE LA POLITICA DE ENVEJECIMIENTO Y VEJEZ” DESDE EL COMPONENTE DE SALUD ENVEJECIMIENTO SALUDABLE Y UNA VIDA INDEPENDIENTE, AUTÓNOMA Y PRODUCTIVA EN LA VEJEZ, ESTRATEGIA DE CUIDADO DEL ADULTO MAYOR','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','32161150',19200000::bigint,3200000::bigint,'2026-02-02'::date,'2026-07-31'::date,'91','127'),
  ('079-2026','2026','PRESTACIÓN DE SERVICIOS PARA EL DESARROLLO DE ACCIONES ENMARCADAS EN EL PROYECTO DE INVERSIÓN IMPLEMENTACIÓN DE LA POLITICA DE ENVEJECIMIENTO Y VEJEZ DESDE EL COMPONENTE DE SALUD ENVEJECIMIENTO SALUDABLE Y UNA VIDA INDEPENDIENTE, AUTÓNOMA Y PRODUCTIVA EN LA VEJEZ','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1007496531',19200000::bigint,3200000::bigint,'2026-02-02'::date,'2026-07-31'::date,'90','78'),
  ('082-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO EN EL PROGRAMA DEL ADULTO MAYOR PARA EL FORTALECIMIENTO DE LA ATENCIÓN A LOS ADULTOS MAYORES DEL CENTRO DIA, COLOMBIA MAYOR PARA GARANTIZAR LA OPERACIÓN TÉCNICA Y ADMINISTRATIVA DEL PROGRAMA.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','32160617',13260000::bigint,2210000::bigint,'2026-02-02'::date,'2026-07-31'::date,'60','79'),
  ('083-3036','2026','PRESTACIÓN DE SERVICIOS PARA LA EJECUCIÓN DE ACCIONES EN EL MARCO DE LOS PROYECTOS DE INVERSIÓN IMPLEMENTACIÓN DE LA POLITICA PUBLICA DE ENVEJECIMIENTO Y VEJEZ DEL MUNICIPIO DE FREDONIA Y DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA PARA EL FORTALECIMIENTO DE LA SECRETARIA DE BIENESTAR SOCIAL EN EL COMPONENTE DEL ADULTO MAYOR ENVEJECIMIENTO ACTIVO EN LA ZONA RURAL.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','8465629',21000000::bigint,3500000::bigint,'2026-02-02'::date,'2026-07-31'::date,'88','128'),
  ('084-2026','2026','PRESTACIÓN DE SERVICIOS PARA LA EJECUCIÓN DE ACCIONES EN EL MARCO DE LOS PROYECTOS DE INVERSIÓN IMPLEMENTACIÓN DE LA POLITICA PUBLICA DE ENVEJECIMIENTO Y VEJEZ DEL MUNICIPIO DE FREDONIA Y DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA PARA EL FORTALECIMIENTO DE LA SECRETARIA DE BIENESTAR SOCIAL EN EL COMPONENTE DEL ADULTO MAYOR ENVEJECIMIENTO ACTIVO EN LA ZONA RURAL Y URBANA.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1033342249',21000000::bigint,3500000::bigint,'2026-02-02'::date,'2026-07-31'::date,'89','80'),
  ('085-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA EL FORTALECIMIENTO DE POLITICA PUBLICA DE SEGURIDAD ALIMENTARIA Y NUTRICIONAL Y LA PLANEACIÓN, IMPLEMENTACIÓN Y SEGUIMIENTO DEL SISTEMA DE GESTIÓN DE LA CALIDAD EN SALUD EN EL MARCO DEL PROGRAMA DE AUDITORÍA PARA EL MEJORAMIENTO DE LA CALIDAD – PAMEC','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1007496693',22800000::bigint,3800000::bigint,'2026-02-02'::date,'2026-07-31'::date,'113','81'),
  ('086-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES COMO COORDINADOR DEL PROGRAMAS POR SU SALUD MUEVASE Y EL FORTALECIMIENTO DE LOS CENTROS DE PROMOCION DE LA SALUD Y LA PREPARACIÓN FISICA DE LOS DEPORTISTAS DE LOS DIFERENTES SELECCIONADOS.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041148995',49500000::bigint,4500000::bigint,'2026-02-02'::date,'2026-12-30'::date,'106','75'),
  ('087-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN COMO GESTOR DEPORTIVO EN LA DISCIPLINA DE FUTBOL EN LAS RAMAS MASCULINA Y FEMENINA , EN LA IMPLEMENTACIÓN DEL PROYECTO DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA, EN LOS GRUPOS DE FORMACIÓN Y COMPETENCIA PREJUVENIL, JUVENIL Y MAYORES.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','8466487',17400000::bigint,2900000::bigint,'2026-02-02'::date,'2026-07-31'::date,'112','68'),
  ('088-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN COMO GESTOR DEPORTIVO EN LAS DISCIPLINAS INDIVIDUALES DE ATLETISMO, TENIS DE MESA Y AJEDREZ EN LA IMPLEMENTACIÓN DEL PROYECTO DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA, EN LOS GRUPOS DE INICIACIÓN, FORMACIÓN, JUVENILES Y MAYORES.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1000086463',19800000::bigint,3300000::bigint,'2026-02-02'::date,'2026-07-31'::date,'108','69'),
  ('089-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN COMO GESTOR DEPORTIVO EN LA DISCIPLINA DE BALONCESTO EN LOS GRUPOS DE INICIACIÓN, FORMACIÓN, JUVENILES Y MAYORES DEL EN EL MARCO DEL PROYECTO DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRACTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA .','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1045112814',19800000::bigint,3300000::bigint,'2026-02-02'::date,'2026-07-31'::date,'109','70'),
  ('090-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA LA COORDINACIÓN DE ACCIONES EN EL MARCO DEL PROYECTO DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRACTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041148232',25800000::bigint,4300000::bigint,'2026-02-02'::date,'2026-07-31'::date,'101','129'),
  ('092-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN COMO GESTOR DEPORTIVO EN LA DISCIPLINA DE FUTBOL, EN LA IMPLEMENTACIÓN DEL PROYECTO DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA, MEDIANTE LAS CATEGORIAS DE PREPONY, PONY, SUB 8 Y SUB 10, 12 .','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','8460907',17400000::bigint,2900000::bigint,'2026-02-02'::date,'2026-07-31'::date,'114','97'),
  ('093-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL FORTALECIMIENTO DE LOS PROCESOS DEPORTIVOS, RECREATIVOS Y DE ACTIVIDAD FÍSICA EN LA ZONA RURAL EN LA INSTITUCIÓN EDUCATIVA LLANO GRANDE SUS SEDES Y COMUNIDAD DE LAS VEREDAS Y CORREGIMIENTO DE INFLUENCIA, EN EL MARCO DEL PROYECTO DE INVERSIÓN FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1007310617',17400000::bigint,2900000::bigint,'2026-02-02'::date,'2026-07-31'::date,'103','98'),
  ('094-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL FORTALECIMIENTO DE LOS PROCESOS DEPORTIVOS, RECREATIVOS Y DE ACTIVIDAD FÍSICA EN LA ZONA RURAL EN LA INSTITUCIÓN EDUCATIVA DE MINAS Y COMUNIDAD DE LAS VEREDAS Y CORREGIMIENTO DE INFLUENCIA, EN EL MARCO DEL PROYECTO DE INVERSIÓN FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','8465684',17400000::bigint,2900000::bigint,'2026-02-02'::date,'2026-07-31'::date,'105','99'),
  ('095-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL FORTALECIMIENTO DE LOS PROCESOS DEPORTIVOS, RECREATIVOS Y DE ACTIVIDAD FISICA EN LA ZONA RURAL EN LA INSTITUCIÓN EDUCATIVA LOS PALOMOS , SUS SEDES Y COMUNIDAD DE LAS VEREDAS Y CORREGIMIENTO DE INFLUENCIA, FORTALECIMIENTO DE LAS OLIMPIADAS CAMPESINAS EN EL MARCO DEL PROYECTO FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1001237715',19800000::bigint,3300000::bigint,'2026-02-02'::date,'2026-07-31'::date,'110','100'),
  ('096-2026','2026','PRESTACIÓN DE SERVICIOS PARA EL DESARROLLO DE ACCIONES EN EL MARCO DEL PROYECTO DE INVERSIÓN "DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA" EN EL COMPONENTE DEPORTIVO, RECREACIÓN Y DE ACTIVIDAD FISICA,EN LA ORGANIZACIÓN Y LIMPIEZA DE ESCENARIOS DEPORTIVOS.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','21738072',14400000::bigint,2400000::bigint,'2026-02-02'::date,'2026-07-31'::date,'107','101'),
  ('097-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN COMO GESTOR DEPORTIVO EN LA DISCIPLINA DE FÚTBOL DE SALÓN y FÚTBOL SALA, EN LA IMPLEMENTACIÓN DEL PROYECTO DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA, EN INICIACIÓN, FORMACIÓN, JUVENILES Y MAYORES','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','21739967',17400000::bigint,2900000::bigint,'2026-02-02'::date,'2026-07-31'::date,'104','102'),
  ('098-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES COMO GESTOR DEPORTIVO EN LA DISCIPLINA DE VOLEIBOL Y COORDINACION DEL PROGRAMA DE RECREACION , EN EL MARCO DEL PROYECTO DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA, MEDIANTE LOS GRUPOS DE INICIACIÓN, FORMACIÓN, JUVENILES Y MAYORES Y APOYO A LAS ESCUELAS DE FORMACIÓN DEPORTIVA..','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','8466565',27000000::bigint,4500000::bigint,'2026-02-02'::date,'2026-07-31'::date,'102','103'),
  ('099-2026','2026','PRESTACIÓN DE SERVICIOS EL FORTALECIMIENTO DE LOS GRUPOS DE INICIACIÓN Y ESCUELAS DE FORMACIÓN DEPORTIVA Y RECREACIÓN EN EL MARCO DEL PROYECTO DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRACTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','8459552',25200000::bigint,4200000::bigint,'2026-02-02'::date,'2026-07-31'::date,'111','104'),
  ('100-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA LA ASESORÍA JURÍDICA, TECNICA Y ADMINISTRATIVA PARA EL SANEAMIENTO PENSIONAL DEL MUNICIPIO DE FREDONIA PARA LA VIGENCIA 2026.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','901348545',100000000::bigint,0::bigint,'2026-02-02'::date,'2026-12-31'::date,'84','105'),
  ('101-2026','2026','PRESTAR SERVICIOS DE APOYO A LA GESTIÓN PARA LA MANIPULACIÓN DE ALIMENTOS, ASÍ COMO LABORES DE LIMPIEZA Y DESINFECCIÓN EN LA COCINA DEL CENTRO DE DETENCIÓN PREVENTIVA DEL MUNICIPIO DE FREDONIA Y EN LAS DEMÁS DEPENDENCIAS, SEDES, PROGRAMAS Y ACTIVIDADES DE LA ADMINISTRACIÓN MUNICIPAL QUE REQUIERAN ESTE TIPO DE APOYO, GARANTIZANDO EL CUMPLIMIENTO DE LAS NORMAS SANITARIAS VIGENTES.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','32161081',17500000::bigint,2500000::bigint,'2026-02-02'::date,'2026-08-31'::date,'83','106'),
  ('102-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA ACOMPAÑAR LAS DIFERENTES ACTIVIDADES Y PROCESOS DEL DESPACHO DE LA SECRETARÍA GENERAL Y DE GOBIERNO DEL MUNICIPIO DE FREDONIA DURANTE LA VIGENCIA 2026.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1041151342',24000000::bigint,3000000::bigint,'2026-02-02'::date,'2026-09-30'::date,'35','130'),
  ('103-2026','2026','CONVENIO DE ASOCIACIÓN PARA EL FORTALECIMIENTO DE LOS PROCESOS DE FORMACIÓN MUSICAL EN NIÑOS Y JÓVENES DEL MUNICIPIO DE FREDONIA, ANTIOQUIA, COMO UNA ESTRATEGIA PARA EL DESARROLLO INTEGRAL, LA CONSTRUCCIÓN DE TEJIDO SOCIAL Y LA PRESERVACIÓN DE LA IDENTIDAD CULTURAL.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','900873352',87600000::bigint,0::bigint,'2026-03-17'::date,'2026-11-30'::date,'98','107'),
  ('104-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN EL FOMENTO DE LA DANZA EN EL MARCO DEL PROYECTO DESARROLLO DE ESTRATEGIAS DE PROMOCIÓN Y ACCESO A PROCESOS ARTÍSTICOS Y CULTURALES EN EL MUNICIPIO DE FREDONIA PARA LA ATENCION A LA POBLACION ESCOLAR, JOVENES Y ADULTOS MAYORES DE LAS VEREDAS DE MURRAPAL, UVITAL, EL ZANCUDO, CALVARIO, HOYO FRIO, TRAVESIAS Y LA MINA, CONFORMACIÓN DE GRUPOS URBANOS CON JOVENES Y ADULTOS.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1000918837',17400000::bigint,2900000::bigint,'2026-02-02'::date,'2026-07-31'::date,'94','108'),
  ('105-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO EN LOS PROGRAMAS CULTURALES EN ATENCIÓN AL USUARIO, ORGANIZACIÓN DE ARCHIVO, SISTEMATIZACIÓN DE INFORMACIÓN Y APOYO A EVENTOS ARTISTICOS EN LA ZONA URBANA Y RURAL.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041148191',13260000::bigint,2210000::bigint,'2026-02-02'::date,'2026-07-31'::date,'95','109'),
  ('106-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA LA PROMOCIÓN Y ACCESO EFECTIVO DE LA POBLACIÓN A PROGRAMAS DE LECTURA, FORTALECIMIENTO DE LA RED DE BIBLIOTECAS EN EL MUNICIPIO DE FREDONIA EN ZONA URBANA Y RURAL.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041146853',17400000::bigint,2900000::bigint,'2026-02-02'::date,'2026-07-31'::date,'93','110'),
  ('107-2026','2026','PRESTACIÓN DE SERVICIOS PARA EL DESARROLLO DE ESTRATEGIAS ENMARCADAS EN EL PROYECTO DESARROLLO DE ESTRATEGIAS PARA EL FOMENTO DE PRÁCTICAS DEPORTIVAS Y RECREATIVAS EN EL MUNICIPIO DE FREDONIA EN EL COMPONENTE DE RECREACIÓN, PROMOCIÓN DEL JUEGO, SANO ESPARCIMIENTO, OCIO Y TIEMPO LIBRE DESDE LA LUDOTECA MUNICIPAL. EN LA ZONA URBANA Y RURAL','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1041151419',17400000::bigint,2900000::bigint,'2026-02-02'::date,'2026-07-31'::date,'96','111'),
  ('108-2026','2026','PRESTACIÓN DE SERVICIOS PARA EL FORTALECIMIENTO DE LOS PROGRAMAS CULTURALES Y ARTÍSTICOS DE PROYECCIÓN A LA COMUNIDAD Y ENLACE DE EVENTOS LOGISTICOS EN AL ZONA URBANA Y RURAL DEL MUNCIPIO DE FREDONIA PARA LA VIGENCIA 2026.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','8461709',17400000::bigint,2900000::bigint,'2026-02-02'::date,'2026-07-31'::date,'129','112'),
  ('109-2026','2026','PRESTAR SERVICIOS PROFESIONALES PARA COORDINAR, FORTALECER Y PROMOVER EL TURISMO DEL MUNICIPIO DE FREDONIA, MEDIANTE LA FORMULACIÓN, EJECUCIÓN Y SEGUIMIENTO DE ESTRATEGIAS ORIENTADAS AL DESARROLLO, PROMOCIÓN Y POSICIONAMIENTO DEL MUNICIPIO COMO DESTINO TURÍSTICO, ASÍ COMO APOYAR LA FORMULACIÓN, ESTRUCTURACIÓN Y EJECUCIÓN DEL MUSEO DE FREDONIA “RODRIGO ARENAS BETANCOURT”, CONTRIBUYENDO A SU CONSOLIDACIÓN COMO ESPACIO CULTURAL, PATRIMONIAL Y TURÍSTICO DEL MUNICIPIO DE FREDONIA','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','8464881',30000000::bigint,5000000::bigint,'2026-02-02'::date,'2026-07-30'::date,'128','113'),
  ('110-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN EL FOMENTO DE LA DANZA EN EL MARCO DEL PROYECTO DESARROLLO DE ESTRATEGIAS DE PROMOCIÓN Y ACCESO A PROCESOS ARTÍSTICOS Y CULTURALES EN EL MUNICIPIO DE FREDONIA PARA LA ATENCION A LA POBLACION ESCOLAR, JOVENES, Y ADULTOS MAYORES EN LAS VEREDAS LOS PALOMOS, CHAMUSCADOS, LA GARRUCHA, COMBIA GRANDE, JONAS, GRUPO DE RUMBA AEROBICA Y CATEGORIA DE INICIACION INFANTIL URBANA Y GRUPO SOL NACIENTE DEL MUNICIPIO','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','32160559',17400000::bigint,2900000::bigint,'2026-02-02'::date,'2026-07-31'::date,'97','114'),
  ('130-2026','2026','PRESTAR SERVICIOS DE APOYO A LA GESTIÓN PARA LA CREACIÓN, PRODUCCIÓN Y DIFUSIÓN DE CONTENIDO AUDIOVISUAL Y DIGITAL INSTITUCIONAL DEL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1007496731',17500000::bigint,2500000::bigint,'2026-02-02'::date,'2026-08-31'::date,'126','115'),
  ('131-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN CON EL FIN DE FORTALECER LA SECRETARIA GENERAL Y DE GOBIERNO EN EL COMPONENTE DE ORGANIZACIÓN Y LIMPIEZA DE LOS EDIFICIOS PÚBLICOS QUE HACEN PARTE DE LOS BIENES INMUBLES DEL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','21739806',19200000::bigint,2400000::bigint,'2026-02-02'::date,'2026-09-30'::date,'122','116'),
  ('132-2026','2026','CONTRATO DE PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN COMO ENCUESTADOR EN EL PROCESO DE RECOLECCIÓN DE INFORMACIÓN DEL SISBEN IV EN LA ZONA URBANA Y RURAL DEL MUNICIPIO DE FREDONIA, ANTIOQUIA.','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','8462155',16800000::bigint,2800000::bigint,'2026-02-02'::date,'2026-07-31'::date,'132','117'),
  ('133-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL DESARROLLO TÉCNICO Y OPERATIVO EN LA EJECUCIÓN DE LAS ACCIONES DEL PLAN DE SEGURIDAD Y SALUD EN EL TRABAJO DEL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1041148811',15000000::bigint,2500000::bigint,'2026-03-02'::date,'2026-08-31'::date,'124','118'),
  ('134-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES DE APOYO A LA GESTIÓN DEL CONTROL INTERNO DISCIPLINARIO PARA FORTALECER EL SEGUIMIENTO AL SUMARIO DISCIPLINARIO, GARANTIZAR EL CUMPLIMIENTO DEL DEBIDO PROCESO Y CONTRIBUIR A LA EFICIENCIA Y TRANSPARENCIA EN LA FUNCIÓN PÚBLICA DE LA ADMINISTRACIÓN MUNICIPAL DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','22052441',32000000::bigint,4000000::bigint,'2026-02-02'::date,'2026-09-30'::date,'127','119'),
  ('135-2026','2026','PRESTAR SERVICIOS DE APOYO A LA GESTIÓN PARA COADYUVAR EN EL PROCESO DE IDENTIFICACIÓN, ACTUALIZACIÓN Y FORMALIZACIÓN DE LOS BIENES INMUEBLES PROPIEDAD DEL MUNICIPIO DE FREDONIA','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','8462103',21000000::bigint,3000000::bigint,'2026-03-02'::date,'2026-09-30'::date,'125','120'),
  ('136-2026','2026','BRINDAR APOYO A LA ADMINISTRACIÓN MUNICIPAL EN LAS ACCIONES ORIENTADAS AL FORTALECIMIENTO DE LAS ESTRATEGIAS DE SEGURIDAD, CONVIVENCIA Y CONTROL ESTABLECIDAS EN EL CÓDIGO NACIONAL DE SEGURIDAD Y CONVIVENCIA CIUDADANA – LEY 1801 DE 2016, MEDIANTE ACTIVIDADES DE ORIENTACIÓN CIUDADANA Y ACOMPAÑAMIENTO A LA COMUNIDAD, DENTRO DEL PROGRAMA DE FORTALECIMIENTO INTEGRAL DE LA SEGURIDAD Y CONVIVENCIA DEL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','43413568',17500000::bigint,2500000::bigint,'2026-02-02'::date,'2026-08-31'::date,'121','121'),
  ('137-2026','2026','PRESTAR LOS SERVICIOS DE APOYO A LA GESTIÓN PARA ACOMPAÑAR EL PROCESO DE ACTUALIZACIÓN, ORGANIZACIÓN Y SOSTENIBILIDAD DEL INVENTARIO DE BIENES MUEBLES E INMUEBLES DEL MUNICIPIO DE FREDONIA.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','1041148253',25600000::bigint,3200000::bigint,'2026-02-02'::date,'2026-09-30'::date,'123','122'),
  ('138-2026','2026','PRESTACION DE SERVICIOS PROFESIONALES PARA EL SEGUIMIENTO, ARTICULACIÓN Y SOPORTE A LA EJECUCIÓN DE LOS INSTRUMENTOS DE PLANIFICACIÓN MUNICIPAL (PLAN DE DESARROLLO, PISCC, PLANES DE ACCIÓN, PLAN DE SEÑALIZACIÓN), LA PLATAFORMA SISPT Y EL APOYO AL MECANISMO DE PRESUPUESTO PARTICIPATIVO DEL MUNICIPIO DE FREDONIA, ANTIOQUIA','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1041147348',60500000::bigint,5500000::bigint,'2026-02-02'::date,'2026-12-31'::date,'131','123'),
  ('139-2026','2026','PRESTACIÓN DE SERVICIOS PROFESIONALES PARA LA SUPERVISIÓN TÉCNICA DE PROYECTOS DE OBRA PÚBLICA EJECUTADOS POR LA SECRETARÍA DE DESARROLLO TERRITORIAL, ASI COMO EL APOYO EN LA REVISIÓN, ANÁLISIS Y VERIFICACIÓN DE PROCESOS DE LICENCIAMIENTO URBANÍSTICO Y DEMÁS TRÁMITES RELACIONADOS.','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','42821811',28500000::bigint,5700000::bigint,'2026-02-02'::date,'2026-06-30'::date,'133','124'),
  ('140-2026','2026','CONTRATO DE PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL ACOMPAÑAMIENTO TÉCNICO Y OPERATIVO EN LA REALIZACIÓN DE VISITAS DE CAMPO URBANAS Y RURALES, ORIENTADAS AL APOYO DE LOS PROCESOS DE CONTROL URBANÍSTICO Y AL FORTALECIMIENTO CONTINUO DEL COMPONENTE DE GESTIÓN DEL RIESGO DE DESASTRES, ADELANTADOS POR EL MUNICIPIO DE FREDONIA, ANTIOQUIA','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1026134149',15000000::bigint,3000000::bigint,'2026-02-02'::date,'2026-06-30'::date,'137','152'),
  ('141-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN ADMINISTRATIVA EN EL ACOMPAÑAMIENTO, IMPLEMENTACIÓN Y EL DESARROLLO DEL COMPONENTE DE GESTION DEL RIESGO DE DESASTRES DEL MUNICIPIO DE FREDONIA, ANTIOQUIA.','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','1017184227',24600000::bigint,4100000::bigint,'2026-02-02'::date,'2026-07-31'::date,'135','153'),
  ('142-2026','2026','PRESTAR SERVICIOS DE APOYO A LA GESTIÓN DE CARÁCTER TÉCNICO Y LOGÍSTICO EN LAS DIFERENTES ACTIVIDADES DESARROLLADAS POR EL MUNICIPIO DE FREDONIA INCLUYENDO LA MESA MUNICIPAL DE VICTIMA, PROCESOS ELECTORALES, EVENTOS Y JORNADAS INSTITUCIONALES.','Contratacion Directa','Secretaria General y de Gobierno','Sara Sanchez Velez','43508671',60000000::bigint,0::bigint,'2026-03-03'::date,'2026-12-31'::date,'152','154'),
  ('143-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN COMO GESTOR CULTURAL PARA EL DESARROLLO DE ESTRATEGIAS DE PROMOCIÓN Y ACCESO A PROCESOS ARTÍSTICOS Y CULTURALES EN EL MUNICIPIO DE FREDONIA PARA LA VIGENCIA 2026.','Contratacion Directa','Secretaria de Bienestar Social','Yorledy Bibiana Vasquez Mesa','1000903280',24000000::bigint,4000000::bigint,'2026-02-03'::date,'2026-07-31'::date,'141','155'),
  ('145-2026','2026','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA APOYAR LAS ACTIVIDADES DE EDUCACIÓN AMBIENTAL, INCLUYENDO EL ACOMPAÑAMIENTO AL CIDEAM, EL APOYO A LOS PRAES, PROCEDAS Y DEMÁS ACCIONES ORIENTADAS A LA SENSIBILIZACIÓN AMBIENTAL Y AL FORTALECIMIENTO DE LA GESTIÓN AMBIENTAL MUNICIPAL.','Contratacion Directa','Secretaria de Desarrollo Territorial','Lucas Edilson Muñoz Moreno','32160572',17400000::bigint,2900000::bigint,'2026-02-03'::date,'2026-07-31'::date,'136','157')
),
resolved AS (
  SELECT
    s.numero,
    2026                    AS anio,
    s.objeto,
    s.modalidad             AS modalidad_seleccion,
    dep.id                  AS dependencia_id,
    ci.usuario_id           AS contratista_id,
    sup.id                  AS supervisor_id,
    s.valor_total,
    s.valor_mensual,
    s.fecha_inicio,
    s.fecha_fin,
    s.cdp,
    s.crp
  FROM source_data s
  -- Resolve dependencia by name (case-insensitive)
  JOIN public.dependencias dep
    ON lower(trim(dep.nombre)) = lower(trim(s.dependencia))
  -- Resolve contratista via staging table (must be activated)
  JOIN public.contratistas_importados ci
    ON ci.cedula = s.cedula
    AND ci.usuario_id IS NOT NULL     -- Only activated contractors
  -- Resolve supervisor by name (unaccent for accent-insensitive match)
  LEFT JOIN public.usuarios sup
    ON unaccent(lower(trim(sup.nombre_completo))) = unaccent(lower(trim(s.supervisor)))
    AND sup.rol = 'supervisor'
)
INSERT INTO public.contratos (
  numero, anio, objeto, modalidad_seleccion,
  dependencia_id, contratista_id, supervisor_id,
  valor_total, valor_mensual,
  fecha_inicio, fecha_fin,
  cdp, crp
)
SELECT
  numero, anio, objeto, modalidad_seleccion,
  dependencia_id, contratista_id, supervisor_id,
  valor_total, valor_mensual,
  fecha_inicio, fecha_fin,
  cdp, crp
FROM resolved
ON CONFLICT (numero) DO NOTHING;  -- Skip duplicates safely


-- ── STEP 4: Verify results ───────────────────────────────────
-- Run after Step 3 to see what was inserted vs skipped.
SELECT
  'Inserted' AS status,
  COUNT(*)   AS contratos
FROM public.contratos
WHERE anio = 2026

UNION ALL

SELECT
  'Still pending (no user account)' AS status,
  COUNT(*) AS contratos
FROM (VALUES
  ('002-2026','1037634680'),
  ('003-2026','8465567'),
  ('004-2026','21982267'),
  ('005-2026','1041146919'),
  ('007-2026','1041146358'),
  ('008-2026','1041147758'),
  ('009-2026','1020472944'),
  ('010-2026','8466043'),
  ('011-2026','1001371404'),
  ('012-2026','1128396512'),
  ('013-2026','1041150650'),
  ('014-2026','32205180'),
  ('015-2026','43414846'),
  ('017-2026','70784232'),
  ('018-2026','42730628'),
  ('019-2026','1000766011'),
  ('020-2026','8430584'),
  ('021-2026','1017276694'),
  ('024-2026','43806393'),
  ('025-2026','1037640364'),
  ('026-2026','1007633889'),
  ('027-2026','32160770'),
  ('028-2026','21737896'),
  ('029-2026','1152434726'),
  ('030-2026','1152434294'),
  ('031-2026','1041151216'),
  ('032-2026','1033343280'),
  ('033-2026','21792489'),
  ('034-2026','1152203945'),
  ('035-2026','1032257037'),
  ('036-2026','70082275'),
  ('037-2026','8464867'),
  ('038-2026','1041150322'),
  ('039-2026','98710816'),
  ('040-2026','98710816'),
  ('041-2026','1038360521'),
  ('042-2026','1041146425'),
  ('043-2026','1041149852'),
  ('044-2026','70230420'),
  ('045-2026','1000940222'),
  ('046-2026','1041150263'),
  ('047-2026','8460397'),
  ('048-2026','1007496848'),
  ('049-2026','1007681134'),
  ('050-2026','1001359851'),
  ('051-2026','8464986'),
  ('052-2026','1026152027'),
  ('053-2026','1041146117'),
  ('054-2026','1046669032'),
  ('055-2026','32160490'),
  ('056-2026','1015332771'),
  ('057-2026','32160996'),
  ('058-2026','1041146326'),
  ('059-2026','1007347664'),
  ('064-2026','1041149202'),
  ('065-2026','1041149023'),
  ('066-2026','3455047'),
  ('067-2026','32161152'),
  ('068-2026','42732594'),
  ('069-2026','1041150069'),
  ('070-2026','1152200195'),
  ('071-2026','8464638'),
  ('073-2026','8465244'),
  ('074-2026','8462873'),
  ('075-2026','8463936'),
  ('076-2026','1041148101'),
  ('077-2026','1007284916'),
  ('078-2026','32161150'),
  ('079-2026','1007496531'),
  ('082-2026','32160617'),
  ('083-3036','8465629'),
  ('084-2026','1033342249'),
  ('085-2026','1007496693'),
  ('086-2026','1041148995'),
  ('087-2026','8466487'),
  ('088-2026','1000086463'),
  ('089-2026','1045112814'),
  ('090-2026','1041148232'),
  ('092-2026','8460907'),
  ('093-2026','1007310617'),
  ('094-2026','8465684'),
  ('095-2026','1001237715'),
  ('096-2026','21738072'),
  ('097-2026','21739967'),
  ('098-2026','8466565'),
  ('099-2026','8459552'),
  ('100-2026','901348545'),
  ('101-2026','32161081'),
  ('102-2026','1041151342'),
  ('103-2026','900873352'),
  ('104-2026','1000918837'),
  ('105-2026','1041148191'),
  ('106-2026','1041146853'),
  ('107-2026','1041151419'),
  ('108-2026','8461709'),
  ('109-2026','8464881'),
  ('110-2026','32160559'),
  ('130-2026','1007496731'),
  ('131-2026','21739806'),
  ('132-2026','8462155'),
  ('133-2026','1041148811'),
  ('134-2026','22052441'),
  ('135-2026','8462103'),
  ('136-2026','43413568'),
  ('137-2026','1041148253'),
  ('138-2026','1041147348'),
  ('139-2026','42821811'),
  ('140-2026','1026134149'),
  ('141-2026','1017184227'),
  ('142-2026','43508671'),
  ('143-2026','1000903280'),
  ('145-2026','32160572')
) AS d(numero, cedula)
LEFT JOIN public.contratos c ON c.numero = d.numero
LEFT JOIN public.contratistas_importados ci ON ci.cedula = d.cedula
WHERE c.id IS NULL  -- not yet inserted
  AND (ci.usuario_id IS NULL OR ci.activado = FALSE);

-- Done. 🎉
-- Expected: up to 112 contracts inserted (minus those with inactive accounts).
-- Run Step 3 again after activating more accounts to insert the pending ones.

