import type { Falla, Foto, Valoracion, OCRResult } from './db'

export function calcularCompletitud(
  falla: Falla,
  fotos: Foto[],
  valoracion: Valoracion | undefined,
  ocr: OCRResult | undefined
): number {
  let total = 0

  // OCR realizado: 30%
  if (falla.ocr_realizado || ocr) {
    total += 30
  }

  // Tiene al menos 1 foto: 35%
  if (fotos.length >= 1) {
    total += 35
  }

  // Valoracion completada (los 4 criterios > 0): 25%
  if (
    valoracion &&
    valoracion.originalidad > 0 &&
    valoracion.ejecucion > 0 &&
    valoracion.tematica > 0 &&
    valoracion.humor > 0
  ) {
    total += 25
  }

  // Notas escritas: 10%
  if (falla.notas && falla.notas.trim().length > 0) {
    total += 10
  }

  return Math.min(100, total)
}

export function getEstadoFromCompletitud(pct: number): Falla['estado'] {
  if (pct === 0) return 'pendiente'
  if (pct === 100) return 'completa'
  return 'en_progreso'
}
