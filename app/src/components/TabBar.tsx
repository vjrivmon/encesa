interface TabBarProps {
  activeTab: 'mapa' | 'captura' | 'galeria' | 'sync'
  onTabChange: (tab: 'mapa' | 'captura' | 'galeria' | 'sync') => void
}

const MapIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"
      stroke={active ? '#FF6B35' : '#8e8e93'}
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="none"
    />
    <path d="M9 3v15M15 6v15" stroke={active ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5" />
  </svg>
)

const CameraIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect
      x="2" y="6" width="20" height="14" rx="3"
      stroke={active ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5"
    />
    <circle cx="12" cy="13" r="4" stroke={active ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5" />
    <path d="M8 6l2-3h4l2 3" stroke={active ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
)

const GalleryIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="8" height="8" rx="2" stroke={active ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="2" stroke={active ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="2" stroke={active ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="2" stroke={active ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5" />
  </svg>
)

const SyncIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 12a8 8 0 018-8 8 8 0 016.32 3.09M20 12a8 8 0 01-8 8 8 8 0 01-6.32-3.09"
      stroke={active ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5" strokeLinecap="round"
    />
    <path d="M18 4l1.5 3.09L22 5.5M6 20l-1.5-3.09L2 18.5" stroke={active ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const TABS = [
  { id: 'mapa' as const, label: 'Mapa', Icon: MapIcon },
  { id: 'captura' as const, label: 'Captura', Icon: CameraIcon },
  { id: 'galeria' as const, label: 'Galería', Icon: GalleryIcon },
  { id: 'sync' as const, label: 'Sync', Icon: SyncIcon },
]

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '86px',
        paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        background: 'rgba(28,28,30,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '0.5px solid #3a3a3c',
        display: 'flex',
        alignItems: 'flex-start',
        zIndex: 1000,
      }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              paddingTop: '10px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: isActive ? '#FF6B35' : '#8e8e93',
              fontSize: '10px',
              fontWeight: isActive ? 600 : 400,
              fontFamily: 'Inter, -apple-system, sans-serif',
              transition: 'color 0.2s',
            }}
          >
            <Icon active={isActive} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
