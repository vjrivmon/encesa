#!/usr/bin/env python3
"""
encesa_sync.py - Exporta el dataset de fallas desde Supabase al sistema de ficheros.

Uso:
    python scripts/encesa_sync.py

Variables de entorno (en .env o exportadas):
    SUPABASE_URL   - URL del proyecto Supabase
    SUPABASE_KEY   - Anon key o service role key

Estructura de salida:
    dataset/2026/{categoria}/{barrio}_{nombre_falla}/
        photos/
            {id}_{angulo}.jpg
        metadata.json
"""

import os
import re
import json
import base64
from pathlib import Path
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: Instala las dependencias:")
    print("  pip install supabase python-dotenv")
    raise SystemExit(1)


def slugify(text: str) -> str:
    """Convierte un texto a slug seguro para nombre de carpeta."""
    text = text.lower().strip()
    text = re.sub(r"[àáâãäå]", "a", text)
    text = re.sub(r"[èéêë]", "e", text)
    text = re.sub(r"[ìíîï]", "i", text)
    text = re.sub(r"[òóôõö]", "o", text)
    text = re.sub(r"[ùúûü]", "u", text)
    text = re.sub(r"[ñ]", "n", text)
    text = re.sub(r"[ç]", "c", text)
    text = re.sub(r"[·'\"\'`]", "", text)
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = text.strip("_")
    return text[:40]


def download_image(url: str, dest: Path) -> bool:
    """Descarga una imagen desde una URL pública."""
    import urllib.request
    try:
        urllib.request.urlretrieve(url, dest)
        return True
    except Exception as e:
        print(f"    ! Error descargando {url}: {e}")
        return False


def main():
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")

    if not supabase_url or not supabase_key:
        print("ERROR: Define SUPABASE_URL y SUPABASE_KEY en .env o como variables de entorno")
        raise SystemExit(1)

    print(f"Conectando a Supabase: {supabase_url[:40]}...")
    client: Client = create_client(supabase_url, supabase_key)

    # --- Descargar fallas ---
    print("\n[1/4] Descargando fallas...")
    resp = client.table("fallas").select("*").execute()
    fallas = resp.data
    print(f"  -> {len(fallas)} fallas encontradas")

    # --- Descargar fotos ---
    print("[2/4] Descargando metadatos de fotos...")
    resp_fotos = client.table("fotos").select("*").execute()
    fotos = resp_fotos.data
    print(f"  -> {len(fotos)} fotos encontradas")
    fotos_by_falla: dict[str, list] = {}
    for foto in fotos:
        fid = foto["falla_id"]
        fotos_by_falla.setdefault(fid, []).append(foto)

    # --- Descargar valoraciones ---
    print("[3/4] Descargando valoraciones...")
    resp_val = client.table("valoraciones").select("*").execute()
    valoraciones = {v["falla_id"]: v for v in resp_val.data}

    # --- Descargar OCR ---
    print("[4/4] Descargando resultados OCR...")
    resp_ocr = client.table("ocr_results").select("*").execute()
    ocr_by_falla: dict[str, list] = {}
    for ocr in resp_ocr.data:
        fid = ocr["falla_id"]
        ocr_by_falla.setdefault(fid, []).append(ocr)

    # --- Crear estructura de directorios ---
    base_dir = Path("dataset") / "2026"
    base_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nExportando dataset a: {base_dir.resolve()}\n")

    ok_count = 0
    foto_count = 0
    start_time = datetime.now()

    for falla in fallas:
        cat = falla.get("categoria", "tercera")
        barrio = slugify(falla.get("barrio", "desconocido"))
        nombre = slugify(falla.get("nombre", falla["id"]))
        folder_name = f"{barrio}_{nombre}"

        falla_dir = base_dir / cat / folder_name
        photos_dir = falla_dir / "photos"
        photos_dir.mkdir(parents=True, exist_ok=True)

        print(f"  [{cat.upper()}] {falla['nombre']}")

        # Descargar fotos
        falla_fotos = fotos_by_falla.get(falla["id"], [])
        downloaded_photos = []

        for foto in falla_fotos:
            url = foto.get("url_storage")
            if not url:
                continue
            angulo = foto.get("angulo", "libre")
            foto_id = foto.get("id", "unknown")
            ext = ".jpg"
            dest = photos_dir / f"{foto_id}_{angulo}{ext}"

            if dest.exists():
                print(f"    (cached) {dest.name}")
                downloaded_photos.append(str(dest.relative_to(falla_dir)))
                foto_count += 1
            else:
                print(f"    Descargando {angulo} -> {dest.name}")
                if download_image(url, dest):
                    downloaded_photos.append(str(dest.relative_to(falla_dir)))
                    foto_count += 1

        # Construir metadata.json
        valoracion = valoraciones.get(falla["id"])
        ocr_results = ocr_by_falla.get(falla["id"], [])

        metadata = {
            "id": falla["id"],
            "nombre": falla["nombre"],
            "barrio": falla["barrio"],
            "artista": falla["artista"],
            "categoria": falla["categoria"],
            "lema": falla.get("lema"),
            "anyo": falla.get("anyo", 2026),
            "coordenadas": {
                "lat": falla.get("lat"),
                "lng": falla.get("lng"),
            },
            "estado": falla.get("estado"),
            "completitud_pct": falla.get("completitud_pct", 0),
            "notas": falla.get("notas"),
            "ocr_realizado": falla.get("ocr_realizado", False),
            "valoracion": {
                "originalidad": valoracion["originalidad"] if valoracion else None,
                "ejecucion": valoracion["ejecucion"] if valoracion else None,
                "tematica": valoracion["tematica"] if valoracion else None,
                "humor": valoracion["humor"] if valoracion else None,
            } if valoracion else None,
            "ocr": [
                {
                    "campos": ocr.get("campos", {}),
                    "procesado_at": ocr.get("procesado_at"),
                }
                for ocr in ocr_results
            ],
            "fotos": [
                {
                    "id": f.get("id"),
                    "angulo": f.get("angulo"),
                    "url_storage": f.get("url_storage"),
                    "capturada_at": f.get("capturada_at"),
                }
                for f in falla_fotos
            ],
            "num_fotos": len(falla_fotos),
            "exported_at": datetime.now().isoformat(),
        }

        metadata_path = falla_dir / "metadata.json"
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

        ok_count += 1

    # --- Resumen ---
    elapsed = (datetime.now() - start_time).total_seconds()
    print(f"\n{'='*50}")
    print(f"Dataset exportado correctamente")
    print(f"  Fallas procesadas : {ok_count}/{len(fallas)}")
    print(f"  Fotos descargadas : {foto_count}")
    print(f"  Directorio        : {base_dir.resolve()}")
    print(f"  Tiempo            : {elapsed:.1f}s")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
