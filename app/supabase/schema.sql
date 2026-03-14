-- Encesa — Schema PostgreSQL
-- Ejecutar en Supabase SQL Editor

-- ─── FALLAS ───────────────────────────────────────────────────────────────────
create table if not exists fallas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  barrio         text not null,
  artista        text,
  categoria      text not null check (categoria in ('especial', 'primera', 'segunda', 'tercera')),
  lema           text,
  anyo           integer not null default 2026,
  lat            double precision not null,
  lng            double precision not null,
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'en_progreso', 'completa')),
  completitud_pct double precision not null default 0,
  notas          text,
  ocr_realizado  boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists fallas_categoria_idx on fallas (categoria);
create index if not exists fallas_estado_idx on fallas (estado);
create index if not exists fallas_anyo_idx on fallas (anyo);

-- ─── FOTOS ────────────────────────────────────────────────────────────────────
create table if not exists fotos (
  id             uuid primary key default gen_random_uuid(),
  falla_id       uuid not null references fallas (id) on delete cascade,
  angulo         text not null check (angulo in ('frontal', 'lateral_izq', 'lateral_der', 'trasera', 'detalle', 'libre')),
  url_storage    text not null,
  descripcion_ia text,
  metadata_exif  jsonb,
  capturada_at   timestamptz not null default now(),
  synced         boolean not null default true
);

create index if not exists fotos_falla_id_idx on fotos (falla_id);
create index if not exists fotos_angulo_idx on fotos (angulo);

-- ─── VALORACIONES ─────────────────────────────────────────────────────────────
create table if not exists valoraciones (
  id             uuid primary key default gen_random_uuid(),
  falla_id       uuid not null unique references fallas (id) on delete cascade,
  originalidad   integer check (originalidad between 1 and 5),
  ejecucion      integer check (ejecucion between 1 and 5),
  tematica       integer check (tematica between 1 and 5),
  humor          integer check (humor between 1 and 5),
  updated_at     timestamptz not null default now()
);

create index if not exists valoraciones_falla_id_idx on valoraciones (falla_id);

-- ─── OCR RESULTS ──────────────────────────────────────────────────────────────
create table if not exists ocr_results (
  id               uuid primary key default gen_random_uuid(),
  falla_id         uuid not null references fallas (id) on delete cascade,
  campos_extraidos jsonb not null default '{}',
  confianza        double precision,
  url_foto_cartel  text,
  procesado_at     timestamptz not null default now()
);

create index if not exists ocr_results_falla_id_idx on ocr_results (falla_id);

-- ─── STORAGE BUCKET ───────────────────────────────────────────────────────────
-- Crear bucket 'fotos' en Supabase Storage (Dashboard > Storage > New Bucket)
-- Nombre: fotos
-- Public: false

-- ─── RLS (desactivado para uso personal) ──────────────────────────────────────
alter table fallas disable row level security;
alter table fotos disable row level security;
alter table valoraciones disable row level security;
alter table ocr_results disable row level security;

-- ─── TRIGGER updated_at ───────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger fallas_updated_at
  before update on fallas
  for each row execute function update_updated_at();

create trigger valoraciones_updated_at
  before update on valoraciones
  for each row execute function update_updated_at();
