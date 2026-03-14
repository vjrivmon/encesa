import { useState, useEffect } from 'react'
import { db, type Falla } from '../../lib/db'
import { SEED_FALLAS } from '../../lib/jcf-seed'
import FallaCard from './FallaCard'
import FallaSheet from './FallaSheet'

const CATEGORIAS: { value: Falla['categoria'] | 'todas'; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'especial', label: 'Especial' },
  { value: 'primera', label: '1a' },
  { value: 'segunda', label: '2a' },
  { value: 'tercera', label: '3a' },
]

const ORDEN_CATEGORIA: Record<Falla['categoria'], number> = {
  especial: 0,
  primera: 1,
  segunda: 2,
  tercera: 3,
}

interface FallasListProps {
  onOpenCamera?: (fallaId: string) => void
  autoOpenFallaId?: string
  onAutoOpenDone?: () => void
}

export default function FallasList({ onOpenCamera, autoOpenFallaId, onAutoOpenDone }: FallasListProps) {
  const [fallas, setFallas] = useState<Falla[]>([])
  const [search, setSearch] = useState('')
  const [categoriaFilter, setCategoriaFilter] = useState<Falla['categoria'] | 'todas'>('todas')
  const [selectedFalla, setSelectedFalla] = useState<Falla | null>(null)

  useEffect(() => {
    loadFallas()
  }, [])

  useEffect(() => {
    if (autoOpenFallaId && fallas.length > 0) {
      const falla = fallas.find(f => f.id === autoOpenFallaId)
      if (falla) {
        setSelectedFalla(falla)
        onAutoOpenDone?.()
      }
    }
  }, [autoOpenFallaId, fallas])

  async function loadFallas() {
    let dbFallas = await db.fallas.toArray()
    if (dbFallas.length === 0) {
      const now = new Date().toISOString()
      const seedFallas: Falla[] = SEED_FALLAS.map(f => ({
        ...f,
        completitud_pct: 0,
        created_at: now,
        updated_at: now,
        synced: false,
      }))
      await db.fallas.bulkAdd(seedFallas)
      dbFallas = seedFallas
    }
    const seedMap = Object.fromEntries(SEED_FALLAS.map(s => [s.id, s]))
    setFallas(dbFallas.sort((a, b) => {
      const catA = seedMap[a.id]?.categoria ?? a.categoria
      const catB = seedMap[b.id]?.categoria ?? b.categoria
      return (ORDEN_CATEGORIA[catA] ?? 99) - (ORDEN_CATEGORIA[catB] ?? 99)
    }))
  }

  // Usar categoría y barrio del seed (evita usar datos cacheados incorrectos de IndexedDB)
  const SEED_MAP = Object.fromEntries(SEED_FALLAS.map(s => [s.id, s]))

  const filtered = fallas
    .filter(f => {
      if (categoriaFilter === 'todas') return true
      const cat = SEED_MAP[f.id]?.categoria ?? f.categoria
      return cat === categoriaFilter
    })
    .filter(f => {
      if (!search) return true
      const q = search.toLowerCase()
      const seed = SEED_MAP[f.id]
      return (
        f.nombre.toLowerCase().includes(q) ||
        (seed?.artista ?? f.artista).toLowerCase().includes(q) ||
        (seed?.barrio ?? f.barrio ?? '').toLowerCase().includes(q) ||
        (seed?.lema ?? f.lema ?? '').toLowerCase().includes(q)
      )
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Search */}
      <div style={{ padding: '12px 16px 8px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#2c2c2e',
          borderRadius: '10px',
          padding: '8px 12px',
          border: '0.5px solid #3a3a3c',
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="5" stroke="#8e8e93" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="#8e8e93" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar falla, barrio o artista..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: '15px',
              fontFamily: 'Inter, -apple-system, sans-serif',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#8e8e93' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="#8e8e93" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Category filter */}
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {CATEGORIAS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setCategoriaFilter(value)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: categoriaFilter === value ? 'none' : '0.5px solid #3a3a3c',
              background: categoriaFilter === value ? '#FF6B35' : '#2c2c2e',
              color: categoriaFilter === value ? '#fff' : '#8e8e93',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'Inter, -apple-system, sans-serif',
              transition: 'all 0.2s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Count */}
      <div style={{ padding: '0 16px 8px', fontSize: '12px', color: '#636366', fontFamily: 'Inter, -apple-system, sans-serif' }}>
        {filtered.length} falla{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '16px' }}>
        {filtered.map(falla => (
          <FallaCard key={falla.id} falla={falla} onClick={setSelectedFalla} />
        ))}
        {filtered.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: '#8e8e93',
            fontSize: '14px',
            paddingTop: '40px',
            fontFamily: 'Inter, -apple-system, sans-serif',
          }}>
            Sin resultados para "{search}"
          </div>
        )}
      </div>

      {/* Falla detail sheet */}
      <FallaSheet
        falla={selectedFalla}
        isOpen={selectedFalla !== null}
        onClose={() => {
          setSelectedFalla(null)
          loadFallas()
        }}
        onOpenCamera={onOpenCamera}
      />
    </div>
  )
}
