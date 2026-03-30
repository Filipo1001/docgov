-- =============================================================
-- Migration 009: plazo_dias + contratos_excel staging table
-- =============================================================
--
-- CHANGES:
--   1. Add plazo_dias (INTEGER) to contratos — replaces plazo_meses as primary field
--   2. Add valor_letras_mensual to contratos (was missing from 002)
--   3. Populate plazo_dias from actual date range for existing rows
--   4. Create contratos_excel staging table with all 112 Excel rows
--      (used by the creation form to auto-fill fields by contract number)
-- =============================================================

-- ── 1. New columns on contratos ──────────────────────────────

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS plazo_dias          INTEGER,    -- actual days from Excel
  ADD COLUMN IF NOT EXISTS valor_letras_mensual TEXT;      -- was missing from migration 002

-- Populate plazo_dias from existing date ranges where possible
UPDATE contratos
SET plazo_dias = (fecha_fin::date - fecha_inicio::date)
WHERE plazo_dias IS NULL
  AND fecha_inicio IS NOT NULL
  AND fecha_fin    IS NOT NULL;

-- Fallback: derive from plazo_meses * 30 for rows without dates
UPDATE contratos
SET plazo_dias = plazo_meses * 30
WHERE plazo_dias IS NULL
  AND plazo_meses IS NOT NULL;

-- ── 2. contratos_excel staging table ─────────────────────────
-- Stores the raw Excel data for ALL 112 contracts (including those
-- whose contratistas haven't been activated yet).
-- The creation form queries this by contract number to auto-fill.

CREATE TABLE IF NOT EXISTS public.contratos_excel (
  numero              TEXT PRIMARY KEY,
  cedula_contratista  TEXT,
  nombre_contratista  TEXT,
  supervisor_nombre   TEXT,
  dependencia_nombre  TEXT,
  objeto              TEXT,
  modalidad_seleccion TEXT,
  valor_total         BIGINT,
  valor_mensual       BIGINT,
  fecha_inicio        DATE,
  fecha_fin           DATE,
  plazo_dias          INTEGER,
  cdp                 TEXT,
  crp                 TEXT
);

-- RLS: admin can read (used by form lookup)
ALTER TABLE public.contratos_excel ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "contratos_excel_admin_read"
    ON public.contratos_excel FOR SELECT
    USING ((SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Populate from Excel data ───────────────────────────────

INSERT INTO public.contratos_excel
  (numero, cedula_contratista, nombre_contratista, supervisor_nombre, dependencia_nombre,
   objeto, modalidad_seleccion, valor_total, valor_mensual, fecha_inicio, fecha_fin, plazo_dias, cdp, crp)
VALUES
  ('002-2026','1037634680','Andrea Londoño Taborda','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTAR LOS SERVICIOS PROFESIONALES PARA LA ESTRUCTURACIÓN, DESARROLLO TECNICO Y METODOLOGICO DE LOS PROCESOS DE CONTRATACIÓN EN LA FASE PRECONTRACTUAL, CONTRACTUAL Y TERMINACIÓN EN LA VIGENCIA 2026','Contratacion Directa',49600000,6200000,'2026-01-14','2026-08-31',228,'1','1'),
  ('003-2026','8465567','Daniel Alejandro Marin Serna','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTAR LOS SERVICIOS PROFESIONALES COMO ADMINISTRADOR PÚBLICO PARA APOYAR LA GESTIÓN ADMINISTRATIVA EN EL ACOMPAÑAMIENTO TÉCNICO, LA PLANEACIÓN, EJECUCIÓN, SEGUIMIENTO Y EVALUACIÓN DE LOS PROCESOS DE LA ENTIDAD; SEGUIMIENTO A PLANES, PROGRAMAS Y PROYECTOS INSTITUCIONALES PARA LA VIGENCIA 2026','Contratacion Directa',48800000,6100000,'2026-01-14','2026-08-31',228,'3','3'),
  ('004-2026','21982267','Patricia Eugenia Zapata Diez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN EL REPORTE DE LA INFORMACION CONTRACTUAL DEL MUNICIPIO DE FREDONIA A TRAVÉS DE LA PLATAFORMA QUE ESTABLEZCA LA CONTRALORÍA GENERAL DE ANTIOQUIA DURANTE LA VIGENCIA 2026','Contratacion Directa',24000000,3000000,'2026-01-16','2026-08-31',226,'16','4'),
  ('005-2026','1041146919','Deicy Viviana Marin Gomez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTAR LOS SERVICIOS DE APOYO A LA GESTION EN EL AREA DE SERVICIOS ADMINISTRATIVOS COMO CONTRIBUCIÓN AL MEJORAMIENTO DE LOS PROCEDIMIENTOS ASISTENCIALES RELACIONADOS CON LAS HISTORIAS LABORALES Y RIESGOS LABORALES, AL IGUAL QUE LA ADMINISTRACIÓN DEL SISTEMA DE INFORMACIÓN Y GESTIÓN DEL EMPLEO PÚBLICO DE LOS FUNCIONARIOS Y CONTRATISTAS DEL MUNICIPIO DE FREDONIA','Contratacion Directa',21600000,2700000,'2026-01-16','2026-08-31',226,'15','5'),
  ('007-2026','1041146358','Juliana Palacio Mazo','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN COMO ENLACE PERMANENTE ANTE LA UNIDAD DE VICTIMAS DEL CONFLICTO ARMADO PARA LA ENTREGA DE INFORMACIÓN Y ORIENTACIÓN A LAS VICTIMAS, SOBRE LA RUTA DE ATENCIÓN, ASISTENCIA Y REPARACIÓN INTEGRAL EN EL MUNICIPIO DE FREDONIA DURANTE LA VIGENCIA 2026 Y ASESORAR, ORIENTAR Y DESARROLLO DE LAS ACCIONES DE PROMOCIÓN DE LOS DERECHOS HUMANOS, CONSEJO MUNICIPAL DE PAZ, JUECES DE PAZ, ALERTAS TEMPRANAS, CAPACITACIÓN Y FORMACIÓN EN DERECHOS HUMANOS, AL IGUAL QUE APOYO EN LO QUE RESPECTA AL COMPONENTE HUMANITARIO EN LA CÁRCEL EN EL MUNICIPIO DE FREDONIA.','Contratacion Directa',27000000,3500000,'2026-01-19','2026-08-31',222,'14','7'),
  ('008-2026','1041147758','Juan David Mesa Bohorquez','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS PROFESIONALES COMO APOYO TÉCNICO EN CONTRATACIÓN PARA LA SECRETARÍA DE DESARROLLO TERRITORIAL','Contratacion Directa',54276000,4523000,'2026-01-20','2026-12-31',342,'17','8'),
  ('009-2026','1020472944','Catherine Posada Chavarria','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS PROFESIONALES EN PLANEACIÓN Y ORDENAMIENTO TERRITORIAL','Contratacion Directa',62400000,5200000,'2026-01-20','2026-12-31',342,'21','9'),
  ('010-2026','8466043','Daniel Augusto Muñoz Monsalve','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN DESARROLLO TERRITORIAL','Contratacion Directa',44400000,3900000,'2026-01-20','2026-12-31',342,'24','10'),
  ('011-2026','1001371404','Juan Sebastian Blandon Hurtado','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN DESARROLLO TERRITORIAL','Contratacion Directa',22800000,3800000,'2026-01-20','2026-06-30',162,'23','11'),
  ('012-2026','1128396512','Hector Fabio Hernandez Rendon','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS PROFESIONALES EN DESARROLLO TERRITORIAL','Contratacion Directa',28800000,5250000,'2026-01-20','2026-06-30',162,'20','12'),
  ('013-2026','1041150650','Manuela Adarve Villada','Ivan Montoya Murillo','Secretaria de Hacienda','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN HACIENDA MUNICIPAL','Contratacion Directa',37200000,3100000,'2026-01-20','2026-12-31',342,'7','13'),
  ('014-2026','32205180','Ana Milena Valencia Hoyos','Ivan Montoya Murillo','Secretaria de Hacienda','PRESTACIÓN DE SERVICIOS PROFESIONALES EN HACIENDA MUNICIPAL','Contratacion Directa',44520000,3710000,'2026-01-20','2026-12-31',342,'6','14'),
  ('015-2026','43414846','Luz Doris Valencia Betancur','Ivan Montoya Murillo','Secretaria de Hacienda','PRESTACIÓN DE SERVICIOS PROFESIONALES EN HACIENDA MUNICIPAL','Contratacion Directa',45000000,0,'2026-01-20','2026-12-31',342,'12','15'),
  ('017-2026','70784232','Herney Alonso Giraldo Orozco','Ivan Montoya Murillo','Secretaria de Hacienda','PRESTACIÓN DE SERVICIOS PROFESIONALES EN HACIENDA MUNICIPAL','Contratacion Directa',78000000,6500000,'2026-01-20','2026-12-31',342,'5','17'),
  ('018-2026','42730628','Maria Fanny Cañaveral Piedrahita','Ivan Montoya Murillo','Secretaria de Hacienda','PRESTACIÓN DE SERVICIOS PROFESIONALES EN HACIENDA MUNICIPAL','Contratacion Directa',82800000,6900000,'2026-01-20','2026-12-31',342,'4','18'),
  ('019-2026','1000766011','Juan Pablo Vargas Serna','Ivan Montoya Murillo','Secretaria de Hacienda','PRESTACIÓN DE SERVICIOS PROFESIONALES EN HACIENDA MUNICIPAL','Contratacion Directa',63600000,5300000,'2026-01-20','2026-12-31',342,'11','19'),
  ('020-2026','8430584','Julio Hernan Atencia Florez','Ivan Montoya Murillo','Secretaria de Hacienda','PRESTACIÓN DE SERVICIOS PROFESIONALES EN HACIENDA MUNICIPAL','Contratacion Directa',68794000,6254000,'2026-02-02','2026-12-31',330,'10','20'),
  ('021-2026','1017276694','Manuela Rodriguez Higuita','Ivan Montoya Murillo','Secretaria de Hacienda','PRESTACIÓN DE SERVICIOS PROFESIONALES EN HACIENDA MUNICIPAL','Contratacion Directa',60500000,5500000,'2026-02-02','2026-12-31',330,'13','21'),
  ('024-2026','43806393','Adriana Maria Otalvaro Muriel','Biviana Inmaculada Hoyos Mondragon','Comisaria de Familia','PRESTACIÓN DE SERVICIOS PROFESIONALES EN COMISARÍA DE FAMILIA','Contratacion Directa',24999993,2777777,'2026-01-22','2026-09-30',250,'26','24'),
  ('025-2026','1037640364','Valentina Gallego Carvajal','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',22720000,2840000,'2026-02-18','2026-09-30',240,'37','25'),
  ('026-2026','1007633889','Junior Vega Ardila','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',19200000,2400000,'2026-02-02','2026-09-30',240,'30','26'),
  ('027-2026','32160770','Maritza Liliana Mejia Ramirez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',22400000,2800000,'2026-02-02','2026-09-30',240,'31','27'),
  ('028-2026','21737896','Isabel Cristina Mejia De Arango','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS PROFESIONALES EN SECRETARÍA GENERAL','Contratacion Directa',36800000,4600000,'2026-01-21','2026-08-31',221,'27','28'),
  ('029-2026','1152434726','Andres Felipe Velez Toro','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS PROFESIONALES EN DESARROLLO TERRITORIAL','Contratacion Directa',66000000,5800000,'2026-01-21','2026-12-31',341,'22','29'),
  ('030-2026','1152434294','Luisa Maria Botero Monsalve','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS PROFESIONALES EN DESARROLLO TERRITORIAL','Contratacion Directa',48000000,8000000,'2026-01-21','2026-06-30',161,'42','30'),
  ('031-2026','1041151216','Valentina Restrepo Montoya','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN DESARROLLO TERRITORIAL','Contratacion Directa',31350000,2850000,'2026-02-02','2026-12-31',330,'39','31'),
  ('032-2026','1033343280','Jhonatan Danilo Suaza Torres','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN DESARROLLO TERRITORIAL','Contratacion Directa',39600000,3600000,'2026-02-02','2026-12-31',330,'41','32'),
  ('033-2026','21792489','Claudia Llaneth Arboleda Castrillon','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN DESARROLLO TERRITORIAL','Contratacion Directa',27500000,2500000,'2026-02-02','2026-12-31',330,'40','33'),
  ('034-2026','1152203945','Sebastian Ortiz Valle','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',28000000,3500000,'2026-02-02','2026-09-30',240,'34','34'),
  ('035-2026','1032257037','Andres Felipe Guerra Osorio','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS PROFESIONALES EN DESARROLLO TERRITORIAL','Contratacion Directa',25600000,4800000,'2026-01-22','2026-06-30',160,'25','35'),
  ('036-2026','70082275','Oscar de Jesus Marin Lopez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS PROFESIONALES EN SECRETARÍA GENERAL','Contratacion Directa',34400000,4300000,'2026-02-02','2026-09-30',240,'47','36'),
  ('037-2026','8464867','Diego Alejandro Arredondo Vasquez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',32400000,4050000,'2026-02-02','2026-09-30',240,'29','37'),
  ('038-2026','1041150322','Jorge Mario Escobar Hernandez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',35200000,4400000,'2026-02-02','2026-09-30',240,'45','38'),
  ('039-2026','98710816','Alberth Jhonathan Gomez Henao','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS PROFESIONALES EN BIENESTAR SOCIAL','Contratacion Directa',66000000,5750000,'2026-01-24','2026-12-31',338,'64','39'),
  ('040-2026','98710816','Alberth Jhonathan Gomez Henao','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS PROFESIONALES EN BIENESTAR SOCIAL','Contratacion Directa',20000000,5000000,'2026-03-02','2026-06-30',158,'63','40'),
  ('041-2026','1038360521','Leidy Yohana Rodriguez Porras','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS PROFESIONALES EN BIENESTAR SOCIAL','Contratacion Directa',84000000,7300000,'2026-01-24','2026-12-30',188,'62','41'),
  ('042-2026','1041146425','Diana Carolina Aguilar Isaza','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',28980000,4600000,'2026-01-24','2026-07-31',188,'65','42'),
  ('043-2026','1041149852','Maria Fernanda Agudelo Sampedro','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',20160000,3200000,'2026-01-24','2026-07-31',240,'66','43'),
  ('044-2026','70230420','Alexander de Jesus Olaya Zapata','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',32000000,4000000,'2026-02-02','2026-09-30',240,'50','44'),
  ('045-2026','1000940222','Mariana Salgado Cuellar','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',32000000,4000000,'2026-02-02','2026-09-30',240,'51','45'),
  ('046-2026','1041150263','Maria Alejandra Aguirre Toro','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',30400000,3800000,'2026-02-02','2026-09-30',240,'46','46'),
  ('047-2026','8460397','Hector Hernan Jimenez Arenas','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',32000000,4000000,'2026-02-02','2026-09-30',240,'28','47'),
  ('048-2026','1007496848','Yesli Parra Velez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',22400000,2800000,'2026-02-02','2026-09-30',240,'72','48'),
  ('049-2026','1007681134','Maria Alejandra Acevedo Lopez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',22400000,2800000,'2026-02-02','2026-09-30',240,'73','49'),
  ('050-2026','1001359851','Ximena Restrepo Betancur','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',19600000,2800000,'2026-03-02','2026-09-30',210,'54','50'),
  ('051-2026','8464986','Jorge Ignacio Zea Gallego','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS PROFESIONALES EN BIENESTAR SOCIAL','Contratacion Directa',28800000,4800000,'2026-02-02','2026-07-31',180,'55','51'),
  ('052-2026','1026152027','Maria Camila Bedoya Marroquin','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',24000000,4000000,'2026-02-02','2026-07-31',180,'56','52'),
  ('053-2026','1041146117','Liliana Marcela Betancur Montoya','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',26400000,4400000,'2026-02-02','2026-07-31',180,'58','53'),
  ('054-2026','1046669032','Manuela Franco Ramirez','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',27000000,4500000,'2026-02-02','2026-07-31',180,'57','54'),
  ('055-2026','32160490','Yudy Andrea Granados Gallego','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',31900000,2900000,'2026-02-02','2026-12-30',330,'59','55'),
  ('056-2026','1015332771','Angie Gimena Bolivar Usuga','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',19200000,2400000,'2026-02-02','2026-09-30',240,'48','56'),
  ('057-2026','32160996','Maria Cristina Gonzalez Jaramillo','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',20000000,2500000,'2026-02-02','2026-09-30',240,'49','57'),
  ('058-2026','1041146326','John Fredy Restrepo Calle','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',28000000,3500000,'2026-02-02','2026-09-30',240,'32','95'),
  ('059-2026','1007347664','Marian Blandon Toro','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',19200000,2400000,'2026-03-02','2026-10-31',240,'53','125'),
  ('064-2026','1041149202','Yeison Albeiro Martinez Echeverri','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',23200000,2900000,'2026-02-02','2026-09-30',240,'18','58'),
  ('065-2026','1041149023','Daniel Fernando Zuluaga Penagos','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',18450000,4100000,'2026-02-02','2026-06-15',135,'69','59'),
  ('066-2026','3455047','Alberto Leon Restrepo Galeano','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',13950000,3100000,'2026-02-02','2026-06-15',135,'70','60'),
  ('067-2026','32161152','Deisy Bibiana Montoya Betancur','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',13950000,3100000,'2026-02-02','2026-06-15',135,'71','61'),
  ('068-2026','42732594','Gladys Amparo Sanchez Rios','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',15000000,2500000,'2026-02-02','2026-07-31',180,'67','62'),
  ('069-2026','1041150069','Maria Alejandra Londono Lopez','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',33000000,3000000,'2026-02-02','2026-12-30',330,'68','63'),
  ('070-2026','1152200195','Jessica Paola Zapata Sepulveda','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',18450000,4100000,'2026-02-02','2026-06-15',135,'140','136'),
  ('071-2026','8464638','Diego Alejandro Velez Rodriguez','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN DESARROLLO TERRITORIAL','Contratacion Directa',35200000,3200000,'2026-02-02','2026-12-30',330,'38','71'),
  ('073-2026','8465244','Diego Alejandro Garcia Echeverri','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',32000000,4000000,'2026-02-02','2026-09-30',240,'80','73'),
  ('074-2026','8462873','Jhon Jaime Velez Rodriguez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',20000000,2500000,'2026-02-02','2026-09-30',240,'82','74'),
  ('075-2026','8463936','Miguel Angel Valenzuela Soto','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN DESARROLLO TERRITORIAL','Contratacion Directa',15000000,3000000,'2026-02-02','2026-06-30',240,'134','126'),
  ('076-2026','1041148101','Laura Cristina Vallejo Henao','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',13050000,2900000,'2026-02-02','2026-06-15',135,'92','76'),
  ('077-2026','1007284916','Maryory Muñoz Muñoz','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',17500000,2500000,'2026-03-02','2026-09-30',210,'81','77'),
  ('078-2026','32161150','Maria Isabel Vasquez Gallego','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',19200000,3200000,'2026-02-02','2026-07-31',180,'91','127'),
  ('079-2026','1007496531','Valeria Moncada Acevedo','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',19200000,3200000,'2026-02-02','2026-07-31',180,'90','78'),
  ('082-2026','32160617','Adriana Isabel Obando Garcia','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',13260000,2210000,'2026-02-02','2026-07-31',180,'60','79'),
  ('083-3036','8465629','Edison Andres Quintero','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',21000000,3500000,'2026-02-02','2026-07-31',180,'88','128'),
  ('084-2026','1033342249','Jose Miguel Quintero Soto','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',21000000,3500000,'2026-02-02','2026-07-31',180,'89','80'),
  ('085-2026','1007496693','Manuela Valencia Ochoa','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',22800000,3800000,'2026-02-02','2026-07-31',180,'113','81'),
  ('086-2026','1041148995','Jeison Andres Garcia Gomez','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS PROFESIONALES EN BIENESTAR SOCIAL','Contratacion Directa',49500000,4500000,'2026-02-02','2026-12-30',330,'106','75'),
  ('087-2026','8466487','Jhon David Betancur Muñoz','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',17400000,2900000,'2026-02-02','2026-07-31',180,'112','68'),
  ('088-2026','1000086463','Alejandro Monsalve Mosquera','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',19800000,3300000,'2026-02-02','2026-07-31',180,'108','69'),
  ('089-2026','1045112814','Yenifer Tatiana Velez Restrepo','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',19800000,3300000,'2026-02-02','2026-07-31',180,'109','70'),
  ('090-2026','1041148232','Sebastian Carmona Estrada','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS PROFESIONALES EN BIENESTAR SOCIAL','Contratacion Directa',25800000,4300000,'2026-02-02','2026-07-31',180,'101','129'),
  ('092-2026','8460907','Gabriel Ignacio Montoya Valdes','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',17400000,2900000,'2026-02-02','2026-07-31',180,'114','97'),
  ('093-2026','1007310617','Lucas Betancur Puerta','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',17400000,2900000,'2026-02-02','2026-07-31',180,'103','98'),
  ('094-2026','8465684','Victor Mario Restrepo Bedoya','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',17400000,2900000,'2026-02-02','2026-07-31',180,'105','99'),
  ('095-2026','1001237715','Daniela Urrego Sampedro','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',19800000,3300000,'2026-02-02','2026-07-31',180,'110','100'),
  ('096-2026','21738072','Margarita Lopez Bedoya','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',14400000,2400000,'2026-02-02','2026-07-31',180,'107','101'),
  ('097-2026','21739967','Lina Marcela Betancur Arroyave','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',17400000,2900000,'2026-02-02','2026-07-31',180,'104','102'),
  ('098-2026','8466565','Jose David Arenas Bustamante','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS PROFESIONALES EN BIENESTAR SOCIAL','Contratacion Directa',27000000,4500000,'2026-02-02','2026-07-31',180,'102','103'),
  ('099-2026','8459552','Jose Alberto Arboleda Granda','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS PROFESIONALES EN BIENESTAR SOCIAL','Contratacion Directa',25200000,4200000,'2026-02-02','2026-07-31',180,'111','104'),
  ('100-2026','901348545','Consultores en Seguridad Social Premium S.A.S','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS EN SEGURIDAD SOCIAL PARA CONTRATISTAS DEL MUNICIPIO','Contratacion Directa',100000000,0,'2026-02-02','2026-12-31',330,'84','105'),
  ('101-2026','32161081','Eliana Patricia Castañeda Castañeda','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS PROFESIONALES EN SECRETARÍA GENERAL','Contratacion Directa',17500000,2500000,'2026-02-02','2026-08-31',210,'83','106'),
  ('102-2026','1041151342','Karen Yineth Puerta Lopez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',24000000,3000000,'2026-02-02','2026-09-30',240,'35','130'),
  ('103-2026','900873352','Fundacion Oro Molido','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','CONVENIO O CONTRATO CON FUNDACIÓN ORO MOLIDO PARA PROGRAMAS DE BIENESTAR SOCIAL','Contratacion Directa',87600000,0,'2026-03-17','2026-11-30',300,'98','107'),
  ('104-2026','1000918837','Carlos Arturo Valencia Arango','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',17400000,2900000,'2026-02-02','2026-07-31',180,'94','108'),
  ('105-2026','1041148191','Leidy Johana Estrada Quintero','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',13260000,2210000,'2026-02-02','2026-07-31',180,'95','109'),
  ('106-2026','1041146853','Deisy Tatiana Parra Soto','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',17400000,2900000,'2026-02-02','2026-07-31',180,'93','110'),
  ('107-2026','1041151419','Mariana Tobon Correa','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',17400000,2900000,'2026-02-02','2026-07-31',180,'96','111'),
  ('108-2026','8461709','Wilson Dario Velasquez Diez','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',17400000,2900000,'2026-02-02','2026-07-31',180,'129','112'),
  ('109-2026','8464881','Carlos Augusto Bedoya Hoyos','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS PROFESIONALES EN BIENESTAR SOCIAL','Contratacion Directa',30000000,5000000,'2026-02-02','2026-07-30',180,'128','113'),
  ('110-2026','32160559','Sofia Eugenia Gaviria Muñoz','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',17400000,2900000,'2026-02-02','2026-07-31',180,'97','114'),
  ('130-2026','1007496731','Laura Tatiana Zapata Betancur','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',17500000,2500000,'2026-02-02','2026-08-31',210,'126','115'),
  ('131-2026','21739806','Eliana Maria Deossa Cadavid','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',19200000,2400000,'2026-02-02','2026-09-30',240,'122','116'),
  ('132-2026','8462155','Jorge Ivan Muñoz Gomez','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN DESARROLLO TERRITORIAL','Contratacion Directa',16800000,2800000,'2026-02-02','2026-07-31',180,'132','117'),
  ('133-2026','1041148811','Eliana Marcela Gallego Grajales','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',15000000,2500000,'2026-03-02','2026-08-31',180,'124','118'),
  ('134-2026','22052441','Margarita Ines Quintero Florez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',32000000,4000000,'2026-02-02','2026-09-30',240,'127','119'),
  ('135-2026','8462103','Fernando Leon Gallego Valencia','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS PROFESIONALES EN SECRETARÍA GENERAL','Contratacion Directa',21000000,3000000,'2026-03-02','2026-09-30',210,'125','120'),
  ('136-2026','43413568','Luz Adriana Jimenez Gomez','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',17500000,2500000,'2026-02-02','2026-08-31',210,'121','121'),
  ('137-2026','1041148253','Juan Esteban Restrepo Puerta','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN SECRETARÍA GENERAL','Contratacion Directa',25600000,3200000,'2026-02-02','2026-09-30',240,'123','122'),
  ('138-2026','1041147348','Nelson Alejandro Vallejo Garcia','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS PROFESIONALES EN DESARROLLO TERRITORIAL','Contratacion Directa',60500000,5500000,'2026-02-02','2026-12-31',330,'131','123'),
  ('139-2026','42821811','Nuveida Cecilia Restrepo Nieto','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS PROFESIONALES EN DESARROLLO TERRITORIAL','Contratacion Directa',28500000,5700000,'2026-02-02','2026-06-30',150,'133','124'),
  ('140-2026','1026134149','Sebastian Gomez Garcia','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN DESARROLLO TERRITORIAL','Contratacion Directa',15000000,3000000,'2026-02-02','2026-06-30',150,'137','152'),
  ('141-2026','1017184227','Ivan Dario Ramirez Patiño','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS PROFESIONALES EN DESARROLLO TERRITORIAL','Contratacion Directa',24600000,4100000,'2026-02-02','2026-07-31',180,'135','153'),
  ('142-2026','43508671','Elma Grisales Ospina','Sara Sanchez Velez','Secretaria General y de Gobierno','PRESTACIÓN DE SERVICIOS PROFESIONALES EN SECRETARÍA GENERAL','Contratacion Directa',60000000,0,'2026-03-03','2026-12-31',289,'152','154'),
  ('143-2026','1000903280','Jose Luis Echeverri Bermudez','Yorledy Bibiana Vasquez Mesa','Secretaria de Bienestar Social','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN BIENESTAR SOCIAL','Contratacion Directa',24000000,4000000,'2026-02-03','2026-07-31',180,'141','155'),
  ('145-2026','32160572','Sandra Patricia Velasquez Castañeda','Lucas Edilson Muñoz Moreno','Secretaria de Desarrollo Territorial','PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN EN DESARROLLO TERRITORIAL','Contratacion Directa',17400000,2900000,'2026-02-03','2026-07-31',180,'136','157')
ON CONFLICT (numero) DO NOTHING;
