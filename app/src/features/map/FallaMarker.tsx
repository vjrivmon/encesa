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
    popupAnchor: [0, -12],
  })
}

const ESTADO_COLOR: Record<Falla['estado'], string> = {
  pendiente: '#8e8e93',
  en_progreso: '#FF6B35',
  completa: '#34c759',
}

interface FallaMarkerProps {
  falla: Falla
  onClick?: (falla: Falla) => void
}

export default function FallaMarker({ falla, onClick }: FallaMarkerProps) {
  const color = ESTADO_COLOR[falla.estado]
  const icon = createColoredIcon(color)

  return (
    <Marker
      position={[falla.lat, falla.lng]}
      icon={icon}
      eventHandlers={{
        click: () => onClick?.(falla),
      }}
    >
      <Popup>
        <div style={{ fontFamily: 'Inter, -apple-system, sans-serif', minWidth: '160px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: '#fff' }}>
            {falla.nombre}
          </div>
          <div style={{ fontSize: '12px', color: '#8e8e93' }}>{falla.artista}</div>
          <div style={{ fontSize: '11px', color: '#8e8e93', marginTop: '2px' }}>{falla.barrio}</div>
          <div
            style={{
              marginTop: '6px',
              fontSize: '11px',
              color: color,
              fontWeight: 600,
            }}
          >
            {falla.completitud_pct}% completitud
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
