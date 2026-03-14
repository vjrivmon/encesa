import { useMemo, useState } from 'react'
import BottomSheet from '../../components/BottomSheet'
import { db } from '../../lib/db'
import { calcularRuta, type RouteParams, type RouteResult } from '../../lib/routing'
import { SEED_FALLAS } from '../../lib/jcf-seed'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORIAS = ['Especial', '1a', '2a', '3a']

type TimeOption = '1h' | '2h' | '3h' | 'sin-limite'
const TIME_OPTIONS: { label: string; value: TimeOption }[] = [
  { label: '1h', value: '1h' },
  { label: '2h', value: '2h' },
  { label: '3h', value: '3h' },
  { label: 'Sin limite', value: 'sin-limite' },
]

function timeToMaxFallas(t: TimeOption): number {
  if (t === '1h') return 6
  if (t === '2h') return 12
  if (t === '3h') return 18
  return 999
}

// ─── Helpers de estilo ────────────────────────────────────────────────────────

const chipBase: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '20px',
  fontSize: '13px',
  fontWeight: 500,
  fontFamily: 'Inter, -apple-system, sans-serif',
  cursor: 'pointer',
  border: '1px solid #3a3a3c',
  background: '#2c2c2e',
  color: '#8e8e93',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  userSelect: 'none',
}

const chipActive: React.CSSProperties = {
  ...chipBase,
  background: 'rgba(255,107,53,0.15)',
  border: '1px solid #FF6B35',
  color: '#FF6B35',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RouteBuilderProps {
  isOpen: boolean
  onClose: () => void
  userPos: [number, number] | null
  customStart: [number, number] | null
  onPickStart: () => void
  onClearCustomStart: () => void
  onRouteReady: (result: RouteResult) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function RouteBuilder({ isOpen, onClose, userPos, customStart, onPickStart, onClearCustomStart, onRouteReady }: RouteBuilderProps) {
  const [selectedBarrios, setSelectedBarrios] = useState<string[]>([])
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [timeOption, setTimeOption] = useState<TimeOption>('2h')
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [tipo, setTipo] = useState<'grande' | 'infantil' | 'ambas'>('ambas')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Top-15 barrios por número de fallas — siempre del seed (nombres reales)
  const topBarrios = useMemo(() => {
    const counts: Record<string, number> = {}
    SEED_FALLAS.forEach(f => {
      if (f.barrio && f.barrio.length > 2) counts[f.barrio] = (counts[f.barrio] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([barrio]) => barrio)
  }, [])

  function toggleBarrio(b: string) {
    setSelectedBarrios(prev =>
      prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]
    )
  }

  function toggleCat(c: string) {
    setSelectedCats(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  async function handleGenerar() {
    const startPos = customStart ?? userPos
    if (!startPos) {
      setError('Activa el GPS o elige un punto de inicio en el mapa')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const params: RouteParams = {
        userPos: startPos,
        barrios: selectedBarrios,
        categorias: selectedCats,
        maxFallas: timeToMaxFallas(timeOption),
        soloPendientes,
        tipo,
      }
      const fallasDDB = await db.fallas.toArray()
      const result = await calcularRuta(params, fallasDDB)
      if (result.fallas.length === 0) {
        setError('No se encontraron fallas con estos filtros')
        setLoading(false)
        return
      }
      onRouteReady(result)
      onClose()
    } catch (e) {
      setError('Error al calcular la ruta. Intentalo de nuevo.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontFamily: 'Inter, -apple-system, sans-serif',
    marginBottom: '10px',
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Crear ruta">
      <div style={{ padding: '16px 20px 4px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Punto de inicio */}
        <div>
          <div style={sectionTitle}>Punto de inicio</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Opción: Mi ubicación */}
            <div
              onClick={() => { if (userPos) onClearCustomStart() }}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: '10px', cursor: userPos ? 'pointer' : 'default',
                background: !customStart ? (userPos ? 'rgba(255,107,53,0.15)' : 'rgba(255,59,48,0.1)') : '#2c2c2e',
                border: !customStart ? (userPos ? '1px solid #FF6B35' : '0.5px solid rgba(255,59,48,0.4)') : '0.5px solid #3a3a3c',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3.5" stroke={!customStart && userPos ? '#FF6B35' : '#8e8e93'} strokeWidth="2"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={!customStart && userPos ? '#FF6B35' : '#8e8e93'} strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: !customStart && userPos ? '#fff' : '#8e8e93', fontFamily: 'Inter, -apple-system, sans-serif' }}>Mi ubicación</div>
                {!userPos && <div style={{ fontSize: '10px', color: '#ff3b30', fontFamily: 'Inter, -apple-system, sans-serif' }}>GPS no disponible</div>}
              </div>
            </div>
            {/* Opción: Elegir en mapa */}
            <div
              onClick={onPickStart}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                background: customStart ? 'rgba(255,107,53,0.15)' : '#2c2c2e',
                border: customStart ? '1px solid #FF6B35' : '0.5px solid #3a3a3c',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke={customStart ? '#FF6B35' : '#8e8e93'} strokeWidth="2" fill="none"/>
                <circle cx="12" cy="9" r="2" stroke={customStart ? '#FF6B35' : '#8e8e93'} strokeWidth="1.5"/>
              </svg>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: customStart ? '#fff' : '#8e8e93', fontFamily: 'Inter, -apple-system, sans-serif' }}>Elegir en mapa</div>
                {customStart && <div style={{ fontSize: '10px', color: '#FF6B35', fontFamily: 'Inter, -apple-system, sans-serif' }}>Punto seleccionado</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Barrios */}
        <div>
          <div style={sectionTitle}>
            Barrios
            {selectedBarrios.length > 0 && (
              <span
                onClick={() => setSelectedBarrios([])}
                style={{ color: '#FF6B35', cursor: 'pointer', marginLeft: '8px', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400 }}
              >
                Limpiar
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {topBarrios.map(b => (
              <div
                key={b}
                onClick={() => toggleBarrio(b)}
                style={selectedBarrios.includes(b) ? chipActive : chipBase}
              >
                {b}
              </div>
            ))}
          </div>
          {selectedBarrios.length === 0 && (
            <div style={{ fontSize: '11px', color: '#636366', marginTop: '6px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
              Sin seleccion = todos los barrios
            </div>
          )}
        </div>

        {/* Categorias */}
        <div>
          <div style={sectionTitle}>Categoria</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {CATEGORIAS.map(c => (
              <div
                key={c}
                onClick={() => toggleCat(c)}
                style={selectedCats.includes(c) ? chipActive : chipBase}
              >
                {c}
              </div>
            ))}
          </div>
          {selectedCats.length === 0 && (
            <div style={{ fontSize: '11px', color: '#636366', marginTop: '6px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
              Sin seleccion = todas las categorias
            </div>
          )}
        </div>

        {/* Tiempo disponible */}
        <div>
          <div style={sectionTitle}>Tiempo disponible</div>
          <div
            style={{
              display: 'flex',
              background: '#2c2c2e',
              borderRadius: '10px',
              padding: '3px',
              border: '0.5px solid #3a3a3c',
            }}
          >
            {TIME_OPTIONS.map(opt => (
              <div
                key={opt.value}
                onClick={() => setTimeOption(opt.value)}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  textAlign: 'center',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: timeOption === opt.value ? 600 : 400,
                  color: timeOption === opt.value ? '#fff' : '#8e8e93',
                  background: timeOption === opt.value ? '#FF6B35' : 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'Inter, -apple-system, sans-serif',
                  transition: 'background 0.15s',
                  userSelect: 'none',
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: '#636366', marginTop: '6px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {timeOption !== 'sin-limite'
              ? `Aprox. ${timeToMaxFallas(timeOption)} fallas (10 min c/u)`
              : 'Todas las fallas que coincidan'}
          </div>
        </div>

        {/* Tipo */}
        <div>
          <div style={sectionTitle}>Tipo</div>
          <div
            style={{
              display: 'flex',
              background: '#2c2c2e',
              borderRadius: '10px',
              padding: '3px',
              border: '0.5px solid #3a3a3c',
            }}
          >
            {(['ambas', 'grande', 'infantil'] as const).map(t => (
              <div
                key={t}
                onClick={() => setTipo(t)}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  textAlign: 'center',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: tipo === t ? 600 : 400,
                  color: tipo === t ? '#fff' : '#8e8e93',
                  background: tipo === t ? '#FF6B35' : 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'Inter, -apple-system, sans-serif',
                  transition: 'background 0.15s',
                  userSelect: 'none',
                }}
              >
                {t === 'ambas' ? 'Ambas' : t === 'grande' ? 'Grandes' : 'Infantiles'}
              </div>
            ))}
          </div>
        </div>

        {/* Solo pendientes */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', color: '#fff', fontFamily: 'Inter, -apple-system, sans-serif', fontWeight: 500 }}>
              Solo pendientes
            </div>
            <div style={{ fontSize: '12px', color: '#636366', fontFamily: 'Inter, -apple-system, sans-serif' }}>
              Excluir fallas ya completadas
            </div>
          </div>
          {/* Toggle iOS */}
          <div
            onClick={() => setSoloPendientes(v => !v)}
            style={{
              width: '51px',
              height: '31px',
              borderRadius: '16px',
              background: soloPendientes ? '#FF6B35' : '#39393b',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '2px',
                left: soloPendientes ? '22px' : '2px',
                width: '27px',
                height: '27px',
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                transition: 'left 0.2s',
              }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ fontSize: '13px', color: '#ff453a', fontFamily: 'Inter, -apple-system, sans-serif', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Boton generar */}
        <button
          onClick={handleGenerar}
          disabled={loading || !(customStart ?? userPos)}
          style={{
            width: '100%',
            padding: '14px 0',
            background: loading || !(customStart ?? userPos)
              ? '#3a3a3c'
              : 'linear-gradient(135deg, #FF6B35, #ff9500)',
            border: 'none',
            borderRadius: '14px',
            color: loading || !(customStart ?? userPos) ? '#636366' : '#fff',
            fontSize: '15px',
            fontWeight: 700,
            cursor: loading || !(customStart ?? userPos) ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, -apple-system, sans-serif',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: loading || !(customStart ?? userPos) ? 'none' : '0 4px 16px rgba(255,107,53,0.35)',
            transition: 'all 0.2s',
            marginBottom: '8px',
          }}
        >
          {loading ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="#636366" strokeWidth="2" strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
              Calculando ruta...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 12h18M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Generar ruta
            </>
          )}
        </button>

      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </BottomSheet>
  )
}
