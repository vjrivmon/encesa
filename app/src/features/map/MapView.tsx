import { useEffect, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { db, type Falla } from '../../lib/db'
import { SEED_FALLAS } from '../../lib/jcf-seed'
import FallaMarker from './FallaMarker'
import BottomSheet from '../../components/BottomSheet'
import Badge from '../../components/Badge'
import ProgressRing from '../../components/ProgressRing'

const VALENCIA_CENTER: [number, number] = [39.4699, -0.3763]

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

export default function MapView() {
  const [fallas, setFallas] = useState<Falla[]>([])
  const [selectedFalla, setSelectedFalla] = useState<Falla | null>(null)

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
          top: 'calc(44px + env(safe-area-inset-top, 0px))',
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
      </MapContainer>

      {/* Falla detail sheet */}
      <BottomSheet
        isOpen={selectedFalla !== null}
        onClose={() => setSelectedFalla(null)}
        title={selectedFalla?.nombre ?? ''}
      >
        {selectedFalla && (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
              <ProgressRing percentage={selectedFalla.completitud_pct} size={64} />
              <div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>
                  {selectedFalla.artista}
                </div>
                <div style={{ fontSize: '13px', color: '#8e8e93', marginBottom: '6px' }}>
                  {selectedFalla.barrio}
                </div>
                <Badge categoria={selectedFalla.categoria} size="md" />
              </div>
            </div>
            {selectedFalla.lema && (
              <div style={{
                background: '#2c2c2e',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '13px',
                color: '#8e8e93',
                fontStyle: 'italic',
              }}>
                "{selectedFalla.lema}"
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
