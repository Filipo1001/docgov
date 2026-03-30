-- Notification preferences per user per channel
CREATE TABLE IF NOT EXISTS preferencias_notificacion (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canal TEXT NOT NULL CHECK (canal IN ('app', 'email', 'whatsapp')),
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (usuario_id, canal)
);

-- RLS: users can only read/update their own preferences
ALTER TABLE preferencias_notificacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
  ON preferencias_notificacion FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Users can insert own preferences"
  ON preferencias_notificacion FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Users can update own preferences"
  ON preferencias_notificacion FOR UPDATE
  USING (auth.uid() = usuario_id);

-- Service role (admin client) bypasses RLS automatically

-- Add telefono column to usuarios if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'telefono'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN telefono TEXT;
  END IF;
END $$;
