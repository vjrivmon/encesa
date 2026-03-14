interface ProgressRingProps {
  percentage: number
  size?: number
  strokeWidth?: number
}

export default function ProgressRing({ percentage, size = 56, strokeWidth = 4 }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.min(100, Math.max(0, percentage))
  const dashOffset = circumference - (progress / 100) * circumference

  const getColor = (pct: number) => {
    if (pct === 100) return '#34c759'
    if (pct > 0) return '#FF6B35'
    return '#3a3a3c'
  }

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#3a3a3c"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(progress)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      {/* Percentage text */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size > 48 ? '12px' : '9px',
          fontWeight: 600,
          color: getColor(progress),
          fontFamily: 'Inter, -apple-system, sans-serif',
          lineHeight: 1,
        }}
      >
        {progress}
      </div>
    </div>
  )
}
