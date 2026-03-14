import Dexie, { type Table } from 'dexie'

export interface Falla {
  id: string
  nombre: string
  barrio: string
  artista: string
  categoria: 'especial' | 'primera' | 'segunda' | 'tercera'
  lema?: string
  anyo: number
  lat: number
  lng: number
  estado: 'pendiente' | 'en_progreso' | 'completa'
  completitud_pct: number
  notas?: string
  ocr_realizado: boolean
  created_at: string
  updated_at: string
  synced: boolean
}

export interface Foto {
  id: string
  falla_id: string
  angulo: 'frontal' | 'lateral_izq' | 'lateral_der' | 'trasera' | 'detalle' | 'libre'
  data_url: string
  url_storage?: string
  synced: boolean
  capturada_at: string
}

export interface Valoracion {
  id: string
  falla_id: string
  originalidad: number
  ejecucion: number
  tematica: number
  humor: number
  updated_at: string
  synced: boolean
}

export interface OCRResult {
  id: string
  falla_id: string
  campos: Record<string, { valor: string; confianza: number }>
  foto_cartel_id: string
  procesado_at: string
  synced: boolean
}

export class EncesaDB extends Dexie {
  fallas!: Table<Falla>
  fotos!: Table<Foto>
  valoraciones!: Table<Valoracion>
  ocr_results!: Table<OCRResult>

  constructor() {
    super('EncesaDB')
    this.version(1).stores({
      fallas: 'id, categoria, barrio, estado, synced, updated_at',
      fotos: 'id, falla_id, angulo, synced, capturada_at',
      valoraciones: 'id, falla_id, synced',
      ocr_results: 'id, falla_id, synced',
    })
  }
}

export const db = new EncesaDB()
