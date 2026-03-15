import type { Falla, Foto, Valoracion, OCRResult } from './db'

export function calcularCompletitud(
  falla: Falla,
  fotos: Foto[],
  valoracion: Valoracion | undefined,
  _ocr?: OCRResult | undefined   // parámetro mantenido por compatibilidad, no usado
): number {
  let total = 0

  // Tiene al menos 1 foto: 50%
  // (peso aumentado — principal acción de captura)
  if (fotos.length >= 1) {
    total += 50
  }

  // Valoracion completada (los 4 criterios > 0): 35%
  if (
    valoracion &&
    valoracion.originalidad > 0 &&
    valoracion.ejecucion > 0 &&
    valoracion.tematica > 0 &&
    valoracion.humor > 0
  ) {
    total += 35
  }

  // Notas escritas: 15%
  if (falla.notas && falla.notas.trim().length > 0) {
    total += 15
  }

  return Math.min(100, total)
}

export function getEstadoFromCompletitud(pct: number): Falla['estado'] {
  if (pct === 0) return 'pendiente'
  if (pct === 100) return 'completa'
  return 'en_progreso'
}
