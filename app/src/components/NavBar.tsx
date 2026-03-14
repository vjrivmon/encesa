import { type ReactNode } from 'react'

interface NavBarProps {
  title: string
  leftButton?: ReactNode
  rightButton?: ReactNode
}

export default function NavBar({ title, leftButton, rightButton }: NavBarProps) {
  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 'calc(44px + env(safe-area-inset-top, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'rgba(28,28,30,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid #3a3a3c',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingBottom: '8px',
        zIndex: 100,
      }}
    >
      <div style={{ width: 64, display: 'flex', justifyContent: 'flex-start' }}>
        {leftButton}
      </div>
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
      <div style={{ width: 64, display: 'flex', justifyContent: 'flex-end' }}>
        {rightButton}
      </div>
    </header>
  )
}
