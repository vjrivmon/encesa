import type { Falla } from '../lib/db'

interface BadgeProps {
  categoria: Falla['categoria']
  size?: 'sm' | 'md'
}

const COLORS: Record<Falla['categoria'], { bg: string; text: string; label: string }> = {
  especial: { bg: 'rgba(255,107,53,0.2)', text: '#FF6B35', label: 'Especial' },
  primera:  { bg: 'rgba(52,199,89,0.2)', text: '#34c759', label: '1a' },
  segunda:  { bg: 'rgba(10,132,255,0.2)', text: '#0a84ff', label: '2a' },
  tercera:  { bg: 'rgba(142,142,147,0.2)', text: '#8e8e93', label: '3a' },
}

export default function Badge({ categoria, size = 'sm' }: BadgeProps) {
  const { bg, text, label } = COLORS[categoria]
  const isPadding = size === 'md' ? '4px 10px' : '2px 8px'
  const fontSize = size === 'md' ? '12px' : '11px'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: bg,
        color: text,
        fontSize,
        fontWeight: 600,
        padding: isPadding,
        borderRadius: '6px',
        fontFamily: 'Inter, -apple-system, sans-serif',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
