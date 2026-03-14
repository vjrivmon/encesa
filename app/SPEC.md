# Encesa — Especificación Técnica v1.1

## Descripción
PWA iOS instalable para capturar el registro exhaustivo de fallas de Valencia en campo durante las Fallas (15-19 marzo 2026). Diseñada para un solo usuario (Vicente). Offline-first. Sincronización manual a Supabase. Script Python para exportar dataset de entrenamiento LoRA.

## Stack
- **Frontend:** Vite + React 18 + TypeScript
- **Estilos:** Tailwind CSS v3 — diseño iOS 17 style (dark mode, SF Pro / Inter, bottom navigation, sheets modales)
- **Offline:** Dexie.js (IndexedDB wrapper)
- **Backend:** Supabase (PostgreSQL + Storage)
- **Mapa:** React-Leaflet + tiles OpenStreetMap
- **OCR:** Tesseract.js v5 (client-side, sin servidor)
- **PWA:** Vite PWA plugin (manifest + service worker, instalable en iOS Safari)

## Pantallas / Features

### 1. Mapa (tab principal)
- Mapa Leaflet con las fallas de Valencia 2026 cargadas desde la API/scraping JCF
- Si la API JCF no devuelve datos bien, usar un JSON seed con ~20 fallas representativas hardcodeadas como fallback
- Marcadores con 3 estados: verde (completa 100%), naranja (en progreso), gris (sin escanear)
- Header con barra de progreso global: "X de Y fallas · Z%"
- Al tocar un marcador → abre sheet/modal con ficha de la falla

### 2. Lista de fallas (tab Captura)
- Lista scrollable de todas las fallas ordenadas por categoría (Especial > 1a > 2a > 3a)
- Card por falla: nombre, artista, categoría (badge), barrio, barra de progreso individual
- Buscador y filtro por categoría
- Al tocar → abre ficha de falla

### 3. Ficha de falla (sheet/modal)
- Nombre, artista, barrio, categoría, lema/tema
- Anillo de progreso (circular) con % de completitud
- Checklist visual: OCR hecho · Foto frontal · Fotos laterales · Foto trasera · Valoración · Notas
- Botón "Escanear cartel" → abre OCR
- Botón "Continuar captura" → abre cámara con el ángulo pendiente siguiente
- Sección valoraciones: 4 criterios con estrellas (1-5): Originalidad, Ejecución, Temática, Humor
- Campo de notas de texto libre

### 4. Cámara
- Acceso a cámara trasera del iPhone vía getUserMedia
- Indicador de ángulo actual: F (Frontal) · L.I. (Lateral Izq.) · L.D. (Lateral Der.) · T (Trasera) · Det. (Detalle)
- Chips visuales con estado: completado (verde) / activo (naranja) / pendiente (gris)
- Botón de disparo grande (shutter)
- Miniatura de última foto tomada
- Sin límite de fotos por ángulo

### 5. OCR — Escanear cartel
- Cámara enfocada en modo "documento"
- Marco de encuadre animado (esquinas naranjas, línea de escaneo)
- Al capturar → Tesseract.js extrae el texto
- Resultados parseados en campos: Nombre, Artista, Categoría, Lema
- Porcentaje de confianza por campo
- Edición manual de cualquier campo antes de confirmar
- Al confirmar → guarda en Dexie y marca OCR como completado

### 6. Galería
- Grid 2x2 de fallas escaneadas, ordenadas por última actualización
- Miniatura de la primera foto de cada falla
- Badge con % de completitud sobre cada miniatura
- Al tocar → abre ficha de falla

### 7. Sync
- Estado: última sincronización, dot verde/rojo
- Stats: fallas registradas, fotos pendientes, tamaño estimado
- Destino: Supabase Storage + PostgreSQL
- Botón prominente "Sincronizar ahora"
- Caption: "Solo se sincroniza cuando tú lo decides"
- Bloque con comando del script Python

## Data Model (IndexedDB + PostgreSQL)

```typescript
interface Falla {
  id: string;           // uuid
  nombre: string;
  barrio: string;
  artista: string;
  categoria: 'especial' | 'primera' | 'segunda' | 'tercera';
  lema?: string;
  anyo: number;         // 2026
  lat: number;
  lng: number;
  estado: 'pendiente' | 'en_progreso' | 'completa';
  completitud_pct: number; // 0-100
  valoracion?: Valoracion;
  notas?: string;
  ocr_realizado: boolean;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

interface Foto {
  id: string;
  falla_id: string;
  angulo: 'frontal' | 'lateral_izq' | 'lateral_der' | 'trasera' | 'detalle' | 'libre';
  data_url: string;     // base64 local
  url_storage?: string; // URL Supabase tras sync
  synced: boolean;
  capturada_at: string;
}

interface Valoracion {
  originalidad: number; // 1-5
  ejecucion: number;
  tematica: number;
  humor: number;
}

interface OCRResult {
  id: string;
  falla_id: string;
  campos: Record<string, { valor: string; confianza: number }>;
  foto_cartel_id: string;
  procesado_at: string;
}
```

## Cálculo de completitud

```
checklist = [
  ocr_realizado (peso: 15%),
  tiene foto frontal (peso: 25%),
  tiene foto lateral (peso: 20%),
  tiene foto trasera (peso: 15%),
  valoracion completada (peso: 15%),
  notas escritas (peso: 10%)
]
completitud_pct = suma pesos de items completados
```

## Diseño iOS — Reglas obligatorias

- **Sin emojis** — solo iconos SVG inline
- Fondo: #000000 (pantallas cámara/OCR) / #1c1c1e (general)
- Accent color: #FF6B35
- Fuente: Inter (fallback -apple-system)
- Tab bar fijo inferior con blur/vidrioso (backdrop-filter)
- Nav bar superior con blur
- Cards con border-radius 13px, fondo #1c1c1e, borde 0.5px #3a3a3c
- Bottom sheets con handle y animación slide-up
- Botones primarios: rounded-xl, bg #FF6B35, font-weight 600
- Progress bars: finas (3-4px), con gradiente naranja

## Estructura de carpetas

```
src/
├── features/
│   ├── map/
│   │   ├── MapView.tsx
│   │   ├── FallaMarker.tsx
│   │   └── useMapData.ts
│   ├── capture/
│   │   ├── FallasList.tsx
│   │   ├── FallaCard.tsx
│   │   ├── FallaSheet.tsx
│   │   └── useFallas.ts
│   ├── camera/
│   │   ├── CameraView.tsx
│   │   └── useCamera.ts
│   ├── ocr/
│   │   ├── OCRView.tsx
│   │   └── useOCR.ts
│   ├── gallery/
│   │   └── GalleryView.tsx
│   └── sync/
│       ├── SyncView.tsx
│       └── useSync.ts
├── lib/
│   ├── db.ts           # Dexie.js schema
│   ├── supabase.ts     # Supabase client
│   ├── jcf.ts          # Datos JCF + fallback JSON
│   └── completitud.ts  # Cálculo de %
├── components/
│   ├── TabBar.tsx
│   ├── NavBar.tsx
│   ├── BottomSheet.tsx
│   ├── ProgressRing.tsx
│   ├── StarRating.tsx
│   └── Badge.tsx
└── App.tsx
```

## Supabase — Variables de entorno

Usar estas variables (configurar en .env.local):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
El cliente debe funcionar con estas variables. Crear las tablas SQL en un archivo `supabase/schema.sql`.

## PWA

- `vite.config.ts` con `@vite-pwa/vite-plugin`
- `manifest.webmanifest`: name "Encesa", short_name "Encesa", theme_color "#FF6B35", background_color "#000000", display "standalone", icons 192 y 512
- Service worker con cache offline de assets
- Meta tags para iOS: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`

## Script Python (encesa_sync.py)

En la raíz del repo, crear `scripts/encesa_sync.py`:
- Lee SUPABASE_URL y SUPABASE_KEY de variables de entorno o `.env`
- Descarga todas las fallas de PostgreSQL
- Descarga todas las fotos de Storage
- Organiza en: `dataset/2026/{categoria}/{barrio}_{nombre_falla}/photos/`
- Crea `metadata.json` por falla con todos los campos
- Imprime progreso por consola
- Requiere: `pip install supabase python-dotenv`

## Datos JCF fallback

Si la API JCF no está disponible o no devuelve datos estructurados, usar un JSON seed en `src/lib/jcf-seed.ts` con al menos 20 fallas reales de Las Fallas 2026 (inventa datos plausibles con nombres reales de artistas falleros, barrios y coordenadas de Valencia).

## Comandos de desarrollo

```bash
npm create vite@latest . -- --template react-ts
npm install
npm run dev    # http://localhost:5173
npm run build  # dist/
```

## Git

- Branch: main
- Remote: git@github.com:vjrivmon/encesa.git
- Commits en español, descriptivos
- Hacer push al finalizar cada feature importante
