import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Circle, Polyline, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { db, type Falla } from '../../lib/db'
import { SEED_FALLAS } from '../../lib/jcf-seed'
import BottomSheet from '../../components/BottomSheet'
import Badge from '../../components/Badge'
import ProgressRing from '../../components/ProgressRing'
import RouteBuilder from './RouteBuilder'
import type { RouteResult } from '../../lib/routing'

const VALENCIA_CENTER: [number, number] = [39.4699, -0.3763]

// ─── Icono con número para fallas de la ruta ──────────────────────────────────
function createNumberedIcon(num: number, active: boolean): L.DivIcon {
  const bg = active ? '#FF6B35' : '#2c2c2e'
  const border = active ? '#fff' : '#FF6B35'
  const color = '#fff'
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: ${bg};
      border: 2.5px solid ${border};
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: ${color};
      line-height: 1;
    ">${num}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function createColoredIcon(color: string, opacity = 1, imprescindible = false): L.DivIcon {
  const border = imprescindible
    ? '3px solid #FF6B35'
    : '2px solid rgba(255,255,255,0.8)'
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background-color: ${color};
      border: ${border};
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      opacity: ${opacity};
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

const ESTADO_COLOR: Record<Falla['estado'], string> = {
  pendiente: '#8e8e93',
  en_progreso: '#FF6B35',
  completa: '#34c759',
}

// ─── Geolocalización + botón centrar ─────────────────────────────────────────
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

      <div
        onClick={centerOnMe}
        style={{
          position: 'absolute',
          bottom: '12px',
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
          <circle cx="12" cy="12" r="3.5" stroke={position ? '#0a84ff' : '#8e8e93'} strokeWidth="2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={position ? '#0a84ff' : '#8e8e93'} strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="9" stroke={position ? '#0a84ff' : '#8e8e93'} strokeWidth="1.5" strokeDasharray="3 2" />
        </svg>
      </div>
    </>
  )
}

// ─── Fly suave al target ───────────────────────────────────────────────────────
function MapFlyer({ target }: { target: [number, number] | null }) {
  const map = useMap()
  const prevTarget = useRef<[number, number] | null>(null)
  if (target && target !== prevTarget.current) {
    prevTarget.current = target
    map.flyTo(target, 18, { animate: true, duration: 0.8 })
  }
  return null
}

// ─── Fly al paso activo de la ruta ────────────────────────────────────────────
function MapStartPicker({ active, onPick }: { active: boolean; onPick: (pos: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      if (active) onPick([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

function MapRouteStep({ falla }: { falla: Falla | null }) {
  const map = useMap()
  const prevId = useRef<string | null>(null)
  if (falla && falla.id !== prevId.current) {
    prevId.current = falla.id
    map.flyTo([falla.lat, falla.lng], 17, { animate: true, duration: 0.6 })
  }
  return null
}

// ─── Seed data helper ─────────────────────────────────────────────────────────
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
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface MapViewProps {
  onOpenCamera?: (fallaId: string) => void
  onGoToFicha?: (fallaId: string) => void
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MapView({ onOpenCamera, onGoToFicha }: MapViewProps) {
  const [fallas, setFallas] = useState<Falla[]>([])
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [showNearby, setShowNearby] = useState(false)
  const [selectedFalla, setSelectedFalla] = useState<Falla | null>(null)

  // ─── Estado de ruta ─────────────────────────────────────────────────────────
  const [showRouteBuilder, setShowRouteBuilder] = useState(false)
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null)
  const [routeStep, setRouteStep] = useState(0)
  const [customStart, setCustomStart] = useState<[number, number] | null>(null)
  const [pickingStart, setPickingStart] = useState(false)

  const handleUserLocation = useCallback((pos: [number, number]) => {
    setUserPos(pos)
  }, [])

  // Conjunto de IDs en ruta para lookup rápido
  const routeFallaIds = activeRoute
    ? new Set(activeRoute.fallas.map(f => f.id))
    : new Set<string>()

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

  // Falla activa en navegación
  const activeStepFalla = activeRoute?.fallas[routeStep] ?? null

  // Distancia al siguiente punto (desde posicion actual o paso previo)
  const distNextM = activeRoute && activeRoute.fallas.length > 0
    ? (() => {
        const prev = routeStep === 0
          ? (userPos ?? [activeRoute.fallas[0].lat, activeRoute.fallas[0].lng] as [number, number])
          : [activeRoute.fallas[routeStep - 1].lat, activeRoute.fallas[routeStep - 1].lng] as [number, number]
        const cur = activeRoute.fallas[routeStep]
        return Math.round(distanciaMetros(prev[0], prev[1], cur.lat, cur.lng))
      })()
    : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Progress bar overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1001,
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
        style={{ position: 'absolute', top: '49px', left: 0, right: 0, bottom: 0 }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Marcadores de fallas */}
        {fallas.map(falla => {
          if (activeRoute) {
            const routeIdx = activeRoute.fallas.findIndex(rf => rf.id === falla.id)
            if (routeIdx >= 0) {
              const isActive = routeIdx === routeStep
              const icon = createNumberedIcon(routeIdx + 1, isActive)
              return (
                <Marker
                  key={falla.id}
                  position={[falla.lat, falla.lng]}
                  icon={icon}
                  eventHandlers={{ click: () => setSelectedFalla(falla) }}
                />
              )
            } else {
              const color = ESTADO_COLOR[falla.estado]
              const icon = createColoredIcon(color, 0.3)
              return (
                <Marker
                  key={falla.id}
                  position={[falla.lat, falla.lng]}
                  icon={icon}
                  eventHandlers={{ click: () => setSelectedFalla(falla) }}
                />
              )
            }
          }
          const color = ESTADO_COLOR[falla.estado]
          const icon = createColoredIcon(color)
          return (
            <Marker
              key={falla.id}
              position={[falla.lat, falla.lng]}
              icon={icon}
              eventHandlers={{ click: () => setSelectedFalla(falla) }}
            />
          )
        })}

        {/* Polyline de la ruta */}
        {activeRoute && activeRoute.waypoints.length > 1 && (
          <Polyline
            positions={activeRoute.waypoints}
            pathOptions={{ color: '#FF6B35', weight: 4, opacity: 0.85 }}
          />
        )}

        <UserLocationControl onLocation={handleUserLocation} />
        <MapFlyer target={flyTarget} />
        <MapRouteStep falla={activeStepFalla} />
        <MapStartPicker active={pickingStart} onPick={(pos) => { setCustomStart(pos); setPickingStart(false); setShowRouteBuilder(true) }} />
      </MapContainer>

      {/* Botón "+" — abrir RouteBuilder */}
      <div
        onClick={() => setShowRouteBuilder(true)}
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          zIndex: 500,
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: activeRoute
            ? 'rgba(255,107,53,0.2)'
            : 'rgba(28,28,30,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: activeRoute ? '1px solid #FF6B35' : '0.5px solid #3a3a3c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke={activeRoute ? '#FF6B35' : '#fff'}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Panel fallas cercanas — solo si no hay ruta activa */}
      {!activeRoute && fallasCercanas.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '68px',
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
                <path d="M6 9l6 6 6-6" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {showNearby && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {fallasCercanas.map(({ falla, dist }) => (
                  <div
                    key={falla.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setFlyTarget([falla.lat, falla.lng])
                      setShowNearby(false)
                    }}
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

      {/* Chip de navegación de ruta — arriba del mapa */}
      {activeRoute && activeRoute.fallas.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            right: '8px',
            zIndex: 500,
          }}
        >
          <div
            style={{
              background: 'rgba(28,28,30,0.96)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid #FF6B35',
              borderRadius: '16px',
              padding: '12px 14px 10px',
              boxShadow: '0 4px 20px rgba(255,107,53,0.2)',
              position: 'relative',
            }}
          >
            {/* Botón X para limpiar ruta */}
            <div
              onClick={() => { setActiveRoute(null); setRouteStep(0) }}
              style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: '#3a3a3c',
                border: '1.5px solid #FF6B35',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 1,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>

            {/* Fila principal: prev / info / next */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Botón anterior */}
              <div
                onClick={() => setRouteStep(s => Math.max(0, s - 1))}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: routeStep === 0 ? '#2c2c2e' : 'rgba(255,107,53,0.15)',
                  border: routeStep === 0 ? '0.5px solid #3a3a3c' : '1px solid #FF6B35',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: routeStep === 0 ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke={routeStep === 0 ? '#636366' : '#FF6B35'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* Info de la parada */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', fontFamily: 'Inter, -apple-system, sans-serif', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  Parada {routeStep + 1} / {activeRoute.fallas.length}
                  {activeStepFalla && (
                    <span style={{ color: '#FF6B35', fontWeight: 400 }}>
                      {' · '}{activeStepFalla.nombre}
                    </span>
                  )}
                </div>
                {activeStepFalla && (
                  <div style={{ fontSize: '11px', color: '#8e8e93', fontFamily: 'Inter, -apple-system, sans-serif', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: '2px' }}>
                    {distNextM !== null && `${distNextM}m · `}{activeStepFalla.artista}
                  </div>
                )}
              </div>

              {/* Botón siguiente */}
              <div
                onClick={() => setRouteStep(s => Math.min(activeRoute.fallas.length - 1, s + 1))}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: routeStep === activeRoute.fallas.length - 1 ? '#2c2c2e' : 'rgba(255,107,53,0.15)',
                  border: routeStep === activeRoute.fallas.length - 1 ? '0.5px solid #3a3a3c' : '1px solid #FF6B35',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: routeStep === activeRoute.fallas.length - 1 ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l6-6-6-6" stroke={routeStep === activeRoute.fallas.length - 1 ? '#636366' : '#FF6B35'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* Barra de progreso de ruta */}
            <div style={{ marginTop: '8px', height: '2px', background: '#3a3a3c', borderRadius: '1px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${((routeStep + 1) / activeRoute.fallas.length) * 100}%`,
                  background: 'linear-gradient(90deg, #FF6B35, #ff9500)',
                  borderRadius: '1px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            {/* Distancia total y tiempo estimado */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '10px', color: '#636366', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                {activeRoute.distanciaMetros >= 1000
                  ? `${(activeRoute.distanciaMetros / 1000).toFixed(1)} km`
                  : `${activeRoute.distanciaMetros} m`} en total
              </span>
              <span style={{ fontSize: '10px', color: '#636366', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                ~{activeRoute.duracionMinutos} min · {activeRoute.fallas.length} fallas
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Marcador de inicio personalizado */}
      {customStart && (
        <div style={{ position: 'absolute', zIndex: 510, pointerEvents: 'none',
          top: '50%', left: '50%' }} />
      )}

      {/* Overlay modo selección de punto de inicio */}
      {pickingStart && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 600, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '16px' }}>
          <div style={{ background: 'rgba(28,28,30,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid #FF6B35', borderRadius: '14px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#FF6B35"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff', fontFamily: 'Inter, -apple-system, sans-serif' }}>Toca el mapa para elegir el inicio</span>
          </div>
          <div style={{ marginTop: '8px', pointerEvents: 'auto' }}>
            <div onClick={() => setPickingStart(false)} style={{ background: 'rgba(28,28,30,0.9)', border: '0.5px solid #3a3a3c', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer' }}>
              <span style={{ fontSize: '13px', color: '#8e8e93', fontFamily: 'Inter, -apple-system, sans-serif' }}>Cancelar</span>
            </div>
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
            {/* En ruta: indicar número de parada */}
            {routeFallaIds.has(selectedFalla.id) && activeRoute && (
              <div style={{ fontSize: '12px', color: '#FF6B35', fontWeight: 600, marginBottom: '10px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                Parada #{activeRoute.fallas.findIndex(f => f.id === selectedFalla.id) + 1} de la ruta
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', paddingBottom: '4px' }}>
              <button
                onClick={() => { setSelectedFalla(null); onOpenCamera?.(selectedFalla.id) }}
                style={{ flex: 1, padding: '11px 0', background: 'linear-gradient(135deg, #FF6B35, #ff9500)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 4px 16px rgba(255,107,53,0.3)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="13" r="4" stroke="#fff" strokeWidth="2" />
                </svg>
                Escanear
              </button>
              <button
                onClick={() => { setSelectedFalla(null); onGoToFicha?.(selectedFalla.id) }}
                style={{ flex: 1, padding: '11px 0', background: '#2c2c2e', border: '0.5px solid #3a3a3c', borderRadius: '12px', color: '#8e8e93', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 12h6M9 16h4M7 4H4a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2h-3" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" />
                  <path d="M9 4h6a1 1 0 010 2H9a1 1 0 010-2z" stroke="#8e8e93" strokeWidth="2" />
                </svg>
                Ver ficha
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* RouteBuilder sheet */}
      <RouteBuilder
        isOpen={showRouteBuilder}
        onClose={() => setShowRouteBuilder(false)}
        userPos={userPos}
        customStart={customStart}
        onPickStart={() => { setShowRouteBuilder(false); setPickingStart(true) }}
        onClearCustomStart={() => setCustomStart(null)}
        onRouteReady={(result) => {
          setActiveRoute(result)
          setRouteStep(0)
        }}
      />
    </div>
  )
}
