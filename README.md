# Encesa

PWA iOS instalable para capturar el registro exhaustivo de fallas de Valencia durante las Fallas 2026 (15-19 marzo). Disenada para un solo usuario, offline-first, con sincronizacion manual a Supabase. Incluye script Python para exportar dataset de entrenamiento LoRA.

## Stack

- **Frontend:** Vite + React 18 + TypeScript
- **Estilos:** Tailwind CSS v3 — diseno iOS 17 dark mode
- **Offline:** Dexie.js (IndexedDB)
- **Backend:** Supabase (PostgreSQL + Storage)
- **Mapa:** React-Leaflet + OpenStreetMap
- **OCR:** Tesseract.js v5 (client-side)
- **PWA:** vite-plugin-pwa (instalable en iOS Safari)

## Instalacion

```bash
git clone git@github.com:vjrivmon/encesa.git
cd encesa/app
npm install
cp .env.example .env.local
# Edita .env.local con tus credenciales Supabase
npm run dev
```

## Variables de entorno

Crea `app/.env.local` (no lo subas a git):

```env
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Base de datos Supabase

1. Crea un proyecto en https://supabase.com
2. Ve al SQL Editor y ejecuta `supabase/schema.sql`
3. Crea un bucket de Storage llamado `encesa-fotos` (publico)
4. Copia la URL y la anon key en tu `.env.local`

## Comandos

```bash
# Desarrollo
npm run dev          # http://localhost:5173

# Build para produccion
npm run build        # genera dist/

# Vista previa del build
npm run preview
```

## Instalar en iOS

1. Abre `http://tu-ip:5173` en Safari (iPhone en misma red)
2. Toca el boton de compartir
3. "Anadir a pantalla de inicio"
4. La app funciona sin conexion

## Pantallas

| Pantalla | Descripcion |
|----------|-------------|
| Mapa | Mapa Leaflet con las 20 fallas del seed. Marcadores por estado (gris/naranja/verde). Barra de progreso global. |
| Captura | Lista de fallas con busqueda y filtro por categoria. Ficha con checklist, valoracion por estrellas y notas. |
| Galeria | Grid 2 columnas con foto de portada y badge de completitud. |
| Sync | Stats, boton de sincronizacion a Supabase, bloque del script Python. |
| Camara | Acceso a camara trasera. Selector de angulo (F/L.I./L.D./T/Det.). Captura y guarda en IndexedDB. |
| OCR | Escanea el cartel de una falla. Tesseract.js extrae texto. Edicion manual de campos. |

## Calculo de completitud

| Item | Peso |
|------|------|
| OCR del cartel | 15% |
| Foto frontal | 25% |
| Foto lateral | 20% |
| Foto trasera | 15% |
| Valoracion completada | 15% |
| Notas escritas | 10% |

## Script Python — Exportar dataset

```bash
cd encesa
pip install -r scripts/requirements.txt
# Configura SUPABASE_URL y SUPABASE_KEY en .env
python scripts/encesa_sync.py
```

Genera la estructura:
```
dataset/2026/
  especial/
    el_mercat_na_jordana/
      photos/
        foto-xxx_frontal.jpg
      metadata.json
  primera/
  segunda/
  tercera/
```

## Estructura del proyecto

```
encesa/
  app/                  # PWA React
    src/
      features/         # Pantallas (map, capture, camera, ocr, gallery, sync)
      components/       # Componentes UI (TabBar, NavBar, BottomSheet, ...)
      lib/              # DB, Supabase, seed, completitud
    public/             # Assets estaticos
  supabase/
    schema.sql          # SQL para crear tablas
  scripts/
    encesa_sync.py      # Exportador de dataset
    requirements.txt
```

## Diseno

- Fondo: `#1c1c1e` (general) / `#000000` (camara y OCR)
- Accent: `#FF6B35`
- Fuente: Inter / -apple-system
- Tab bar + nav bar: blur glassmorphism
- Cards: border-radius 13px, borde 0.5px
- Sin emojis — solo SVG icons

## Licencia

Uso personal — Vicente Rivas Montesinos, 2026.
