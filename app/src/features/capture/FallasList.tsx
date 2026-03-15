import { useState, useEffect } from 'react'
import { db, type Falla } from '../../lib/db'
import { SEED_FALLAS } from '../../lib/jcf-seed'
import FallaCard from './FallaCard'
import FallaSheet from './FallaSheet'

type EstadoFilter = 'todas' | 'pendientes' | 'favoritas'

const ESTADOS: { value: EstadoFilter; label: string; icon: string }[] = [
  { value: 'todas', label: 'Todas', icon: '' },
  { value: 'pendientes', label: 'Pendientes', icon: '○' },
  { value: 'favoritas', label: 'Favoritas', icon: '★' },
]

const CATEGORIAS: { value: Falla['categoria'] | 'todas'; label: string }[] = [
  { value: 'todas', label: 'Cualquier categoría' },
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
  const [fotoCount, setFotoCount] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('pendientes')
  const [categoriaFilter, setCategoriaFilter] = useState<Falla['categoria'] | 'todas'>('todas')
  const [selectedFalla, setSelectedFalla] = useState<Falla | null>(null)
  const [visibleCount, setVisibleCount] = useState(50)

  useEffect(() => {
    loadFallas()
    loadFotoCount()
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

  async function loadFotoCount() {
    const fotos = await db.fotos.toArray()
    const counts: Record<string, number> = {}
    for (const foto of fotos) {
      counts[foto.falla_id] = (counts[foto.falla_id] ?? 0) + 1
    }
    setFotoCount(counts)
  }

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

  // Reset visible count when filters change
  const resetVisible = () => setVisibleCount(50)

  const filtered = fallas
    .filter(f => {
      if (estadoFilter === 'pendientes') return (fotoCount[f.id] ?? 0) === 0
      if (estadoFilter === 'favoritas') return f.imprescindible === true
      return true
    })
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
            onChange={e => { setSearch(e.target.value); resetVisible() }}
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

      {/* Fila 1: filtros de estado */}
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {ESTADOS.map(({ value, label, icon }) => {
          const active = estadoFilter === value
          return (
            <button
              key={value}
              onClick={() => { setEstadoFilter(value); resetVisible() }}
              style={{
                padding: '7px 14px',
                borderRadius: '20px',
                border: active ? 'none' : '0.5px solid #3a3a3c',
                background: active ? '#FF6B35' : '#2c2c2e',
                color: active ? '#fff' : '#8e8e93',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'Inter, -apple-system, sans-serif',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: icon ? '5px' : '0',
              }}
            >
              {icon && <span style={{ fontSize: '11px' }}>{icon}</span>}
              {label}
            </button>
          )
        })}
      </div>

      {/* Fila 2: filtros de categoría */}
      <div style={{ padding: '0 16px 10px', display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {CATEGORIAS.map(({ value, label }) => {
          const active = categoriaFilter === value
          return (
            <button
              key={value}
              onClick={() => { setCategoriaFilter(value); resetVisible() }}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: active ? '1.5px solid #8e8e93' : '0.5px solid #3a3a3c',
                background: active ? '#3a3a3c' : 'transparent',
                color: active ? '#fff' : '#636366',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'Inter, -apple-system, sans-serif',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Count */}
      <div style={{ padding: '0 16px 8px', fontSize: '12px', color: '#636366', fontFamily: 'Inter, -apple-system, sans-serif' }}>
        {filtered.length} falla{filtered.length !== 1 ? 's' : ''}
        {estadoFilter === 'pendientes' && <span style={{ color: '#ff9500', marginLeft: 6 }}>sin capturar</span>}
        {estadoFilter === 'favoritas' && <span style={{ color: '#FF6B35', marginLeft: 6 }}>marcadas con ★</span>}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '16px' }}>
        {filtered.slice(0, visibleCount).map(falla => (
          <FallaCard key={falla.id} falla={falla} onClick={setSelectedFalla} />
        ))}
        {filtered.length > visibleCount && (
          <button
            onClick={() => setVisibleCount(n => n + 50)}
            style={{
              width: '100%', padding: '14px', background: '#2c2c2e',
              border: '0.5px solid #3a3a3c', borderRadius: '13px',
              color: '#0a84ff', fontSize: '14px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'Inter, -apple-system, sans-serif',
            }}
          >
            Cargar más ({filtered.length - visibleCount} restantes)
          </button>
        )}
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
          loadFotoCount()
        }}
        onOpenCamera={onOpenCamera}
      />
    </div>
  )
}
