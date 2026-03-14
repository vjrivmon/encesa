import { useState, useEffect } from 'react'
import { db, type Falla, type Foto } from '../../lib/db'
import { SEED_FALLAS } from '../../lib/jcf-seed'
import FallaSheet from '../capture/FallaSheet'

interface FallaWithCover extends Falla {
  coverUrl?: string
}

export default function GalleryView() {
  const [fallas, setFallas] = useState<FallaWithCover[]>([])
  const [selectedFalla, setSelectedFalla] = useState<Falla | null>(null)

  useEffect(() => {
    loadFallas()
  }, [])

  async function loadFallas() {
    let dbFallas = await db.fallas.toArray()
    if (dbFallas.length === 0) {
      const now = new Date().toISOString()
      const seed: Falla[] = SEED_FALLAS.map(f => ({
        ...f,
        completitud_pct: 0,
        created_at: now,
        updated_at: now,
        synced: false,
      }))
      await db.fallas.bulkAdd(seed)
      dbFallas = seed
    }

    // Get cover photos
    const allFotos: Foto[] = await db.fotos.toArray()
    const fotosByFalla: Record<string, Foto[]> = {}
    allFotos.forEach(foto => {
      if (!fotosByFalla[foto.falla_id]) fotosByFalla[foto.falla_id] = []
      fotosByFalla[foto.falla_id].push(foto)
    })

    const withCovers: FallaWithCover[] = dbFallas
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(f => ({
        ...f,
        coverUrl: fotosByFalla[f.id]?.[0]?.data_url,
      }))

    setFallas(withCovers)
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        padding: '12px 16px',
        paddingBottom: '16px',
      }}>
        {fallas.map(falla => (
          <button
            key={falla.id}
            onClick={() => setSelectedFalla(falla)}
            style={{
              background: '#2c2c2e',
              border: '0.5px solid #3a3a3c',
              borderRadius: '13px',
              overflow: 'hidden',
              cursor: 'pointer',
              textAlign: 'left',
              padding: 0,
              transition: 'opacity 0.15s',
            }}
          >
            {/* Cover image */}
            <div style={{ position: 'relative', aspectRatio: '4/3', background: '#1c1c1e' }}>
              {falla.coverUrl ? (
                <img
                  src={falla.coverUrl}
                  alt={falla.nombre}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#2c2c2e',
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="3" stroke="#3a3a3c" strokeWidth="1.5" />
                    <circle cx="8.5" cy="8.5" r="1.5" fill="#3a3a3c" />
                    <path d="M21 15l-5-5L5 21" stroke="#3a3a3c" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {/* Completitud badge */}
              <div style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: falla.completitud_pct === 100
                  ? 'rgba(52,199,89,0.9)'
                  : falla.completitud_pct > 0
                    ? 'rgba(255,107,53,0.9)'
                    : 'rgba(28,28,30,0.9)',
                borderRadius: '6px',
                padding: '3px 7px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#fff',
                fontFamily: 'Inter, -apple-system, sans-serif',
              }}>
                {falla.completitud_pct}%
              </div>
            </div>

            {/* Info */}
            <div style={{ padding: '10px 12px' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#fff',
                marginBottom: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'Inter, -apple-system, sans-serif',
              }}>
                {falla.nombre}
              </div>
              <div style={{
                fontSize: '11px',
                color: '#8e8e93',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'Inter, -apple-system, sans-serif',
              }}>
                {falla.artista}
              </div>

              {/* Progress bar */}
              <div style={{ marginTop: '8px', height: '2px', background: '#3a3a3c', borderRadius: '1px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${falla.completitud_pct}%`,
                  background: falla.completitud_pct === 100 ? '#34c759' : 'linear-gradient(90deg, #FF6B35, #ff9500)',
                  transition: 'width 0.5s',
                }} />
              </div>
            </div>
          </button>
        ))}
      </div>

      <FallaSheet
        falla={selectedFalla}
        isOpen={selectedFalla !== null}
        onClose={() => {
          setSelectedFalla(null)
          loadFallas()
        }}
      />
    </div>
  )
}
