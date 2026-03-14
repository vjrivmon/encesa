#!/usr/bin/env python3
"""
FallAI — Generación de imágenes de prueba con el LoRA entrenado
================================================================
Carga SDXL base + LoRA y genera 4 imágenes de prueba con prompts variados.

Uso:
    python3 scripts/generate_test.py --lora models/falla_lora_v1.safetensors
    python3 scripts/generate_test.py --lora models/falla_lora_v1.safetensors --steps 30
    python3 scripts/generate_test.py --lora models/falla_lora_v1.safetensors --scale 0.9
    python3 scripts/generate_test.py --list-prompts  # ver los prompts sin generar

Requiere:
    pip install diffusers transformers accelerate safetensors torch
"""

import argparse
import sys
import os
from pathlib import Path
from datetime import datetime

# ─────────────────────────── Configuración ─────────────────────────────── #

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_ROOT / "output" / "test_generation"

DEFAULT_SDXL_MODEL = os.path.expanduser("~/models/sdxl-base-1.0")
DEFAULT_STEPS = 25
DEFAULT_GUIDANCE = 7.5
DEFAULT_LORA_SCALE = 0.8   # 0.0 = sin LoRA, 1.0 = LoRA completo
DEFAULT_SEED = 42

# Prompts de prueba variados para validar el LoRA
TEST_PROMPTS = [
    {
        "name": "especial_grande",
        "prompt": (
            "valencian falla sculpture, falla valenciana, "
            "Special category (top tier), full-size falla, "
            "award-winning falla, monumental installation, "
            "intricate polychrome wood and papier-mache sculpture, "
            "elaborate figurative sculpture, vivid colors, "
            "Las Fallas festival 2026, Valencia Spain, "
            "dramatic lighting, festival street art"
        ),
        "negative": (
            "blurry, low quality, deformed, bad anatomy, ugly, "
            "person, crowd, interior, night time, dark, monochrome"
        ),
    },
    {
        "name": "infantil_colorida",
        "prompt": (
            "valencian falla sculpture, falla valenciana, "
            "children falla (infantil), colorful and playful, "
            "whimsical papier-mache figures, festive street decoration, "
            "bright primary colors, cartoonish characters, "
            "Las Fallas 2026, Valencia Spain, daytime, sunny"
        ),
        "negative": (
            "blurry, low quality, dark, scary, adult themes, "
            "person, monochrome, night time"
        ),
    },
    {
        "name": "primera_tradicional",
        "prompt": (
            "valencian falla sculpture, falla valenciana, "
            "First category (A-tier), traditional Valencian neighborhood, "
            "satirical papier-mache figures, political satire sculpture, "
            "handcrafted artisan sculpture, ninot figures, "
            "intricate wood and papier-mache, gold and red ornaments, "
            "Las Fallas festival, Valencia Spain 2026"
        ),
        "negative": (
            "blurry, deformed, ugly, low resolution, "
            "modern, minimal, abstract, person in crowd"
        ),
    },
    {
        "name": "detalle_artistico",
        "prompt": (
            "close-up detail of valencian falla sculpture, falla valenciana, "
            "extreme detail, intricate carved wood and papier-mache texture, "
            "painted figurines, artisan craftsmanship, "
            "vivid festival colors, ornate decoration, "
            "Las Fallas artisan work, Valencia Spain"
        ),
        "negative": (
            "full body, wide shot, blurry, low detail, "
            "cartoon, anime, painting"
        ),
    },
]


def check_dependencies():
    """Verifica que las dependencias necesarias están instaladas."""
    missing = []
    try:
        import torch
        if not torch.cuda.is_available():
            print("⚠️  CUDA no disponible — generación en CPU (muy lento)")
        else:
            gpu = torch.cuda.get_device_name(0)
            vram = torch.cuda.get_device_properties(0).total_memory / 1024**3
            print(f"✅ GPU: {gpu} ({vram:.1f}GB VRAM)")
    except ImportError:
        missing.append("torch")

    try:
        import diffusers
    except ImportError:
        missing.append("diffusers")

    try:
        import transformers
    except ImportError:
        missing.append("transformers")

    if missing:
        print(f"\n❌ Dependencias faltantes: {', '.join(missing)}")
        print("\n  Instala con:")
        print("  pip install diffusers transformers accelerate safetensors")
        print("  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121")
        sys.exit(1)


def load_pipeline(sdxl_path: str, lora_path: str, lora_scale: float):
    """Carga el pipeline SDXL con el LoRA."""
    import torch
    from diffusers import StableDiffusionXLPipeline

    print(f"📦 Cargando SDXL base: {sdxl_path}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    pipe = StableDiffusionXLPipeline.from_pretrained(
        sdxl_path,
        torch_dtype=dtype,
        use_safetensors=True,
        variant="fp16" if dtype == torch.float16 else None,
    )
    pipe = pipe.to(device)

    # Optimizaciones de memoria
    if device == "cuda":
        pipe.enable_xformers_memory_efficient_attention()
        # pipe.enable_model_cpu_offload()  # Descomenta si hay OOM

    print(f"🎭 Cargando LoRA: {lora_path} (scale={lora_scale})")
    pipe.load_lora_weights(lora_path)
    pipe.fuse_lora(lora_scale=lora_scale)

    print("✅ Pipeline listo")
    return pipe, device


def generate_images(
    pipe,
    device: str,
    output_dir: Path,
    steps: int,
    guidance: float,
    seed: int,
):
    """Genera las 4 imágenes de prueba."""
    import torch

    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = output_dir / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n🎨 Generando {len(TEST_PROMPTS)} imágenes...")
    print(f"   Steps: {steps}, Guidance: {guidance}, Seed: {seed}")
    print(f"   Output: {run_dir}")
    print()

    results = []

    for i, prompt_cfg in enumerate(TEST_PROMPTS, 1):
        name = prompt_cfg["name"]
        prompt = prompt_cfg["prompt"]
        negative = prompt_cfg.get("negative", "")

        print(f"  [{i}/{len(TEST_PROMPTS)}] {name}...")

        generator = torch.Generator(device=device).manual_seed(seed + i)

        image = pipe(
            prompt=prompt,
            negative_prompt=negative,
            num_inference_steps=steps,
            guidance_scale=guidance,
            generator=generator,
            width=1024,
            height=1024,
            num_images_per_prompt=1,
        ).images[0]

        out_path = run_dir / f"{i:02d}_{name}.png"
        image.save(out_path)
        print(f"     ✅ Guardada: {out_path.name}")
        results.append(str(out_path))

    # Guardar manifest de la generación
    manifest = {
        "timestamp": timestamp,
        "steps": steps,
        "guidance_scale": guidance,
        "seed": seed,
        "images": [
            {
                "file": r,
                "prompt": TEST_PROMPTS[i]["prompt"][:100] + "...",
                "name": TEST_PROMPTS[i]["name"],
            }
            for i, r in enumerate(results)
        ]
    }

    import json
    with open(run_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print()
    print("=" * 50)
    print("✨ GENERACIÓN COMPLETADA")
    print("=" * 50)
    print(f"  {len(results)} imágenes generadas en: {run_dir}")
    print()
    print("  Revisa los resultados:")
    for r in results:
        print(f"    {r}")
    print()
    print("  Si el estilo no es correcto, considera:")
    print("    - Ajustar --scale (0.7-1.0)")
    print("    - Aumentar pasos de entrenamiento")
    print("    - Revisar calidad del dataset")

    return results


def main():
    parser = argparse.ArgumentParser(description="FallAI — Generación de prueba con LoRA SDXL")
    parser.add_argument("--lora", required=False,
                        default=str(PROJECT_ROOT / "models" / "falla_lora_v1.safetensors"),
                        help="Path al archivo .safetensors del LoRA")
    parser.add_argument("--sdxl", default=DEFAULT_SDXL_MODEL,
                        help="Path al modelo SDXL base")
    parser.add_argument("--steps", type=int, default=DEFAULT_STEPS,
                        help=f"Pasos de inferencia (default: {DEFAULT_STEPS})")
    parser.add_argument("--guidance", type=float, default=DEFAULT_GUIDANCE,
                        help=f"Guidance scale (default: {DEFAULT_GUIDANCE})")
    parser.add_argument("--scale", type=float, default=DEFAULT_LORA_SCALE,
                        help=f"LoRA scale 0.0-1.0 (default: {DEFAULT_LORA_SCALE})")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED,
                        help=f"Seed de reproducibilidad (default: {DEFAULT_SEED})")
    parser.add_argument("--output", default=str(OUTPUT_DIR),
                        help="Directorio de salida")
    parser.add_argument("--list-prompts", action="store_true",
                        help="Mostrar prompts sin generar imágenes")
    args = parser.parse_args()

    print("🎭 FallAI — Generación de prueba")
    print("=" * 50)
    print()

    if args.list_prompts:
        print("📋 Prompts de prueba configurados:")
        for i, p in enumerate(TEST_PROMPTS, 1):
            print(f"\n  [{i}] {p['name']}")
            print(f"  Prompt: {p['prompt'][:120]}...")
        return

    # Verificar LoRA
    lora_path = Path(args.lora)
    if not lora_path.exists():
        print(f"❌ LoRA no encontrado: {lora_path}")
        print("   Entrena primero con: bash scripts/train_lora.sh")
        sys.exit(1)

    check_dependencies()

    pipe, device = load_pipeline(str(args.sdxl), str(lora_path), args.scale)

    generate_images(
        pipe=pipe,
        device=device,
        output_dir=Path(args.output),
        steps=args.steps,
        guidance=args.guidance,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
