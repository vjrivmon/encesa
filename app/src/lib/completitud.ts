import type { Falla, Foto, Valoracion, OCRResult } from './db'

export function calcularCompletitud(
  falla: Falla,
  fotos: Foto[],
  valoracion: Valoracion | undefined,
  ocr: OCRResult | undefined
): number {
  let total = 0

  // OCR realizado: 15%
  if (falla.ocr_realizado || ocr) {
    total += 15
  }

  // Foto frontal: 25%
  const tieneFrontal = fotos.some(f => f.angulo === 'frontal')
  if (tieneFrontal) {
    total += 25
  }

  // Foto lateral (izq o der): 20%
  const tieneLateral = fotos.some(f => f.angulo === 'lateral_izq' || f.angulo === 'lateral_der')
  if (tieneLateral) {
    total += 20
  }

  // Foto trasera: 15%
  const tieneTrasera = fotos.some(f => f.angulo === 'trasera')
  if (tieneTrasera) {
    total += 15
  }

  // Valoracion completada (los 4 criterios > 0): 15%
  if (
    valoracion &&
    valoracion.originalidad > 0 &&
    valoracion.ejecucion > 0 &&
    valoracion.tematica > 0 &&
    valoracion.humor > 0
  ) {
    total += 15
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
