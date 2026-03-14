#!/usr/bin/env python3
"""
encesa_sync.py — Descarga el dataset de fallas de Supabase al Slimbook

Uso:
    python scripts/encesa_sync.py

Variables de entorno (o en .env):
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_KEY=tu-service-role-key  (usa service_role, no anon)

Requiere:
    pip install supabase python-dotenv
"""

import os
import sys
import json
import re
from pathlib import Path
from datetime import datetime

try:
    from dotenv import load_dotenv
except ImportError:
    print("Instala dependencias: pip install supabase python-dotenv")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("Instala dependencias: pip install supabase python-dotenv")
    sys.exit(1)

# ─── CONFIG ───────────────────────────────────────────────────────────────────

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
DATASET_DIR  = Path(__file__).parent.parent / "dataset"
BUCKET_NAME  = "fotos"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL y SUPABASE_KEY no encontrados.")
    print("Crea un archivo .env en la raiz del proyecto con esas variables.")
    sys.exit(1)

# ─── UTILS ────────────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[àáâãäå]', 'a', text)
    text = re.sub(r'[èéêë]', 'e', text)
    text = re.sub(r'[ìíîï]', 'i', text)
    text = re.sub(r'[òóôõö]', 'o', text)
    text = re.sub(r'[ùúûü]', 'u', text)
    text = re.sub(r'[ñ]', 'n', text)
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s-]+', '_', text)
    return text

def print_progress(current: int, total: int, label: str):
    bar_len = 30
    filled = int(bar_len * current / total) if total > 0 else 0
    bar = '█' * filled + '░' * (bar_len - filled)
    pct = int(100 * current / total) if total > 0 else 0
    print(f"\r  [{bar}] {pct:3d}% — {label}", end='', flush=True)

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print(f"\nEncesa Sync — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print(f"Destino: {DATASET_DIR}\n")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. Obtener todas las fallas
    print("Descargando fallas...")
    result = supabase.table("fallas").select("*").execute()
    fallas = result.data
    print(f"  {len(fallas)} fallas encontradas\n")

    if not fallas:
        print("No hay fallas sincronizadas todavía.")
        return

    # 2. Obtener fotos, valoraciones y OCR
    fotos_result = supabase.table("fotos").select("*").execute()
    fotos_all = fotos_result.data

    val_result = supabase.table("valoraciones").select("*").execute()
    valoraciones_map = {v["falla_id"]: v for v in val_result.data}

    ocr_result = supabase.table("ocr_results").select("*").execute()
    ocr_map = {o["falla_id"]: o for o in ocr_result.data}

    fotos_map: dict[str, list] = {}
    for foto in fotos_all:
        fid = foto["falla_id"]
        fotos_map.setdefault(fid, []).append(foto)

    # Stats
    total_fotos = len(fotos_all)
    total_bytes = 0

    # 3. Procesar cada falla
    print(f"Procesando {len(fallas)} fallas...\n")

    for i, falla in enumerate(fallas):
        falla_id   = falla["id"]
        categoria  = falla["categoria"]
        barrio     = slugify(falla["barrio"])
        nombre     = slugify(falla["nombre"])
        folder_name = f"{barrio}_{nombre}"

        falla_dir = DATASET_DIR / "2026" / categoria / folder_name
        photos_dir = falla_dir / "photos"
        photos_dir.mkdir(parents=True, exist_ok=True)

        print_progress(i + 1, len(fallas), f"{falla['nombre']}")

        # Metadata completa
        metadata = {
            "id":              falla_id,
            "nombre":          falla["nombre"],
            "barrio":          falla["barrio"],
            "artista":         falla.get("artista", ""),
            "categoria":       categoria,
            "lema":            falla.get("lema", ""),
            "anyo":            falla["anyo"],
            "lat":             falla["lat"],
            "lng":             falla["lng"],
            "completitud_pct": falla["completitud_pct"],
            "notas":           falla.get("notas", ""),
            "ocr_realizado":   falla["ocr_realizado"],
            "valoracion":      valoraciones_map.get(falla_id),
            "ocr":             ocr_map.get(falla_id),
            "fotos_count":     len(fotos_map.get(falla_id, [])),
            "synced_at":       datetime.now().isoformat(),
        }

        with open(falla_dir / "metadata.json", "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

        # Descargar fotos
        fotos_falla = fotos_map.get(falla_id, [])
        for j, foto in enumerate(fotos_falla):
            url = foto.get("url_storage", "")
            if not url:
                continue

            # Extraer path del storage de la URL
            # Formato: .../storage/v1/object/public/fotos/{path}
            storage_path = url.split(f"/storage/v1/object/public/{BUCKET_NAME}/")[-1]
            if not storage_path or storage_path == url:
                # Intentar extraer solo el nombre de archivo
                storage_path = url.split("/")[-1]

            ext = Path(storage_path).suffix or ".jpg"
            filename = f"{foto['angulo']}_{j+1}{ext}"
            dest = photos_dir / filename

            if dest.exists():
                continue

            try:
                response = supabase.storage.from_(BUCKET_NAME).download(storage_path)
                if response:
                    with open(dest, "wb") as f:
                        f.write(response)
                    total_bytes += len(response)
            except Exception:
                # Foto no descargable, continuar
                pass

    print()  # nueva línea tras progress bar

    # 4. Resumen
    total_mb = total_bytes / (1024 * 1024)
    print(f"\nDataset listo en: {DATASET_DIR}")
    print(f"  Fallas:     {len(fallas)}")
    print(f"  Fotos:      {total_fotos}")
    print(f"  Descargado: {total_mb:.1f} MB")
    print(f"\nEstructura:")
    print(f"  dataset/2026/especial/")
    print(f"  dataset/2026/primera/")
    print(f"  dataset/2026/segunda/")
    print(f"  dataset/2026/tercera/")
    print(f"    {{barrio}}_{{nombre}}/")
    print(f"      metadata.json")
    print(f"      photos/")
    print(f"        frontal_1.jpg ...")
    print()


if __name__ == "__main__":
    main()
