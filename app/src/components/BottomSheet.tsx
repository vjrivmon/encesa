import { type ReactNode, useEffect } from 'react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}

export default function BottomSheet({ isOpen, onClose, children, title }: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Sheet */}
      <div
        className="animate-slide-up"
        onTouchMove={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
        style={{
          position: 'relative',
          background: '#1c1c1e',
          borderRadius: '20px 20px 0 0',
          borderTop: '0.5px solid #3a3a3c',
          maxHeight: '90vh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 86px)',
        }}
      >
        {/* Handle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: '12px',
            paddingBottom: '8px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '4px',
              background: '#3a3a3c',
              borderRadius: '2px',
            }}
          />
        </div>

        {/* Title */}
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: '20px',
              paddingRight: '20px',
              paddingBottom: '16px',
              borderBottom: '0.5px solid #3a3a3c',
            }}
          >
            <span
              style={{
                fontSize: '17px',
                fontWeight: 600,
                color: '#ffffff',
                fontFamily: 'Inter, -apple-system, sans-serif',
              }}
            >
              {title}
            </span>
            <button
              onClick={onClose}
              style={{
                background: '#3a3a3c',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#8e8e93',
                fontSize: '16px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="#8e8e93" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div>{children}</div>
      </div>
    </div>
  )
}
