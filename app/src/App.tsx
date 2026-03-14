import { useState, useCallback } from 'react'
import type { RouteResult } from './lib/routing'
import TabBar from './components/TabBar'
import NavBar from './components/NavBar'
import MapView from './features/map/MapView'
import FallasList from './features/capture/FallasList'
import CameraView from './features/camera/CameraView'
import OCRView from './features/ocr/OCRView'
import GalleryView from './features/gallery/GalleryView'
import SyncView from './features/sync/SyncView'

type Tab = 'mapa' | 'captura' | 'galeria' | 'sync'
type SubView = 'camera' | 'ocr' | null

const TAB_TITLES: Record<Tab, string> = {
  mapa: 'Encesa',
  captura: 'Captura',
  galeria: 'Galeria',
  sync: 'Sincronizar',
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('mapa')
  const [subView, setSubView] = useState<SubView>(null)
  const [cameraFallaId, setCameraFallaId] = useState<string | undefined>()
  const [autoOpenFallaId, setAutoOpenFallaId] = useState<string | undefined>()
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null)
  const [routeStep, setRouteStep] = useState(0)
  const clearRoute = useCallback(() => { setActiveRoute(null); setRouteStep(0) }, [])

  function openCamera(fallaId?: string) {
    setCameraFallaId(fallaId)
    setSubView('camera')
  }

  function goToFicha(fallaId: string) {
    setAutoOpenFallaId(fallaId)
    setActiveTab('captura')
  }

  function closeSubView() {
    setSubView(null)
    setCameraFallaId(undefined)
  }

  const navBarTop = 'calc(44px + env(safe-area-inset-top, 0px))'

  const renderContent = () => {
    if (subView === 'camera') {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
          <div style={{
            position: 'absolute',
            top: 'env(safe-area-inset-top, 0px)',
            left: 0,
            right: 0,
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            zIndex: 10,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
          }}>
            <button
              onClick={closeSubView}
              style={{
                background: 'rgba(28,28,30,0.7)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <span style={{
              flex: 1,
              textAlign: 'center',
              fontSize: '16px',
              fontWeight: 600,
              color: '#fff',
              fontFamily: 'Inter, -apple-system, sans-serif',
            }}>
              Camara
            </span>
            <div style={{ width: '32px' }} />
          </div>
          <CameraView fallaId={cameraFallaId} />
        </div>
      )
    }

    if (subView === 'ocr') {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
          <div style={{
            position: 'absolute',
            top: 'env(safe-area-inset-top, 0px)',
            left: 0,
            right: 0,
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            zIndex: 10,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
          }}>
            <button
              onClick={closeSubView}
              style={{
                background: 'rgba(28,28,30,0.7)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <span style={{
              flex: 1,
              textAlign: 'center',
              fontSize: '16px',
              fontWeight: 600,
              color: '#fff',
              fontFamily: 'Inter, -apple-system, sans-serif',
            }}>
              Escanear cartel
            </span>
            <div style={{ width: '32px' }} />
          </div>
          <OCRView fallaId={cameraFallaId} />
        </div>
      )
    }

    return null
  }

  return (
    <div style={{ width: '100%', height: '100%', background: '#1c1c1e', overflow: 'hidden' }}>
      {/* Subviews */}
      {renderContent()}

      {/* Nav bar */}
      {!subView && (
        <NavBar
          title={TAB_TITLES[activeTab]}
          rightButton={undefined}
        />
      )}

      {/* Main content */}
      {!subView && (
        <div
          style={{
            position: 'absolute',
            top: navBarTop,
            bottom: '86px',
            left: 0,
            right: 0,
            overflow: 'hidden',
          }}
        >
          {activeTab === 'mapa' && (
            <MapView
              onOpenCamera={openCamera}
              onGoToFicha={goToFicha}
              activeRoute={activeRoute}
              setActiveRoute={setActiveRoute}
              routeStep={routeStep}
              setRouteStep={setRouteStep}
              onClearRoute={clearRoute}
            />
          )}
          {activeTab === 'captura' && (
            <FallasList
              onOpenCamera={openCamera}
              autoOpenFallaId={autoOpenFallaId}
              onAutoOpenDone={() => setAutoOpenFallaId(undefined)}
            />
          )}
          {activeTab === 'galeria' && <GalleryView />}
          {activeTab === 'sync' && <SyncView />}
        </div>
      )}

      {/* Tab bar */}
      {!subView && <TabBar activeTab={activeTab} onTabChange={setActiveTab} routeActive={!!activeRoute} />}
    </div>
  )
}
