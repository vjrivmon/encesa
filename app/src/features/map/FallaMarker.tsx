import { useRef } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { Falla } from '../../lib/db'

function createColoredIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background-color: ${color};
      border: 2px solid rgba(255,255,255,0.8);
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -14],
  })
}

const ESTADO_COLOR: Record<Falla['estado'], string> = {
  pendiente: '#8e8e93',
  en_progreso: '#FF6B35',
  completa: '#34c759',
}

const CAT_LABEL: Record<Falla['categoria'], string> = {
  especial: 'Especial',
  primera: '1a',
  segunda: '2a',
  tercera: '3a',
}

const CAT_COLOR: Record<Falla['categoria'], string> = {
  especial: '#FF6B35',
  primera: '#34c759',
  segunda: '#0a84ff',
  tercera: '#8e8e93',
}

interface FallaMarkerProps {
  falla: Falla
  onOpenCamera?: (fallaId: string) => void
  onGoToFicha?: (fallaId: string) => void
}

export default function FallaMarker({ falla, onOpenCamera, onGoToFicha }: FallaMarkerProps) {
  const color = ESTADO_COLOR[falla.estado]
  const icon = createColoredIcon(color)
  const markerRef = useRef<L.Marker>(null)

  function closePopup() {
    markerRef.current?.closePopup()
  }

  return (
    <Marker
      ref={markerRef}
      position={[falla.lat, falla.lng]}
      icon={icon}
    >
      <Popup closeButton={false} minWidth={240} maxWidth={280}>
        <div style={{ fontFamily: 'Inter, -apple-system, sans-serif', padding: '14px 16px 12px' }}>

          {/* Nombre + cerrar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', lineHeight: 1.3, flex: 1 }}>
              {falla.nombre}
            </div>
            <button
              onClick={closePopup}
              style={{ background: '#3a3a3c', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1l8 8M9 1L1 9" stroke="#8e8e93" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Artista + meta */}
          <div style={{ fontSize: '12px', color: '#8e8e93', marginBottom: '6px' }}>
            {falla.artista}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', color: '#636366' }}>{falla.barrio}</span>
            <span style={{ fontSize: '10px', color: '#636366' }}>·</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: CAT_COLOR[falla.categoria] }}>
              {CAT_LABEL[falla.categoria]}
            </span>
            {falla.completitud_pct > 0 && (
              <>
                <span style={{ fontSize: '10px', color: '#636366' }}>·</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#FF6B35' }}>
                  {falla.completitud_pct}%
                </span>
              </>
            )}
          </div>

          {/* Lema */}
          {falla.lema && (
            <div style={{ fontSize: '11px', color: '#636366', fontStyle: 'italic', marginBottom: '12px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              "{falla.lema}"
            </div>
          )}

          {/* Botones */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => { closePopup(); onOpenCamera?.(falla.id) }}
              style={{
                flex: 1, padding: '9px 0',
                background: 'linear-gradient(135deg, #FF6B35, #ff9500)',
                border: 'none', borderRadius: '10px',
                color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'Inter, -apple-system, sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="13" r="4" stroke="#fff" strokeWidth="2"/>
              </svg>
              Escanear
            </button>
            <button
              onClick={() => { closePopup(); onGoToFicha?.(falla.id) }}
              style={{
                flex: 1, padding: '9px 0',
                background: '#3a3a3c', border: 'none', borderRadius: '10px',
                color: '#8e8e93', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'Inter, -apple-system, sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 12h6M9 16h4M7 4H4a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2h-3" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round"/>
                <path d="M9 4h6a1 1 0 010 2H9a1 1 0 010-2z" stroke="#8e8e93" strokeWidth="2"/>
              </svg>
              Ficha
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
