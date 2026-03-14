// jcf.ts — Carga datos de fallas desde la API oficial del Ayuntamiento de València
// Con fallback al seed local (702 fallas) cuando no hay conexión

import { JCF_FALLAS_2026, type FallaData } from './jcf-seed';

const API_BASE = 'https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets';
const CACHE_KEY = 'encesa_jcf_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

interface CacheEntry {
  timestamp: number;
  data: FallaData[];
}

function getCache(): FallaData[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function setCache(data: FallaData[]): void {
  try {
    const entry: CacheEntry = { timestamp: Date.now(), data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage lleno — ignorar
  }
}

async function fetchFromAPI(dataset: string, tipo: 'grande' | 'infantil'): Promise<FallaData[]> {
  const allResults: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${API_BASE}/${dataset}/records?limit=${limit}&offset=${offset}&lang=es`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    allResults.push(...data.results);
    if (allResults.length >= data.total_count || !data.results.length) break;
    offset += limit;
  }

  return allResults
    .filter((f) => f.geo_point_2d)
    .map((f, i) => {
      const geo = f.geo_point_2d as { lat: number; lon: number };
      const seccion = String(f.seccion || '');
      return {
        id: `api-${tipo}-${i + 1}`,
        nombre: String(f.nombre || '') + (tipo === 'infantil' ? ' (Infantil)' : ''),
        barrio: seccion || 'Valencia',
        artista: String(f.artista || ''),
        categoria: tipo === 'grande'
          ? getCategoriaGrande(seccion)
          : getCategoriaInfantil(seccion),
        lema: String(f.lema || ''),
        anyo: 2026,
        lat: geo.lat,
        lng: geo.lon,
        estado: 'pendiente' as const,
        completitud_pct: 0,
        ocr_realizado: false,
        tipo,
        boceto: String(f.boceto || ''),
        fallera: String(f.fallera || ''),
        presidente: String(f.presidente || ''),
        anyo_fundacion: (f.anyo_fundacion as number) ?? null,
        synced: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });
}

function getCategoriaGrande(seccion: string): FallaData['categoria'] {
  const s = seccion.trim().toUpperCase();
  if (s === 'ESPECIAL') return 'especial';
  if (s.startsWith('1')) return 'primera';
  if (s.startsWith('2')) return 'segunda';
  return 'tercera';
}

function getCategoriaInfantil(seccion: string): FallaData['categoria'] {
  const n = parseInt(seccion.trim(), 10);
  if (n === 1) return 'especial';
  if (n <= 4) return 'primera';
  if (n <= 8) return 'segunda';
  return 'tercera';
}

export async function cargarFallas(): Promise<FallaData[]> {
  // 1. Cache válida
  const cached = getCache();
  if (cached) return cached;

  // 2. API en tiempo real
  try {
    const [grandes, infantiles] = await Promise.all([
      fetchFromAPI('falles-fallas', 'grande'),
      fetchFromAPI('falles-infantils-fallas-infantiles', 'infantil'),
    ]);
    const all = [...grandes, ...infantiles];
    setCache(all);
    return all;
  } catch {
    // Sin conexión o error → fallback seed
    console.info('[Encesa] API JCF no disponible, usando seed local (702 fallas)');
    return JCF_FALLAS_2026;
  }
}

export type { FallaData };
