#!/usr/bin/env python3
"""
FallAI — Descarga de bocetos oficiales del Ayuntamiento de Valencia
=======================================================================
Lee las 702 fallas del dataset y descarga cada imagen de boceto oficial.

Uso:
    python3 scripts/download_bocetos.py
    python3 scripts/download_bocetos.py --json /tmp/fallas_final.json
    python3 scripts/download_bocetos.py --dry-run     # sin descargar, sólo muestra URLs
    python3 scripts/download_bocetos.py --workers 3   # concurrencia (default 3)
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlparse
import threading
import re

# Instalación automática de dependencias opcionales
try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    print("⚠️  Instalando requests...")
    os.system(f"{sys.executable} -m pip install requests -q")
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    print("⚠️  Instalando tqdm para barra de progreso...")
    os.system(f"{sys.executable} -m pip install tqdm -q")
    from tqdm import tqdm
    HAS_TQDM = True

# ─────────────────────────── Configuración ─────────────────────────────── #

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATASET_DIR = PROJECT_ROOT / "dataset" / "bocetos"
DEFAULT_JSON = "/tmp/fallas_final.json"
SEED_TS = PROJECT_ROOT / "app" / "src" / "lib" / "jcf-seed.ts"

TIMEOUT = 15          # segundos por petición
MAX_RETRIES = 3       # reintentos por imagen
RATE_LIMIT = 5        # máx req/s (global con semáforo)
WORKERS = 3           # descargas en paralelo

# Semáforo global para rate limiting
_rate_lock = threading.Lock()
_req_times: list[float] = []


def rate_limited_get(session: requests.Session, url: str) -> requests.Response:
    """Descarga con rate limiting global (max RATE_LIMIT req/s)."""
    global _req_times
    with _rate_lock:
        now = time.time()
        _req_times = [t for t in _req_times if now - t < 1.0]
        if len(_req_times) >= RATE_LIMIT:
            sleep_time = 1.0 - (now - _req_times[0])
            if sleep_time > 0:
                time.sleep(sleep_time)
        _req_times.append(time.time())

    return session.get(url, timeout=TIMEOUT, stream=True)


def build_session() -> requests.Session:
    """Crea sesión HTTP con retry automático."""
    session = requests.Session()
    retry = Retry(
        total=MAX_RETRIES,
        backoff_factor=1.0,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": "FallAI-Dataset/1.0 (+github.com/vjrivmon/encesa)"
    })
    return session


def load_fallas_from_json(path: str) -> list[dict]:
    """Carga fallas desde JSON."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_fallas_from_ts(path: Path) -> list[dict]:
    """Extrae fallas del TypeScript seed (fallback)."""
    print(f"🔍 Parseando seed TypeScript: {path}")
    text = path.read_text(encoding="utf-8")
    # Extraer el array JSON embebido en el TS
    match = re.search(r'=\s*(\[.*\])\s*(?:as const)?;?\s*$', text, re.DOTALL)
    if not match:
        raise ValueError("No se pudo extraer el array de fallas del seed TS")
    raw = match.group(1)
    # Limpiar comentarios inline y trailing commas
    raw = re.sub(r'//[^\n]*', '', raw)
    raw = re.sub(r',(\s*[}\]])', r'\1', raw)
    return json.loads(raw)


def sanitize_category(cat: str) -> str:
    """Normaliza el nombre de categoría para usar como directorio."""
    return re.sub(r'[^a-z0-9_]', '_', cat.lower().strip()) if cat else "sin_categoria"


def download_image(session: requests.Session, url: str, dest: Path) -> bool:
    """Descarga una imagen a disco. Retorna True si tuvo éxito."""
    if not url:
        return False

    # Si ya existe y no está vacía, skip
    if dest.exists() and dest.stat().st_size > 1000:
        return True

    try:
        resp = rate_limited_get(session, url)
        resp.raise_for_status()

        content_type = resp.headers.get("Content-Type", "")
        if "html" in content_type.lower():
            return False  # Probablemente página de error

        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        # Verificar que el archivo no está vacío
        if dest.stat().st_size < 500:
            dest.unlink(missing_ok=True)
            return False

        return True

    except requests.exceptions.Timeout:
        return False
    except requests.exceptions.RequestException:
        return False
    except Exception:
        return False


def infer_extension(url: str) -> str:
    """Infiere la extensión del archivo desde la URL."""
    parsed = urlparse(url)
    path = parsed.path.lower()
    for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        if path.endswith(ext):
            return ".jpg"  # Siempre guardamos como .jpg para consistencia
    return ".jpg"


def main():
    parser = argparse.ArgumentParser(description="FallAI — Descarga bocetos oficiales")
    parser.add_argument("--json", default=DEFAULT_JSON, help="Ruta al JSON de fallas")
    parser.add_argument("--output", default=str(DATASET_DIR), help="Directorio de salida")
    parser.add_argument("--dry-run", action="store_true", help="Sólo mostrar URLs sin descargar")
    parser.add_argument("--workers", type=int, default=WORKERS, help="Descargas paralelas")
    parser.add_argument("--force", action="store_true", help="Re-descargar aunque ya existan")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Cargar fallas
    if os.path.exists(args.json):
        print(f"📂 Cargando fallas desde: {args.json}")
        fallas = load_fallas_from_json(args.json)
    elif SEED_TS.exists():
        print(f"📂 Usando seed TypeScript: {SEED_TS}")
        fallas = load_fallas_from_ts(SEED_TS)
    else:
        print(f"❌ No se encontró el archivo de fallas ({args.json})")
        sys.exit(1)

    print(f"✅ {len(fallas)} fallas cargadas")

    # Estadísticas previas
    by_cat = {}
    for f in fallas:
        cat = f.get("categoria", "sin_categoria")
        by_cat[cat] = by_cat.get(cat, 0) + 1
    print(f"📊 Distribución: {by_cat}")
    print()

    if args.dry_run:
        print("🔍 DRY-RUN — URLs que se descargarían:")
        for f in fallas[:10]:
            print(f"  {f.get('id')} → {f.get('boceto')}")
        print(f"  ... y {len(fallas)-10} más")
        return

    # ───── Descarga ─────
    session = build_session()
    results = {"ok": 0, "skip": 0, "error": 0, "no_url": 0}
    errors = []
    metadata = []

    from concurrent.futures import ThreadPoolExecutor, as_completed

    def process_falla(falla: dict) -> tuple[str, bool, str]:
        fid = falla.get("id", "unknown")
        url = falla.get("boceto", "")

        if not url:
            return fid, False, "no_url"

        cat = sanitize_category(falla.get("categoria", "sin_categoria"))
        dest = output_dir / cat / f"{fid}.jpg"

        if dest.exists() and dest.stat().st_size > 1000 and not args.force:
            return fid, True, "skip"

        ok = download_image(session, url, dest)
        return fid, ok, "ok" if ok else "error"

    print(f"⬇️  Iniciando descarga con {args.workers} workers (rate limit: {RATE_LIMIT} req/s)...")
    print()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(process_falla, f): f for f in fallas}

        with tqdm(total=len(fallas), unit="img", desc="Bocetos") as pbar:
            for future in as_completed(futures):
                falla = futures[future]
                fid, ok, status = future.result()

                results[status] = results.get(status, 0) + 1

                if status == "ok":
                    pbar.set_postfix({"✅": results["ok"], "❌": results["error"]})
                elif status == "error":
                    errors.append({"id": fid, "url": falla.get("boceto"), "categoria": falla.get("categoria")})

                # Acumular metadata
                cat = sanitize_category(falla.get("categoria", ""))
                dest = output_dir / cat / f"{fid}.jpg"
                if ok:
                    metadata.append({
                        "id": fid,
                        "file": str(dest.relative_to(PROJECT_ROOT)),
                        "nombre": falla.get("nombre", ""),
                        "artista": falla.get("artista", ""),
                        "barrio": falla.get("barrio", ""),
                        "categoria": falla.get("categoria", ""),
                        "lema": falla.get("lema", ""),
                        "tipo": falla.get("tipo", ""),
                        "fallera": falla.get("fallera", ""),
                        "presidente": falla.get("presidente", ""),
                        "anyo_fundacion": falla.get("anyo_fundacion", ""),
                        "boceto_url": falla.get("boceto", ""),
                    })

                pbar.update(1)

    # Guardar metadata
    meta_path = output_dir / "metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    # Guardar log de errores
    if errors:
        err_path = output_dir / "download_errors.json"
        with open(err_path, "w", encoding="utf-8") as f:
            json.dump(errors, f, ensure_ascii=False, indent=2)

    # Resumen
    print()
    print("=" * 50)
    print("📊 RESUMEN DE DESCARGA")
    print("=" * 50)
    print(f"  ✅ Descargadas:  {results.get('ok', 0)}")
    print(f"  ⏭️  Ya existían:  {results.get('skip', 0)}")
    print(f"  ❌ Errores:      {results.get('error', 0)}")
    print(f"  ⚪ Sin URL:      {results.get('no_url', 0)}")
    print(f"  📁 Metadata:     {meta_path}")
    if errors:
        print(f"  📋 Errores log:  {output_dir / 'download_errors.json'}")
    print()

    total = results.get("ok", 0) + results.get("skip", 0)
    if total > 0:
        print(f"✨ Dataset listo: {total} imágenes en {output_dir}")
    else:
        print("⚠️  No se descargó ninguna imagen. Revisa tu conexión o las URLs.")


if __name__ == "__main__":
    main()
