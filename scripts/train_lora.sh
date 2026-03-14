#!/usr/bin/env bash
# =============================================================================
# FallAI — Entrenamiento LoRA SDXL en RTX 4070 12GB
# =============================================================================
# Uso:
#   bash scripts/train_lora.sh
#   bash scripts/train_lora.sh --steps 3000   # override
#   bash scripts/train_lora.sh --dry-run      # sólo mostrar comando
#
# Prerequisitos:
#   - kohya_ss instalado (ver TRAINING.md Paso 3)
#   - Dataset preparado (ver TRAINING.md Paso 2)
#   - SDXL base descargado en $SDXL_MODEL_PATH
# =============================================================================

set -euo pipefail

# ────────── Colores ──────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${CYAN}ℹ️  $*${NC}"; }
ok()    { echo -e "${GREEN}✅ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $*${NC}"; }
err()   { echo -e "${RED}❌ $*${NC}"; }
step()  { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }

# ────────── Rutas ──────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TRAIN_DIR="$PROJECT_ROOT/dataset/train"
MODELS_DIR="$PROJECT_ROOT/models"
CHECKPOINTS_DIR="$MODELS_DIR/checkpoints"
OUTPUT_NAME="falla_lora_v1"
OUTPUT_MODEL="$MODELS_DIR/${OUTPUT_NAME}.safetensors"
LOG_DIR="$PROJECT_ROOT/logs"

# ────────── Kohya_ss ──────────
KOHYA_DIR="${KOHYA_DIR:-$HOME/kohya_ss}"
TRAIN_SCRIPT="$KOHYA_DIR/train_network.py"

# ────────── Modelo base SDXL ──────────
# Descarga desde HuggingFace si no existe: stabilityai/stable-diffusion-xl-base-1.0
SDXL_MODEL_PATH="${SDXL_MODEL_PATH:-$HOME/models/sdxl-base-1.0}"

# ────────── Hiperparámetros (RTX 4070 12GB) ──────────
LORA_RANK=32
LORA_ALPHA=16
TRAIN_BATCH=2
GRAD_ACCUM=2          # effective batch = 4
MAX_STEPS=2000
LR=1e-4
LR_SCHEDULER="cosine_with_restarts"
LR_WARMUP_STEPS=100
RESOLUTION=1024       # SDXL nativo
SAVE_EVERY=500        # checkpoints cada N steps
CLASS_NAME="falla_valenciana"
REPETITIONS=20        # debe coincidir con prepare_dataset.py

# ────────── Parseo de args ──────────
DRY_RUN=false
for arg in "$@"; do
    case $arg in
        --dry-run) DRY_RUN=true ;;
        --steps=*) MAX_STEPS="${arg#*=}" ;;
        --rank=*)  LORA_RANK="${arg#*=}" ;;
        --lr=*)    LR="${arg#*=}" ;;
        *) warn "Argumento desconocido: $arg" ;;
    esac
done

# ────────── Banner ──────────
echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   FallAI — LoRA SDXL Training         ║"
echo "  ║   RTX 4070 12GB | rank=$LORA_RANK | steps=$MAX_STEPS    ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ────────── Verificaciones ──────────
step "Verificando entorno..."

# 1. kohya_ss
if [ ! -f "$TRAIN_SCRIPT" ]; then
    err "kohya_ss no encontrado en: $KOHYA_DIR"
    echo ""
    echo "  Instala kohya_ss:"
    echo "    git clone https://github.com/bmaltais/kohya_ss.git ~/kohya_ss"
    echo "    cd ~/kohya_ss"
    echo "    python3 -m venv venv && source venv/bin/activate"
    echo "    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121"
    echo "    pip install -r requirements.txt"
    echo ""
    echo "  O define KOHYA_DIR=/ruta/a/kohya_ss"
    exit 1
fi
ok "kohya_ss encontrado: $KOHYA_DIR"

# 2. Dataset
TRAIN_CLASS_DIR="$TRAIN_DIR/${REPETITIONS}_${CLASS_NAME}"
if [ ! -d "$TRAIN_CLASS_DIR" ]; then
    err "Dataset no encontrado: $TRAIN_CLASS_DIR"
    echo "  Ejecuta primero:"
    echo "    python3 scripts/prepare_dataset.py"
    exit 1
fi

IMG_COUNT=$(find "$TRAIN_CLASS_DIR" -name "*.jpg" | wc -l)
if [ "$IMG_COUNT" -eq 0 ]; then
    err "No hay imágenes en $TRAIN_CLASS_DIR"
    exit 1
fi
ok "Dataset: $IMG_COUNT imágenes en $TRAIN_CLASS_DIR"

# 3. Modelo SDXL
if [ ! -d "$SDXL_MODEL_PATH" ] && [ ! -f "$SDXL_MODEL_PATH" ]; then
    warn "Modelo SDXL no encontrado: $SDXL_MODEL_PATH"
    echo ""
    echo "  Descarga el modelo base SDXL:"
    echo "    pip install huggingface_hub"
    echo "    python3 -c \""
    echo "    from huggingface_hub import snapshot_download"
    echo "    snapshot_download('stabilityai/stable-diffusion-xl-base-1.0',"
    echo "                      local_dir='$HOME/models/sdxl-base-1.0')\""
    echo ""
    echo "  O define SDXL_MODEL_PATH=/ruta/al/modelo"
    echo ""
    echo "  Continuando con ruta configurada (fallará si no existe al entrenar)..."
fi

# 4. GPU
if command -v nvidia-smi &>/dev/null; then
    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
    ok "GPU: $GPU_INFO MB VRAM"
else
    warn "nvidia-smi no disponible — asegúrate de tener CUDA instalado"
fi

# ────────── Crear directorios ──────────
mkdir -p "$CHECKPOINTS_DIR" "$LOG_DIR"

# ────────── Comando de entrenamiento ──────────
step "Preparando comando de entrenamiento..."

TRAIN_CMD=(
    python3 "$TRAIN_SCRIPT"
    # Modelo base
    --pretrained_model_name_or_path="$SDXL_MODEL_PATH"
    --model_as_default_network
    # Dataset
    --train_data_dir="$TRAIN_DIR"
    --dataset_config=""   # sin config extra (usa estructura de carpetas)
    # LoRA específico
    --network_module=networks.lora
    --network_dim=$LORA_RANK
    --network_alpha=$LORA_ALPHA
    # Output
    --output_dir="$MODELS_DIR"
    --output_name="$OUTPUT_NAME"
    --save_model_as=safetensors
    # Checkpoints
    --save_every_n_steps=$SAVE_EVERY
    --save_state
    # Resolución y procesamiento
    --resolution="${RESOLUTION},${RESOLUTION}"
    --enable_bucket
    --min_bucket_reso=768
    --max_bucket_reso=1024
    # Entrenamiento
    --max_train_steps=$MAX_STEPS
    --train_batch_size=$TRAIN_BATCH
    --gradient_accumulation_steps=$GRAD_ACCUM
    --gradient_checkpointing
    # Precisión — fp16 para RTX 4070
    --mixed_precision=fp16
    --save_precision=fp16
    # Learning rate
    --learning_rate=$LR
    --unet_lr=$LR
    --text_encoder_lr=$(echo "$LR * 0.5" | bc -l | xargs printf "%.0e")
    --lr_scheduler=$LR_SCHEDULER
    --lr_warmup_steps=$LR_WARMUP_STEPS
    # Optimizador — AdamW8bit para ahorrar VRAM
    --optimizer_type=AdamW8Bit
    # SDXL específico
    --sdxl
    --no_half_vae
    # Logging
    --logging_dir="$LOG_DIR"
    --log_with=tensorboard
    # Misc
    --seed=42
    --max_data_loader_n_workers=4
    --caption_extension=.txt
    --shuffle_caption
    --keep_tokens=2
    # XFormers para eficiencia de memoria
    --xformers
)

# Alternativa con accelerate (recomendada)
ACCELERATE_CMD=(
    accelerate launch
    --num_cpu_threads_per_process=4
    "${TRAIN_CMD[@]}"
)

# ────────── Mostrar configuración ──────────
echo ""
info "Configuración de entrenamiento:"
echo "  SDXL model:       $SDXL_MODEL_PATH"
echo "  Train dir:        $TRAIN_DIR"
echo "  Imágenes:         $IMG_COUNT"
echo "  LoRA rank/alpha:  $LORA_RANK / $LORA_ALPHA"
echo "  Batch size:       $TRAIN_BATCH (acum: $GRAD_ACCUM → efectivo: $((TRAIN_BATCH * GRAD_ACCUM)))"
echo "  Steps:            $MAX_STEPS"
echo "  Learning rate:    $LR ($LR_SCHEDULER)"
echo "  Resolución:       ${RESOLUTION}x${RESOLUTION}"
echo "  Mixed precision:  fp16"
echo "  Output:           $OUTPUT_MODEL"
echo "  Checkpoints:      cada $SAVE_EVERY steps en $CHECKPOINTS_DIR"
echo ""

# Tiempo estimado: ~2-3 segundos por step en RTX 4070 con batch 2
EST_MINUTES=$(echo "$MAX_STEPS * 2.5 / 60" | bc 2>/dev/null || echo "~83")
info "Tiempo estimado: ~${EST_MINUTES} minutos (~$((MAX_STEPS * 2500 / 60000)) h en RTX 4070)"
echo ""

if [ "$DRY_RUN" = true ]; then
    warn "DRY-RUN — No se ejecutará el entrenamiento"
    echo ""
    echo "Comando que se ejecutaría:"
    echo "${ACCELERATE_CMD[*]}" | fold -w 100
    exit 0
fi

# ────────── Activar venv kohya ──────────
if [ -f "$KOHYA_DIR/venv/bin/activate" ]; then
    # shellcheck disable=SC1090
    source "$KOHYA_DIR/venv/bin/activate"
    ok "venv kohya activado"
elif [ -n "${VIRTUAL_ENV:-}" ]; then
    ok "venv ya activo: $VIRTUAL_ENV"
else
    warn "No se encontró venv de kohya. Asegúrate de activarlo manualmente."
fi

# ────────── Ejecutar entrenamiento ──────────
step "Iniciando entrenamiento..."
echo ""
echo -e "${YELLOW}  Monitoriza el progreso con TensorBoard:${NC}"
echo "    tensorboard --logdir=$LOG_DIR &"
echo "    # Abre: http://localhost:6006"
echo ""

START_TIME=$(date +%s)

if command -v accelerate &>/dev/null; then
    info "Usando accelerate launcher"
    "${ACCELERATE_CMD[@]}"
else
    warn "accelerate no disponible, lanzando directamente"
    "${TRAIN_CMD[@]}"
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
ELAPSED_MIN=$((ELAPSED / 60))

echo ""
ok "Entrenamiento completado en ${ELAPSED_MIN} minutos"
ok "LoRA guardado en: $OUTPUT_MODEL"
echo ""
echo "👉 Siguiente paso — probar el modelo:"
echo "   python3 scripts/generate_test.py --lora $OUTPUT_MODEL"
