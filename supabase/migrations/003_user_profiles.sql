-- ============================================================
-- Migration 003: Extended user profiles + photo support
--                + import of 113 contractors from Excel
-- Run in: Supabase Dashboard → SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT)
-- ============================================================

-- ── 1. New columns on usuarios ────────────────────────────────

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS foto_url       TEXT,
  ADD COLUMN IF NOT EXISTS rh             TEXT,          -- e.g. 'O+', 'A-'
  ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'CC',  -- CC | NIT | Pasaporte
  ADD COLUMN IF NOT EXISTS dependencia_id UUID REFERENCES public.dependencias(id) ON DELETE SET NULL;

-- ── 2. Storage bucket for avatars ────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,   -- 5 MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (anyone can see avatars)
DO $$ BEGIN
  CREATE POLICY "avatars_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admin can upload any avatar
DO $$ BEGIN
  CREATE POLICY "avatars_admin_write" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'avatars' AND
      (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admin can delete any avatar
DO $$ BEGIN
  CREATE POLICY "avatars_admin_delete" ON storage.objects
    FOR DELETE USING (
      bucket_id = 'avatars' AND
      (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Staging table for imported contractors ─────────────────
-- Admin creates actual auth accounts from this table via the UI.

CREATE TABLE IF NOT EXISTS public.contratistas_importados (
  id            SERIAL PRIMARY KEY,
  nombre_completo TEXT NOT NULL,
  cedula        TEXT NOT NULL UNIQUE,
  cargo         TEXT DEFAULT 'Contratista',
  secretaria    TEXT,                          -- raw department name from Excel
  activado      BOOLEAN NOT NULL DEFAULT FALSE,
  usuario_id    UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow admin to read/update this table
ALTER TABLE public.contratistas_importados ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "importados_admin_all" ON public.contratistas_importados
    FOR ALL USING ((SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. Insert 113 unique valid contractors ────────────────────
-- Excluded: row 37 (exact duplicate of row 36)
--           row 72 ('ANULADO')
-- Department casing normalized to title case.

INSERT INTO public.contratistas_importados (nombre_completo, cedula, cargo, secretaria) VALUES
  ('Andrea Londoño Taborda',              '1037634680', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Daniel Alejandro Marin Serna',        '8465567',    'Contratista', 'Secretaria General y de Gobierno'),
  ('Patricia Eugenia Zapata Diez',        '21982267',   'Contratista', 'Secretaria General y de Gobierno'),
  ('Deicy Viviana Marin Gomez',           '1041146919', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Juliana Palacio Mazo',                '1041146358', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Juan David Mesa Bohorquez',           '1041147758', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Catherine Posada Chavarria',          '1020472944', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Daniel Augusto Muñoz Monsalve',       '8466043',    'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Juan Sebastian Blandon Hurtado',      '1001371404', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Hector Fabio Hernandez Rendon',       '1128396512', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Manuela Adarve Villada',              '1041150650', 'Contratista', 'Secretaria de Hacienda'),
  ('Ana Milena Valencia Hoyos',           '32205180',   'Contratista', 'Secretaria de Hacienda'),
  ('Luz Doris Valencia Betancur',         '43414846',   'Contratista', 'Secretaria de Hacienda'),
  ('Herney Alonso Giraldo Orozco',        '70784232',   'Contratista', 'Secretaria de Hacienda'),
  ('Maria Fanny Cañaveral Piedrahita',    '42730628',   'Contratista', 'Secretaria de Hacienda'),
  ('Juan Pablo Vargas Serna',             '1000766011', 'Contratista', 'Secretaria de Hacienda'),
  ('Julio Hernan Atencia Florez',         '8430584',    'Contratista', 'Secretaria de Hacienda'),
  ('Luis Felipe Bedoya Mesa',             '1000292410', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Manuela Rodriguez Higuita',           '1017276694', 'Contratista', 'Secretaria de Hacienda'),
  ('Felipe Restrepo Ceballos',            '1001456659', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Adriana Maria Otalvaro Muriel',       '43806393',   'Contratista', 'Comisaria de Familia'),
  ('Jose Daniel Gallego Carvajal',        '1041148625', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Junior Vega Ardila',                  '1007633889', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Maritza Liliana Mejia Ramirez',       '32160770',   'Contratista', 'Secretaria General y de Gobierno'),
  ('Isabel Cristina Mejia De Arango',     '21737896',   'Contratista', 'Secretaria General y de Gobierno'),
  ('Andres Felipe Velez Toro',            '1152434726', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Luisa Maria Botero Monsalve',         '1152434294', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Valentina Restrepo Montoya',          '1041151216', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Jhonatan Danilo Suaza Torres',        '1033343280', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Claudia Llaneth Arboleda Castrillon', '21792489',   'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Sebastian Ortiz Valle',               '1152203945', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Andres Felipe Guerra Osorio',         '1032257037', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Oscar de Jesus Marin Lopez',          '70082275',   'Contratista', 'Secretaria General y de Gobierno'),
  ('Diego Alejandro Arredondo Vasquez',   '8464867',    'Contratista', 'Secretaria General y de Gobierno'),
  ('Jorge Mario Escobar Hernandez',       '1041150322', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Alberth Jhonathan Gomez Henao',       '98710816',   'Contratista', 'Secretaria de Bienestar Social'),
  ('Leidy Yohana Rodriguez Porras',       '1038360521', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Diana Carolina Aguilar Isaza',        '1041146425', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Maria Fernanda Agudelo Sampedro',     '1041149852', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Alexander de Jesus Olaya Zapata',     '70230420',   'Contratista', 'Secretaria General y de Gobierno'),
  ('Mariana Salgado Cuellar',             '1000940222', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Maria Alejandra Aguirre Toro',        '1041150263', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Hector Hernan Jimenez Arenas',        '8460397',    'Contratista', 'Secretaria General y de Gobierno'),
  ('Yesli Parra Velez',                   '1007496848', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Maria Alejandra Acevedo Lopez',       '1007681134', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Ximena Restrepo Betancur',            '1001359851', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Jorge Ignacio Zea Gallego',           '8464986',    'Contratista', 'Secretaria de Bienestar Social'),
  ('Maria Camila Bedoya Marroquin',       '1026152027', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Liliana Marcela Betancur Montoya',    '1041146117', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Manuela Franco Ramirez',              '1046669032', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Yudy Andrea Granados Gallego',        '32160490',   'Contratista', 'Secretaria de Bienestar Social'),
  ('Angie Gimena Bolivar Usuga',          '1015332771', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Maria Cristina Gonzalez Jaramillo',   '32160996',   'Contratista', 'Secretaria General y de Gobierno'),
  ('John Fredy Restrepo Calle',           '1041146326', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Marian Blandon Toro',                 '1007347664', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Yeison Albeiro Martinez Echeverri',   '1041149202', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Daniel Fernando Zuluaga Penagos',     '1041149023', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Alberto Leon Restrepo Galeano',       '3455047',    'Contratista', 'Secretaria de Bienestar Social'),
  ('Deisy Bibiana Montoya Betancur',      '32161152',   'Contratista', 'Secretaria de Bienestar Social'),
  ('Gladys Amparo Sanchez Rios',          '42732594',   'Contratista', 'Secretaria de Bienestar Social'),
  ('Maria Alejandra Londono Lopez',       '1041150069', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Jessica Paola Zapata Sepulveda',      '1152200195', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Diego Alejandro Velez Rodriguez',     '8464638',    'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Diego Alejandro Garcia Echeverri',    '8465244',    'Contratista', 'Secretaria General y de Gobierno'),
  ('Jhon Jaime Velez Rodriguez',          '8462873',    'Contratista', 'Secretaria General y de Gobierno'),
  ('Miguel Angel Valenzuela Soto',        '8463936',    'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Laura Cristina Vallejo Henao',        '1041148101', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Maryory Muñoz Muñoz',                 '1007284916', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Maria Isabel Vasquez Gallego',        '32161150',   'Contratista', 'Secretaria de Bienestar Social'),
  ('Valeria Moncada Acevedo',             '1007496531', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Adriana Isabel Obando Garcia',        '32160617',   'Contratista', 'Secretaria de Bienestar Social'),
  ('Edison Andres Quintero',              '8465629',    'Contratista', 'Secretaria de Bienestar Social'),
  ('Jose Miguel Quintero Soto',           '1033342249', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Manuela Valencia Ochoa',              '1007496693', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Jeison Andres Garcia Gomez',          '1041148995', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Jhon David Betancur Muñoz',           '8466487',    'Contratista', 'Secretaria de Bienestar Social'),
  ('Alejandro Monsalve Mosquera',         '1000086463', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Yenifer Tatiana Velez Restrepo',      '1045112814', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Sebastian Carmona Estrada',           '1041148232', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Gabriel Ignacio Montoya Valdes',      '8460907',    'Contratista', 'Secretaria de Bienestar Social'),
  ('Lucas Betancur Puerta',               '1007310617', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Victor Mario Restrepo Bedoya',        '8465684',    'Contratista', 'Secretaria de Bienestar Social'),
  ('Daniela Urrego Sampedro',             '1001237715', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Margarita Lopez Bedoya',              '21738072',   'Contratista', 'Secretaria de Bienestar Social'),
  ('Lina Marcela Betancur Arroyave',      '21739967',   'Contratista', 'Secretaria de Bienestar Social'),
  ('Jose David Arenas Bustamante',        '8466565',    'Contratista', 'Secretaria de Bienestar Social'),
  ('Jose Alberto Arboleda Granda',        '8459552',    'Contratista', 'Secretaria de Bienestar Social'),
  ('Consultores en Seguridad Social Premium S.A.S', '901348545', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Eliana Patricia Castañeda Castañeda', '32161081',   'Contratista', 'Secretaria General y de Gobierno'),
  ('Karen Yineth Puerta Lopez',           '1041151342', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Fundacion Oro Molido',                '900873352',  'Contratista', 'Secretaria de Bienestar Social'),
  ('Carlos Arturo Valencia Arango',       '1000918837', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Leidy Johana Estrada Quintero',       '1041148191', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Deisy Tatiana Parra Soto',            '1041146853', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Mariana Tobon Correa',                '1041151419', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Wilson Dario Velasquez Diez',         '8461709',    'Contratista', 'Secretaria de Bienestar Social'),
  ('Carlos Augusto Bedoya Hoyos',         '8464881',    'Contratista', 'Secretaria de Bienestar Social'),
  ('Sofia Eugenia Gaviria Muñoz',         '32160559',   'Contratista', 'Secretaria de Bienestar Social'),
  ('Laura Tatiana Zapata Betancur',       '1007496731', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Eliana Maria Deossa Cadavid',         '21739806',   'Contratista', 'Secretaria General y de Gobierno'),
  ('Jorge Ivan Muñoz Gomez',              '8462155',    'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Eliana Marcela Gallego Grajales',     '1041148811', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Margarita Ines Quintero Florez',      '22052441',   'Contratista', 'Secretaria General y de Gobierno'),
  ('Fernando Leon Gallego Valencia',      '8462103',    'Contratista', 'Secretaria General y de Gobierno'),
  ('Luz Adriana Jimenez Gomez',           '43413568',   'Contratista', 'Secretaria General y de Gobierno'),
  ('Juan Esteban Restrepo Puerta',        '1041148253', 'Contratista', 'Secretaria General y de Gobierno'),
  ('Nelson Alejandro Vallejo Garcia',     '1041147348', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Nuveida Cecilia Restrepo Nieto',      '42821811',   'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Sebastian Gomez Garcia',              '1026134149', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Ivan Dario Ramirez Patiño',           '1017184227', 'Contratista', 'Secretaria de Desarrollo Territorial'),
  ('Elma Grisales Ospina',               '43508671',   'Contratista', 'Secretaria General y de Gobierno'),
  ('Jose Luis Echeverri Bermudez',        '1000903280', 'Contratista', 'Secretaria de Bienestar Social'),
  ('Sandra Patricia Velasquez Castañeda', '32160572',   'Contratista', 'Secretaria de Desarrollo Territorial')
ON CONFLICT (cedula) DO NOTHING;

-- ── Done ─────────────────────────────────────────────────────
-- Next steps:
--  1. Go to Dashboard → Admin → Usuarios → Pendientes
--  2. For each contractor, add their email and click "Crear cuenta"
--  3. Upload their photo from the edit profile page
--  4. Fill in missing fields (dirección, teléfono, RH, etc.)
