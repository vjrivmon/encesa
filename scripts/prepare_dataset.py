#!/usr/bin/env python3
"""
FallAI — Preparación del dataset para entrenamiento LoRA
==========================================================
Lee las imágenes descargadas (bocetos + fotos Encesa) y genera la estructura
de carpetas para kohya_ss con captions en inglés.

Uso:
    python3 scripts/prepare_dataset.py
    python3 scripts/prepare_dataset.py --repetitions 20  # default
    python3 scripts/prepare_dataset.py --include-photos   # incluir fotos Encesa
    python3 scripts/prepare_dataset.py --dry-run          # sólo mostrar sin copiar
"""

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path
from collections import Counter

# ─────────────────────────── Configuración ─────────────────────────────── #

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent

BOCETOS_DIR = PROJECT_ROOT / "dataset" / "bocetos"
PHOTOS_DIR  = PROJECT_ROOT / "dataset" / "photos"   # fotos Encesa (si existen)
TRAIN_DIR   = PROJECT_ROOT / "dataset" / "train"
METADATA_JSON = BOCETOS_DIR / "metadata.json"

DEFAULT_REPETITIONS = 20
CLASS_NAME = "falla_valenciana"   # nombre del concepto LoRA

TRIGGER_WORD = "falla valenciana"  # token especial a inyectar en cada caption

# ─────────────────────────── Generación de captions ────────────────────── #

CATEGORY_LABELS = {
    "especial":  "Special category (top tier)",
    "primera":   "First category (A-tier)",
    "segunda":   "Second category (B-tier)",
    "tercera":   "Third category (C-tier)",
}

TYPE_LABELS = {
    "grande":   "full-size falla",
    "infantil": "children falla (infantil)",
}


def build_caption(meta: dict) -> str:
    """
    Genera un caption en inglés para entrenamiento LoRA.
    Omite campos vacíos o None elegantemente.
    """
    parts = ["valencian falla sculpture", TRIGGER_WORD]

    # Categoría con label descriptivo
    cat = meta.get("categoria", "").strip()
    if cat:
        cat_label = CATEGORY_LABELS.get(cat, f"{cat} category")
        parts.append(cat_label)

    # Tipo (grande / infantil)
    tipo = meta.get("tipo", "").strip().lower()
    if tipo:
        parts.append(TYPE_LABELS.get(tipo, f"{tipo} type"))

    # Barrio
    barrio = meta.get("barrio", "").strip()
    if barrio:
        parts.append(f"{barrio} neighborhood, Valencia")

    # Artista
    artista = meta.get("artista", "").strip()
    if artista:
        parts.append(f"artwork by artist {artista}")

    # Lema / tema
    lema = meta.get("lema", "").strip()
    if lema:
        # Traducción aproximada o dejar en castellano/valenciano con contexto
        parts.append(f"theme: {lema}")

    # Descriptores visuales fijos (siempre presentes para consistencia de estilo)
    parts += [
        "intricate polychrome wood and papier-mache sculpture",
        "monumental street installation",
        "Las Fallas festival 2026",
        "Valencia Spain",
        "elaborate figurative sculpture",
        "vivid colors",
        "festive street art",
    ]

    return ", ".join(parts)


def build_negative_prompt() -> str:
    """Prompt negativo de referencia (útil para la guía de generación)."""
    return (
        "blurry, low quality, deformed, ugly, bad anatomy, "
        "modern building, interior, person, crowd, night time"
    )


# ─────────────────────────── Carga de datos ────────────────────────────── #

def load_metadata() -> dict[str, dict]:
    """Carga metadata.json → dict keyed by falla id."""
    if not METADATA_JSON.exists():
        print(f"❌ No encontrado: {METADATA_JSON}")
        print("   Ejecuta primero: python3 scripts/download_bocetos.py")
        sys.exit(1)

    with open(METADATA_JSON, encoding="utf-8") as f:
        data = json.load(f)

    return {item["id"]: item for item in data}


def find_images(meta_by_id: dict) -> list[tuple[Path, dict]]:
    """
    Devuelve lista de (image_path, metadata) para todas las imágenes disponibles.
    Prioridad: bocetos > fotos Encesa.
    """
    images = []

    # 1. Bocetos descargados
    for fid, meta in meta_by_id.items():
        cat = re.sub(r'[^a-z0-9_]', '_', meta.get("categoria", "").lower())
        img_path = BOCETOS_DIR / cat / f"{fid}.jpg"
        if img_path.exists() and img_path.stat().st_size > 500:
            images.append((img_path, meta))

    # 2. Fotos Encesa (si existen)
    if PHOTOS_DIR.exists():
        for img_path in PHOTOS_DIR.rglob("*.jpg"):
            fid = img_path.stem
            if fid in meta_by_id:
                images.append((img_path, meta_by_id[fid]))
            else:
                # Foto sin metadata asociada — caption genérico
                images.append((img_path, {
                    "id": fid,
                    "categoria": "unknown",
                    "tipo": "grande",
                }))

    return images


# ─────────────────────────── Generación del dataset ────────────────────── #

def prepare_dataset(
    images: list[tuple[Path, dict]],
    repetitions: int,
    dry_run: bool,
) -> None:
    """Genera la estructura de carpetas kohya_ss."""

    train_class_dir = TRAIN_DIR / f"{repetitions}_{CLASS_NAME}"
    if not dry_run:
        train_class_dir.mkdir(parents=True, exist_ok=True)

    print(f"📁 Directorio de entrenamiento: {train_class_dir}")
    print(f"🔁 Repeticiones: {repetitions}")
    print()

    stats: Counter = Counter()
    jsonl_records = []

    for img_path, meta in images:
        cat = meta.get("categoria", "unknown")
        caption = build_caption(meta)
        dest_img = train_class_dir / img_path.name
        dest_txt = dest_img.with_suffix(".txt")

        stats[cat] += 1

        if dry_run:
            print(f"  [DRY-RUN] {img_path.name}")
            print(f"  Caption: {caption[:80]}...")
            print()
            continue

        # Copiar imagen
        shutil.copy2(img_path, dest_img)

        # Escribir caption
        with open(dest_txt, "w", encoding="utf-8") as f:
            f.write(caption)

        # Acumular para metadata.jsonl (DreamBooth style)
        jsonl_records.append({
            "file_name": img_path.name,
            "text": caption,
        })

    if not dry_run:
        # metadata.jsonl para DreamBooth / generic captioning
        meta_jsonl_path = train_class_dir / "metadata.jsonl"
        with open(meta_jsonl_path, "w", encoding="utf-8") as f:
            for rec in jsonl_records:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")

        print(f"📋 metadata.jsonl: {meta_jsonl_path} ({len(jsonl_records)} registros)")
        print()

    # ── Estadísticas ──────────────────────────────────────────────────────
    total = sum(stats.values())
    print("=" * 50)
    print("📊 ESTADÍSTICAS DEL DATASET")
    print("=" * 50)
    print(f"  Total imágenes:     {total}")
    print(f"  Total efectivo:     {total * repetitions}  (×{repetitions} repeticiones)")
    print()
    print("  Por categoría:")
    for cat, count in sorted(stats.items(), key=lambda x: -x[1]):
        bar = "█" * (count // 10) + f"  {count}"
        pct = count / total * 100 if total else 0
        print(f"    {cat:12s}: {bar} ({pct:.1f}%)")
    print()

    if not dry_run:
        print(f"✨ Dataset listo en: {train_class_dir}")
        print()
        print("👉 Siguiente paso:")
        print("   bash scripts/train_lora.sh")


# ─────────────────────────── Punto de entrada ──────────────────────────── #

def main():
    parser = argparse.ArgumentParser(description="FallAI — Preparar dataset LoRA")
    parser.add_argument("--repetitions", type=int, default=DEFAULT_REPETITIONS,
                        help=f"Repeticiones kohya_ss (default: {DEFAULT_REPETITIONS})")
    parser.add_argument("--include-photos", action="store_true",
                        help="Incluir fotos Encesa además de bocetos")
    parser.add_argument("--dry-run", action="store_true",
                        help="Sólo mostrar sin copiar archivos")
    parser.add_argument("--clean", action="store_true",
                        help="Limpiar directorio train antes de preparar")
    args = parser.parse_args()

    print("🎭 FallAI — Preparación del dataset")
    print("=" * 50)
    print()

    meta_by_id = load_metadata()
    print(f"✅ Metadata: {len(meta_by_id)} fallas")

    images = find_images(meta_by_id)
    print(f"🖼️  Imágenes encontradas: {len(images)}")

    if not images:
        print()
        print("⚠️  No hay imágenes disponibles.")
        print("   Ejecuta primero: python3 scripts/download_bocetos.py")
        sys.exit(0)

    if args.clean and not args.dry_run:
        train_class_dir = TRAIN_DIR / f"{args.repetitions}_{CLASS_NAME}"
        if train_class_dir.exists():
            shutil.rmtree(train_class_dir)
            print(f"🗑️  Limpiado: {train_class_dir}")

    print()
    prepare_dataset(images, args.repetitions, args.dry_run)


if __name__ == "__main__":
    main()
