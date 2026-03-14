import type { Falla } from '../../lib/db'
import Badge from '../../components/Badge'
import ProgressRing from '../../components/ProgressRing'

interface FallaCardProps {
  falla: Falla
  onClick: (falla: Falla) => void
}

export default function FallaCard({ falla, onClick }: FallaCardProps) {
  return (
    <button
      onClick={() => onClick(falla)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        background: '#2c2c2e',
        border: '0.5px solid #3a3a3c',
        borderRadius: '13px',
        padding: '14px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'opacity 0.15s',
      }}
    >
      <ProgressRing percentage={falla.completitud_pct} size={48} strokeWidth={3} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '4px',
        }}>
          <span style={{
            fontSize: '15px',
            fontWeight: 600,
            color: '#fff',
            fontFamily: 'Inter, -apple-system, sans-serif',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {falla.nombre}
          </span>
          <Badge categoria={falla.categoria} />
        </div>

        <div style={{ fontSize: '13px', color: '#8e8e93', marginBottom: '4px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
          {falla.artista}
        </div>

        <div style={{ fontSize: '12px', color: '#636366', fontFamily: 'Inter, -apple-system, sans-serif' }}>
          {falla.barrio}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: '8px', height: '3px', background: '#3a3a3c', borderRadius: '2px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${falla.completitud_pct}%`,
              background: falla.completitud_pct === 100 ? '#34c759' : 'linear-gradient(90deg, #FF6B35, #ff9500)',
              borderRadius: '2px',
              transition: 'width 0.5s ease',
            }}
          />
        </div>
      </div>

      {/* Chevron */}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M6 4l4 4-4 4" stroke="#3a3a3c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
