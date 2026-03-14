interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  size?: number
  readOnly?: boolean
}

function StarIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={filled ? '#ff9500' : '#3a3a3c'}
        stroke={filled ? '#ff9500' : '#3a3a3c'}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function StarRating({ value, onChange, size = 24, readOnly = false }: StarRatingProps) {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onClick={() => !readOnly && onChange?.(star)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: readOnly ? 'default' : 'pointer',
            lineHeight: 0,
          }}
          disabled={readOnly}
        >
          <StarIcon filled={star <= value} size={size} />
        </button>
      ))}
    </div>
  )
}
