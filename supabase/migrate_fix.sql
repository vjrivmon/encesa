-- ============================================================
-- ENCESA — Migration fix (ejecutar en Supabase SQL Editor)
-- ============================================================

-- 1. Hacer angulo nullable (ya no se usa)
ALTER TABLE fotos ALTER COLUMN angulo DROP NOT NULL;

-- 2. Añadir columna tipo a fallas si no existe
ALTER TABLE fallas ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'grande';

-- 3. Añadir columna imprescindible a fallas si no existe
ALTER TABLE fallas ADD COLUMN IF NOT EXISTS imprescindible BOOLEAN DEFAULT FALSE;

-- 4. Crear bucket fotos si no existe y hacerlo público
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos', 'fotos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 5. Políticas storage — permitir todo con anon key
DROP POLICY IF EXISTS "anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "anon_select" ON storage.objects;
DROP POLICY IF EXISTS "anon_update" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete" ON storage.objects;

CREATE POLICY "anon_insert" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'fotos');

CREATE POLICY "anon_select" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'fotos');

CREATE POLICY "anon_update" ON storage.objects
  FOR UPDATE TO anon USING (bucket_id = 'fotos');

CREATE POLICY "anon_delete" ON storage.objects
  FOR DELETE TO anon USING (bucket_id = 'fotos');

-- 6. Políticas tablas fallas y fotos (por si tampoco están)
ALTER TABLE fallas ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_fallas" ON fallas;
DROP POLICY IF EXISTS "anon_all_fotos" ON fotos;

CREATE POLICY "anon_all_fallas" ON fallas FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_fotos" ON fotos FOR ALL TO anon USING (true) WITH CHECK (true);
