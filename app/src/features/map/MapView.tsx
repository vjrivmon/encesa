import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Circle, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { db, type Falla } from '../../lib/db'
import { SEED_FALLAS } from '../../lib/jcf-seed'
import FallaMarker from './FallaMarker'
import BottomSheet from '../../components/BottomSheet'
import Badge from '../../components/Badge'
import ProgressRing from '../../components/ProgressRing'

const VALENCIA_CENTER: [number, number] = [39.4699, -0.3763]

// ─── Componente interno: geolocalización + botón centrar ───────────────────
function UserLocationControl({ onLocation }: { onLocation: (pos: [number, number]) => void }) {
  const map = useMap()
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [accuracy, setAccuracy] = useState<number>(0)
  const watchRef = useRef<number | null>(null)
  const centeredOnce = useRef(false)

  useEffect(() => {
    if (!navigator.geolocation) return

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setPosition(coords)
        setAccuracy(pos.coords.accuracy)
        onLocation(coords)
        if (!centeredOnce.current) {
          centeredOnce.current = true
          map.flyTo(coords, 16, { animate: true, duration: 1 })
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )

    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    }
  }, [onLocation])

  const centerOnMe = () => {
    if (position) map.flyTo(position, 16, { animate: true, duration: 1 })
  }

  return (
    <>
      {/* Marcador de posicion del usuario */}
      {position && (
        <>
          <Circle
            center={position}
            radius={accuracy}
            pathOptions={{ color: '#0a84ff', fillColor: '#0a84ff', fillOpacity: 0.08, weight: 1 }}
          />
          <CircleMarker
            center={position}
            radius={10}
            pathOptions={{ color: '#fff', fillColor: '#0a84ff', fillOpacity: 1, weight: 3 }}
          />
        </>
      )}

      {/* Boton centrar en mi ubicacion */}
      <div
        onClick={centerOnMe}
        style={{
          position: 'absolute',
          bottom: '100px',
          right: '12px',
          zIndex: 500,
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: 'rgba(28,28,30,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '0.5px solid #3a3a3c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3.5" stroke={position ? '#0a84ff' : '#8e8e93'} strokeWidth="2"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={position ? '#0a84ff' : '#8e8e93'} strokeWidth="2" strokeLinecap="round"/>
          <circle cx="12" cy="12" r="9" stroke={position ? '#0a84ff' : '#8e8e93'} strokeWidth="1.5" strokeDasharray="3 2"/>
        </svg>
      </div>
    </>
  )
}

async function ensureSeedData(fallas: Falla[]): Promise<Falla[]> {
  if (fallas.length === 0) {
    const now = new Date().toISOString()
    const seedFallas: Falla[] = SEED_FALLAS.map(f => ({
      ...f,
      completitud_pct: 0,
      created_at: now,
      updated_at: now,
      synced: false,
    }))
    await db.fallas.bulkAdd(seedFallas)
    return seedFallas
  }
  return fallas
}

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface MapViewProps {
  onOpenCamera?: (fallaId: string) => void
  onGoToFicha?: (fallaId: string) => void
}

function MapFlyer({ target }: { target: [number, number] | null }) {
  const map = useMap()
  if (target) map.flyTo(target, 18, { animate: true, duration: 0.8 })
  return null
}

export default function MapView({ onOpenCamera, onGoToFicha }: MapViewProps) {
  const [fallas, setFallas] = useState<Falla[]>([])
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [showNearby, setShowNearby] = useState(false)
  const [selectedFalla, setSelectedFalla] = useState<Falla | null>(null)

  const fallasCercanas = userPos
    ? fallas
        .filter(f => f.estado !== 'completa')
        .map(f => ({ falla: f, dist: distanciaMetros(userPos[0], userPos[1], f.lat, f.lng) }))
        .filter(({ dist }) => dist < 300)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5)
    : []

  useEffect(() => {
    db.fallas.toArray().then(async dbFallas => {
      const result = await ensureSeedData(dbFallas)
      setFallas(result)
    })
  }, [])

  const completas = fallas.filter(f => f.estado === 'completa').length
  const enProgreso = fallas.filter(f => f.estado === 'en_progreso').length
  const globalPct = fallas.length > 0
    ? Math.round(fallas.reduce((sum, f) => sum + f.completitud_pct, 0) / fallas.length)
    : 0

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Progress bar overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: '10px 16px',
          background: 'rgba(28,28,30,0.9)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '0.5px solid #3a3a3c',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '13px', color: '#8e8e93', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {completas} completas · {enProgreso} en progreso · {fallas.length - completas - enProgreso} pendientes
          </span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#FF6B35', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {globalPct}%
          </span>
        </div>
        <div style={{ height: '3px', background: '#3a3a3c', borderRadius: '2px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${globalPct}%`,
              background: 'linear-gradient(90deg, #FF6B35, #ff9500)',
              borderRadius: '2px',
              transition: 'width 0.5s ease',
            }}
          />
        </div>
      </div>

      <MapContainer
        center={VALENCIA_CENTER}
        zoom={14}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {fallas.map(falla => (
          <FallaMarker
            key={falla.id}
            falla={falla}
            onClick={setSelectedFalla}
          />
        ))}
        <UserLocationControl onLocation={setUserPos} />
        <MapFlyer target={flyTarget} />
      </MapContainer>

      {/* Panel fallas cercanas */}
      {fallasCercanas.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100px',
            left: '12px',
            right: '68px',
            zIndex: 500,
          }}
        >
          <div
            onClick={() => setShowNearby(v => !v)}
            style={{
              background: 'rgba(28,28,30,0.94)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '0.5px solid #3a3a3c',
              borderRadius: '12px',
              padding: '10px 14px',
              cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0a84ff', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                {fallasCercanas.length} falla{fallasCercanas.length > 1 ? 's' : ''} a menos de 300m
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: showNearby ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <path d="M6 9l6 6 6-6" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {showNearby && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {fallasCercanas.map(({ falla, dist }) => (
                  <div
                    key={falla.id}
                    onClick={(e) => { e.stopPropagation(); setFlyTarget([falla.lat, falla.lng]); setShowNearby(false) }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 0',
                      borderTop: '0.5px solid #3a3a3c',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: '#fff', fontFamily: 'Inter, -apple-system, sans-serif', flex: 1, marginRight: '8px' }}>
                      {falla.nombre}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8e8e93', whiteSpace: 'nowrap' }}>
                      {Math.round(dist)}m
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overlay bloqueador del mapa cuando sheet abierto */}
      {selectedFalla && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 499 }}
          onClick={() => setSelectedFalla(null)}
        />
      )}

      {/* BottomSheet de falla */}
      <BottomSheet
        isOpen={selectedFalla !== null}
        onClose={() => setSelectedFalla(null)}
        title={selectedFalla?.nombre ?? ''}
      >
        {selectedFalla && (
          <div style={{ padding: '12px 20px 8px' }}>
            {/* Info compacta */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <ProgressRing percentage={selectedFalla.completitud_pct} size={48} strokeWidth={4} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '2px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {selectedFalla.artista}
                </div>
                <div style={{ fontSize: '12px', color: '#8e8e93', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{selectedFalla.barrio}</span>
                  <span>·</span>
                  <Badge categoria={selectedFalla.categoria} size="sm" />
                </div>
              </div>
              {selectedFalla.completitud_pct > 0 && (
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#FF6B35', flexShrink: 0 }}>
                  {selectedFalla.completitud_pct}%
                </div>
              )}
            </div>
            {selectedFalla.lema && (
              <div style={{ fontSize: '12px', color: '#636366', fontStyle: 'italic', marginBottom: '12px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                "{selectedFalla.lema}"
              </div>
            )}
            {/* Botones */}
            <div style={{ display: 'flex', gap: '10px', paddingBottom: '4px' }}>
              <button
                onClick={() => { setSelectedFalla(null); onOpenCamera?.(selectedFalla.id) }}
                style={{ flex: 1, padding: '11px 0', background: 'linear-gradient(135deg, #FF6B35, #ff9500)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 4px 16px rgba(255,107,53,0.3)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="13" r="4" stroke="#fff" strokeWidth="2"/></svg>
                Escanear
              </button>
              <button
                onClick={() => { setSelectedFalla(null); onGoToFicha?.(selectedFalla.id) }}
                style={{ flex: 1, padding: '11px 0', background: '#2c2c2e', border: '0.5px solid #3a3a3c', borderRadius: '12px', color: '#8e8e93', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12h6M9 16h4M7 4H4a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2h-3" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round"/><path d="M9 4h6a1 1 0 010 2H9a1 1 0 010-2z" stroke="#8e8e93" strokeWidth="2"/></svg>
                Ver ficha
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
