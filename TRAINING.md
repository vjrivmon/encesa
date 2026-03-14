# FallAI — Pipeline de Entrenamiento LoRA SDXL

> **Objetivo:** Entrenar un modelo generativo (SDXL + LoRA) capaz de crear imágenes de fallas valencianas nuevas, a partir del dataset oficial del Ayuntamiento de Valencia (702 bocetos) y fotos capturadas con la app Encesa.

**Hardware objetivo:** Slimbook con RTX 4070 12GB VRAM · Ryzen 7 8845HS · 64GB RAM  
**Resultado:** `models/falla_lora_v1.safetensors` (~160 MB)

---

## Índice

- [Paso 0 — Instalar dependencias Python](#paso-0--instalar-dependencias-python)
- [Paso 1 — Descargar bocetos oficiales](#paso-1--descargar-bocetos-oficiales)
- [Paso 2 — Preparar el dataset](#paso-2--preparar-el-dataset)
- [Paso 3 — Instalar kohya_ss](#paso-3--instalar-kohya_ss)
- [Paso 4 — Entrenar el LoRA](#paso-4--entrenar-el-lora)
- [Paso 5 — Probar el modelo](#paso-5--probar-el-modelo)
- [Paso 6 — Iterar y mejorar](#paso-6--iterar-y-mejorar)
- [Troubleshooting](#troubleshooting)

---

## Paso 0 — Instalar dependencias Python

**Tiempo estimado:** 5-10 minutos

```bash
# Desde la raíz del proyecto
cd ~/path/to/encesa

# Crear entorno virtual para los scripts de pipeline
python3 -m venv .venv-fallai
source .venv-fallai/bin/activate

# Dependencias de los scripts de pipeline
pip install requests tqdm Pillow

# Dependencias de generación (para probar el LoRA después)
pip install diffusers transformers accelerate safetensors
pip install torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/cu121
```

> 💡 **Nota:** Los scripts (`download_bocetos.py`, `prepare_dataset.py`) intentan instalar sus dependencias automáticamente si faltan, pero mejor instalarlas antes.

### Verificar que CUDA funciona

```bash
python3 -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
# Debe mostrar: True NVIDIA GeForce RTX 4070
```

---

## Paso 1 — Descargar bocetos oficiales

**Tiempo estimado:** 15-30 minutos (702 imágenes, rate-limited a 5 req/s)  
**Resultado:** `dataset/bocetos/{categoria}/{id}.jpg` + `dataset/bocetos/metadata.json`

```bash
# Asegúrate de estar en la raíz del proyecto
cd ~/path/to/encesa
source .venv-fallai/bin/activate

# Descarga estándar
python3 scripts/download_bocetos.py

# Con más info (dry-run para ver primero)
python3 scripts/download_bocetos.py --dry-run

# Forzar re-descarga si ya existen
python3 scripts/download_bocetos.py --force

# Con más workers (más rápido, más carga al servidor)
python3 scripts/download_bocetos.py --workers 5
```

**Qué esperar:**
```
📂 Cargando fallas desde: /tmp/fallas_final.json
✅ 702 fallas cargadas
📊 Distribución: {'tercera': 510, 'primera': 81, 'segunda': 91, 'especial': 20}

⬇️  Iniciando descarga con 3 workers (rate limit: 5 req/s)...

Bocetos: 100%|████████████| 702/702 [18:32<00:00,  0.63img/s] ✅: 687  ❌: 15

==================================================
📊 RESUMEN DE DESCARGA
==================================================
  ✅ Descargadas:  687
  ⏭️  Ya existían:  0
  ❌ Errores:      15
  📁 Metadata:     dataset/bocetos/metadata.json
```

> ⚠️ **Errores esperados:** ~15-30 bocetos pueden no estar disponibles (URLs rotas del Ayuntamiento). Es normal y el dataset seguirá siendo válido.

### Estructura resultante

```
dataset/bocetos/
  especial/
    falla-0001.jpg
    falla-0002.jpg
    ...
  primera/
    falla-0101.jpg
    ...
  segunda/
    ...
  tercera/
    ...
  metadata.json          ← metadatos de todas las fallas descargadas
  download_errors.json   ← log de URLs que fallaron (si las hay)
```

---

## Paso 2 — Preparar el dataset

**Tiempo estimado:** 2-5 minutos  
**Resultado:** `dataset/train/20_falla_valenciana/` con imágenes + captions `.txt`

```bash
# Preparación estándar (20 repeticiones, sólo bocetos)
python3 scripts/prepare_dataset.py

# Incluir fotos tomadas con la app Encesa (si tienes)
python3 scripts/prepare_dataset.py --include-photos

# Cambiar repeticiones (más = el modelo ve cada imagen más veces)
python3 scripts/prepare_dataset.py --repetitions 15

# Ver qué haría sin modificar nada
python3 scripts/prepare_dataset.py --dry-run

# Limpiar y regenerar desde cero
python3 scripts/prepare_dataset.py --clean
```

**Qué esperar:**
```
🎭 FallAI — Preparación del dataset
==================================================

✅ Metadata: 702 fallas
🖼️  Imágenes encontradas: 687

📁 Directorio de entrenamiento: dataset/train/20_falla_valenciana
🔁 Repeticiones: 20

📋 metadata.jsonl: dataset/train/20_falla_valenciana/metadata.jsonl (687 registros)

==================================================
📊 ESTADÍSTICAS DEL DATASET
==================================================
  Total imágenes:     687
  Total efectivo:     13740  (×20 repeticiones)

  Por categoría:
    tercera     : ██████████████████████████████████████████████████  497 (72.3%)
    segunda     :  ██████  89 (13.0%)
    primera     :  ████  78 (11.4%)
    especial    :  █  20 (2.9%)

✨ Dataset listo en: dataset/train/20_falla_valenciana
```

### Ejemplo de caption generado

Archivo `dataset/train/20_falla_valenciana/falla-0001.txt`:
```
valencian falla sculpture, falla valenciana, Third category (C-tier), full-size falla, La Gran Via neighborhood, Valencia, artwork by artist José Luis Pascual Nebot, theme: Les quatre estacions, intricate polychrome wood and papier-mache sculpture, monumental street installation, Las Fallas festival 2026, Valencia Spain, elaborate figurative sculpture, vivid colors, festive street art
```

### Añadir fotos de Encesa al dataset

Cuando tengas fotos reales de fallas tomadas con la app:

```bash
# Las fotos deben estar en dataset/photos/{id_falla}.jpg
# (el nombre del archivo debe ser el ID de la falla)
mkdir -p dataset/photos

# Copiar fotos exportadas de Encesa
cp /ruta/a/fotos/*.jpg dataset/photos/

# Regenerar dataset incluyendo fotos
python3 scripts/prepare_dataset.py --include-photos --clean
```

> 💡 **Tip:** Las fotos reales de alta calidad mejorarán mucho el resultado final del LoRA. Los bocetos son el punto de partida, las fotos son el objetivo.

---

## Paso 3 — Instalar kohya_ss

**Tiempo estimado:** 20-40 minutos (primera vez)

kohya_ss es el framework de entrenamiento de LoRA más maduro para Stable Diffusion.

```bash
# Clonar kohya_ss
git clone https://github.com/bmaltais/kohya_ss.git ~/kohya_ss
cd ~/kohya_ss

# Crear entorno virtual propio de kohya
python3 -m venv venv
source venv/bin/activate

# Instalar PyTorch con CUDA 12.1 (para RTX 4070)
pip install torch==2.1.2 torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/cu121

# Instalar xFormers (optimización de memoria)
pip install xformers==0.0.23.post1 \
    --index-url https://download.pytorch.org/whl/cu121

# Instalar bitsandbytes (para AdamW8Bit — ahorra ~3GB VRAM)
pip install bitsandbytes>=0.41.0

# Instalar resto de dependencias
pip install -r requirements.txt

# Instalar accelerate y configurar
pip install accelerate
accelerate config
# → Selecciona: This machine / No distributed training / YES CUDA / fp16
```

### Descargar modelo SDXL base

```bash
# Opción 1: Via HuggingFace CLI (recomendada)
pip install huggingface_hub
python3 -c "
from huggingface_hub import snapshot_download
snapshot_download(
    'stabilityai/stable-diffusion-xl-base-1.0',
    local_dir='$HOME/models/sdxl-base-1.0',
    ignore_patterns=['*.bin', 'vae/*']  # sólo safetensors
)
"

# Opción 2: Descargar .safetensors directamente (~6.5GB)
mkdir -p ~/models
wget -O ~/models/sdxl_base_1.0.safetensors \
    "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"
```

### Verificar instalación

```bash
cd ~/kohya_ss
source venv/bin/activate
python3 -c "import torch; print('CUDA:', torch.cuda.is_available())"
python3 train_network.py --help | head -5
```

---

## Paso 4 — Entrenar el LoRA

**Tiempo estimado:** ~85 minutos para 2000 steps en RTX 4070  
**Resultado:** `models/falla_lora_v1.safetensors`

```bash
# Desde la raíz del proyecto encesa
cd ~/path/to/encesa
source .venv-fallai/bin/activate

# Entrenar (la variable KOHYA_DIR debe apuntar a tu instalación)
export KOHYA_DIR=~/kohya_ss
bash scripts/train_lora.sh
```

### Opciones del script de entrenamiento

```bash
# Dry-run: ver el comando sin ejecutar
bash scripts/train_lora.sh --dry-run

# Más steps para mejor calidad (más tiempo)
bash scripts/train_lora.sh --steps 3000

# Ajustar learning rate
bash scripts/train_lora.sh --lr 5e-5

# Usar modelo diferente
export SDXL_MODEL_PATH=~/models/mi-sdxl-personalizado
bash scripts/train_lora.sh
```

### Monitorizar el entrenamiento

```bash
# En otra terminal, iniciar TensorBoard
source ~/kohya_ss/venv/bin/activate
tensorboard --logdir=logs/

# Abrir en el navegador
open http://localhost:6006
```

**Qué esperar durante el entrenamiento:**
```
  ╔═══════════════════════════════════════╗
  ║   FallAI — LoRA SDXL Training         ║
  ║   RTX 4070 12GB | rank=32 | steps=2000 ║
  ╚═══════════════════════════════════════╝

✅ kohya_ss encontrado: ~/kohya_ss
✅ Dataset: 687 imágenes en dataset/train/20_falla_valenciana
✅ GPU: NVIDIA GeForce RTX 4070 (12288 MB VRAM)
ℹ️  Tiempo estimado: ~83 minutos

steps:  25%|███       | 500/2000 [...] loss=0.089
# Checkpoint guardado en models/checkpoints/

steps:  50%|██████    | 1000/2000 [...] loss=0.071
steps:  75%|█████████ | 1500/2000 [...] loss=0.063
steps: 100%|████████████| 2000/2000 [...] loss=0.058

✅ Entrenamiento completado en 84 minutos
✅ LoRA guardado en: models/falla_lora_v1.safetensors
```

### Checkpoints intermedios

Los checkpoints se guardan cada 500 steps en `models/checkpoints/`. Puedes usar cualquier checkpoint para probar:

```bash
python3 scripts/generate_test.py --lora models/checkpoints/falla_lora_v1-step00001000.safetensors
```

---

## Paso 5 — Probar el modelo

**Tiempo estimado:** 5-10 minutos (4 imágenes)

```bash
source .venv-fallai/bin/activate

# Prueba estándar (usa el LoRA final)
python3 scripts/generate_test.py --lora models/falla_lora_v1.safetensors

# Ver los prompts de prueba sin generar
python3 scripts/generate_test.py --list-prompts

# Ajustar influencia del LoRA (0.7 = más sutil, 1.0 = más pronunciado)
python3 scripts/generate_test.py --lora models/falla_lora_v1.safetensors --scale 0.7

# Más pasos = más detalle (más lento)
python3 scripts/generate_test.py --lora models/falla_lora_v1.safetensors --steps 40
```

**Resultados en:** `output/test_generation/{timestamp}/`

### Usar el LoRA en ComfyUI o AUTOMATIC1111

El archivo `.safetensors` es compatible con:

**ComfyUI:**
1. Copia `models/falla_lora_v1.safetensors` a `ComfyUI/models/loras/`
2. Usa el nodo `Load LoRA` con SDXL base

**AUTOMATIC1111 (WebUI):**
1. Copia el `.safetensors` a `stable-diffusion-webui/models/Lora/`
2. En el prompt: `<lora:falla_lora_v1:0.8>`
3. Usa con SDXL 1.0 como checkpoint base

**Diffusers (Python):**
```python
from diffusers import StableDiffusionXLPipeline
import torch

pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16
).to("cuda")

pipe.load_lora_weights("./models/falla_lora_v1.safetensors")

image = pipe(
    "valencian falla sculpture, falla valenciana, intricate papier-mache, "
    "Las Fallas 2026, Valencia Spain, vivid colors",
    num_inference_steps=25,
    guidance_scale=7.5,
).images[0]

image.save("mi_falla.png")
```

---

## Paso 6 — Iterar y mejorar

### Si las imágenes son demasiado genéricas (no parecen fallas)

```bash
# Opción A: Más steps de entrenamiento
bash scripts/train_lora.sh --steps 3000

# Opción B: Subir el LoRA scale en generación
python3 scripts/generate_test.py --scale 0.95

# Opción C: Más repeticiones en el dataset (más "insistencia" en el concepto)
python3 scripts/prepare_dataset.py --repetitions 30 --clean
bash scripts/train_lora.sh
```

### Si las imágenes son demasiado repetitivas (overfitting)

```bash
# Opción A: Menos repeticiones
python3 scripts/prepare_dataset.py --repetitions 10 --clean

# Opción B: Menos steps
bash scripts/train_lora.sh --steps 1500

# Opción C: Bajar LoRA scale
python3 scripts/generate_test.py --scale 0.6
```

### Mejorar con fotos reales de Encesa

Las fotos tomadas durante las Fallas 2026 son **oro puro** para el dataset. Cuantas más fotos de alta calidad, mejor:

```bash
# Exportar fotos desde Encesa
# (ver documentación de la app Encesa)

# Copiar al dataset
cp /ruta/fotos/encesa/*.jpg dataset/photos/

# Regenerar dataset con fotos + bocetos
python3 scripts/prepare_dataset.py --include-photos --clean --repetitions 15

# Reentrenar
bash scripts/train_lora.sh
```

### Workflow iterativo recomendado

```
Bocetos (702) → LoRA v1 (2000 steps) → Prueba → ¿OK?
                                                   ↓ NO
                    Fotos Encesa + bocetos → LoRA v2 (2500 steps) → Prueba
                                                                       ↓ OK
                                                             Deploy en app
```

---

## Troubleshooting

### `CUDA out of memory`

```bash
# Reducir batch size en train_lora.sh
# Editar: TRAIN_BATCH=1

# O activar CPU offload añadiendo al comando:
# --lowvram

# O reducir resolución:
# --resolution="768,768"
```

### `Loss is NaN`

```bash
# Añadir --no_half_vae (ya está en la config, verificar que está activo)
# O cambiar a bf16:
# --mixed_precision bf16
# (RTX 4070 soporta bf16 nativamente)
```

### Las imágenes generadas no parecen fallas

```bash
# Verificar que los captions incluyen el trigger word
head -1 dataset/train/20_falla_valenciana/falla-0001.txt
# Debe contener: "falla valenciana"

# Probar con scale más alto
python3 scripts/generate_test.py --scale 1.0

# Verificar dataset (número de imágenes)
ls dataset/train/20_falla_valenciana/*.jpg | wc -l
```

### Error al descargar bocetos (`SSL`, `timeout`)

```bash
# Reintentar sólo las fallidas
python3 scripts/download_bocetos.py --force

# Verificar qué falló
cat dataset/bocetos/download_errors.json | python3 -m json.tool | head -50
```

---

## Resumen de archivos del pipeline

```
encesa/
├── scripts/
│   ├── download_bocetos.py   # Paso 1: descarga imágenes oficiales
│   ├── prepare_dataset.py    # Paso 2: genera estructura kohya + captions
│   ├── train_lora.sh         # Paso 4: lanza entrenamiento
│   └── generate_test.py      # Paso 5: prueba el LoRA generando imágenes
├── config/
│   └── kohya_training.json   # Parámetros completos optimizados RTX 4070
├── dataset/
│   ├── bocetos/              # Imágenes descargadas por categoría
│   │   └── metadata.json     # Metadatos de todas las fallas
│   ├── photos/               # Fotos Encesa (opcional)
│   └── train/
│       └── 20_falla_valenciana/  # Dataset listo para kohya_ss
├── models/
│   ├── falla_lora_v1.safetensors  # LoRA entrenado final
│   └── checkpoints/              # Checkpoints intermedios
├── output/
│   └── test_generation/      # Imágenes generadas de prueba
└── TRAINING.md               # Esta guía
```

---

*FallAI — Hecho con ❤️ para preservar y generar el arte de las Fallas de Valencia*
