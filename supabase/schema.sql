-- Encesa — Supabase Schema v1.0
-- Ejecutar en el SQL Editor de Supabase

-- ============================================================
-- Tabla: fallas
-- ============================================================
CREATE TABLE IF NOT EXISTS fallas (
  id              TEXT PRIMARY KEY,
  nombre          TEXT NOT NULL,
  barrio          TEXT NOT NULL,
  artista         TEXT NOT NULL,
  categoria       TEXT NOT NULL CHECK (categoria IN ('especial','primera','segunda','tercera')),
  lema            TEXT,
  anyo            INTEGER NOT NULL DEFAULT 2026,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_progreso','completa')),
  completitud_pct INTEGER NOT NULL DEFAULT 0 CHECK (completitud_pct BETWEEN 0 AND 100),
  notas           TEXT,
  ocr_realizado   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fallas_categoria ON fallas(categoria);
CREATE INDEX IF NOT EXISTS idx_fallas_estado ON fallas(estado);

-- ============================================================
-- Tabla: fotos
-- ============================================================
CREATE TABLE IF NOT EXISTS fotos (
  id              TEXT PRIMARY KEY,
  falla_id        TEXT NOT NULL REFERENCES fallas(id) ON DELETE CASCADE,
  angulo          TEXT NOT NULL CHECK (angulo IN ('frontal','lateral_izq','lateral_der','trasera','detalle','libre')),
  url_storage     TEXT,
  synced          BOOLEAN NOT NULL DEFAULT TRUE,
  capturada_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fotos_falla_id ON fotos(falla_id);
CREATE INDEX IF NOT EXISTS idx_fotos_angulo ON fotos(angulo);

-- ============================================================
-- Tabla: valoraciones
-- ============================================================
CREATE TABLE IF NOT EXISTS valoraciones (
  id              TEXT PRIMARY KEY,
  falla_id        TEXT NOT NULL UNIQUE REFERENCES fallas(id) ON DELETE CASCADE,
  originalidad    INTEGER NOT NULL DEFAULT 0 CHECK (originalidad BETWEEN 0 AND 5),
  ejecucion       INTEGER NOT NULL DEFAULT 0 CHECK (ejecucion BETWEEN 0 AND 5),
  tematica        INTEGER NOT NULL DEFAULT 0 CHECK (tematica BETWEEN 0 AND 5),
  humor           INTEGER NOT NULL DEFAULT 0 CHECK (humor BETWEEN 0 AND 5),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valoraciones_falla_id ON valoraciones(falla_id);

-- ============================================================
-- Tabla: ocr_results
-- ============================================================
CREATE TABLE IF NOT EXISTS ocr_results (
  id              TEXT PRIMARY KEY,
  falla_id        TEXT NOT NULL REFERENCES fallas(id) ON DELETE CASCADE,
  campos          JSONB NOT NULL DEFAULT '{}',
  foto_cartel_id  TEXT,
  procesado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_falla_id ON ocr_results(falla_id);

-- ============================================================
-- Storage bucket (crear desde el dashboard o via API)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('encesa-fotos', 'encesa-fotos', true)
-- ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Row Level Security (si usas auth)
-- ============================================================
-- Para uso de un solo usuario con anon key, desactivar RLS:
ALTER TABLE fallas DISABLE ROW LEVEL SECURITY;
ALTER TABLE fotos DISABLE ROW LEVEL SECURITY;
ALTER TABLE valoraciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_results DISABLE ROW LEVEL SECURITY;
