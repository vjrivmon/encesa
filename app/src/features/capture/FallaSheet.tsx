import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { db, type Falla, type Valoracion, type Foto } from '../../lib/db'
import BottomSheet from '../../components/BottomSheet'
import Badge from '../../components/Badge'
import ProgressRing from '../../components/ProgressRing'
import StarRating from '../../components/StarRating'
import { calcularCompletitud, getEstadoFromCompletitud } from '../../lib/completitud'
import { SEED_FALLAS } from '../../lib/jcf-seed'
import VideoImporter from '../camera/VideoImporter'
import UrlImporter from '../camera/UrlImporter'

interface FallaSheetProps {
  falla: Falla | null
  isOpen: boolean
  onClose: () => void
  onOpenCamera?: (fallaId: string) => void
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
      <div style={{
        width: '20px', height: '20px',
        borderRadius: '50%',
        background: done ? '#34c759' : '#3a3a3c',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.2s',
      }}>
        {done && (
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4l3 3 6-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: '14px', color: done ? '#fff' : '#8e8e93', fontFamily: 'Inter, -apple-system, sans-serif' }}>
        {label}
      </span>
    </div>
  )
}

export default function FallaSheet({ falla, isOpen, onClose, onOpenCamera }: FallaSheetProps) {
  const [fotos, setFotos] = useState<Foto[]>([])
  const [valoracion, setValoracion] = useState<Valoracion | null>(null)
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [imprescindible, setImprescindible] = useState(false)
  const [showImporter, setShowImporter] = useState(false)
  const [showUrlImporter, setShowUrlImporter] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const reloadFotos = useCallback(async () => {
    if (!falla) return
    const fotasDB = await db.fotos.where('falla_id').equals(falla.id).toArray()
    setFotos(fotasDB)
  }, [falla])

  useEffect(() => {
    if (!falla) return
    setNotas(falla.notas ?? '')
    setImprescindible(falla.imprescindible ?? false)

    Promise.all([
      db.fotos.where('falla_id').equals(falla.id).toArray(),
      db.valoraciones.where('falla_id').equals(falla.id).first(),
    ]).then(([fotasDB, valDB]) => {
      setFotos(fotasDB)
      setValoracion(valDB ?? null)
    })

    // Los datos del cartel vienen siempre de la API — no marcar ocr_realizado automáticamente
    // (hacerlo aquí cambiaría el estado solo con abrir la ficha)
  }, [falla])

  if (!falla) return null

  async function toggleImprescindible() {
    if (!falla) return
    const newVal = !imprescindible
    await db.fallas.update(falla.id, { imprescindible: newVal })
    setImprescindible(newVal)
  }

  const pinButton = (
    <button
      onClick={toggleImprescindible}
      title={imprescindible ? 'Quitar de imprescindibles' : 'Fijar en ruta'}
      style={{
        width: '32px',
        height: '32px',
        background: imprescindible ? 'rgba(255,107,53,0.15)' : '#2c2c2e',
        border: imprescindible ? '1px solid #FF6B35' : '0.5px solid #3a3a3c',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        marginRight: '4px',
        flexShrink: 0,
      }}
    >
      {imprescindible ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C8.69 2 6 4.69 6 8c0 2.97 2.08 5.44 4.85 6.08L12 22l1.15-7.92C15.92 13.44 18 10.97 18 8c0-3.31-2.69-6-6-6z" fill="#FF6B35" stroke="#FF6B35" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="8" r="2" fill="#fff"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C8.69 2 6 4.69 6 8c0 2.97 2.08 5.44 4.85 6.08L12 22l1.15-7.92C15.92 13.44 18 10.97 18 8c0-3.31-2.69-6-6-6z" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="8" r="2" stroke="#8e8e93" strokeWidth="1.5"/>
        </svg>
      )}
    </button>
  )

  const pct = calcularCompletitud(falla, fotos, valoracion ?? undefined, undefined)
  const tieneValoracion = !!(valoracion && valoracion.originalidad > 0)
  const seedData = SEED_FALLAS.find(f => f.id === falla.id)
  const boceto = seedData?.boceto ?? ''
  const fallera = seedData?.fallera ?? ''
  const presidente = seedData?.presidente ?? ''
  const anyoFundacion = seedData?.anyo_fundacion ?? null

  const botonCaptura =
    falla.estado === 'pendiente' ? 'Iniciar captura' :
    falla.estado === 'completa'  ? 'Editar fotos' :
                                   'Continuar captura'

  async function updateValoracion(campo: keyof Omit<Valoracion, 'id' | 'falla_id' | 'updated_at' | 'synced'>, valor: number) {
    const now = new Date().toISOString()
    const existing = await db.valoraciones.where('falla_id').equals(falla!.id).first()
    if (existing) {
      const updated = { ...existing, [campo]: valor, updated_at: now, synced: false }
      await db.valoraciones.put(updated)
      setValoracion(updated)
    } else {
      const newVal: Valoracion = {
        id: `val-${falla!.id}`,
        falla_id: falla!.id,
        originalidad: 0,
        ejecucion: 0,
        tematica: 0,
        humor: 0,
        [campo]: valor,
        updated_at: now,
        synced: false,
      }
      await db.valoraciones.add(newVal)
      setValoracion(newVal)
    }

    // Update falla completitud
    const updatedVal = await db.valoraciones.where('falla_id').equals(falla!.id).first()
    const newPct = calcularCompletitud(
      { ...falla!, notas },
      fotos,
      updatedVal,
      undefined
    )
    const newEstado = getEstadoFromCompletitud(newPct)
    await db.fallas.update(falla!.id, {
      completitud_pct: newPct,
      estado: newEstado,
      updated_at: now,
      synced: false,
    })
  }

  async function saveNotas() {
    if (!falla) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const currentFotos = await db.fotos.where('falla_id').equals(falla.id).toArray()
      const currentVal = await db.valoraciones.where('falla_id').equals(falla.id).first()
      const newPct = calcularCompletitud({ ...falla, notas }, currentFotos, currentVal, undefined)
      await db.fallas.update(falla.id, {
        notas,
        completitud_pct: newPct,
        estado: getEstadoFromCompletitud(newPct),
        updated_at: now,
        synced: false,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={falla.nombre} headerAction={pinButton}>
      <div style={{ padding: '20px' }}>

        {/* Header info */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
          <ProgressRing percentage={pct} size={72} strokeWidth={5} />
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
              {falla.artista}
            </div>
            <div style={{ fontSize: '13px', color: '#8e8e93', marginBottom: '8px' }}>
              {falla.barrio}
            </div>
            <Badge categoria={falla.categoria} size="md" />
          </div>
        </div>

        {/* Lema */}
        {falla.lema && (
          <div style={{
            background: '#2c2c2e',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '13px',
            color: '#8e8e93',
            fontStyle: 'italic',
            marginBottom: '20px',
          }}>
            "{falla.lema}"
          </div>
        )}

        {/* Datos del cartel (de la API) */}
        {(fallera || presidente || anyoFundacion) && (
          <div style={{ background: '#2c2c2e', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {fallera && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#8e8e93' }}>Fallera mayor</span>
                <span style={{ color: '#fff', fontWeight: 500 }}>{fallera}</span>
              </div>
            )}
            {presidente && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#8e8e93' }}>Presidente</span>
                <span style={{ color: '#fff', fontWeight: 500 }}>{presidente}</span>
              </div>
            )}
            {anyoFundacion && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#8e8e93' }}>Fundada en</span>
                <span style={{ color: '#fff', fontWeight: 500 }}>{anyoFundacion}</span>
              </div>
            )}
          </div>
        )}

        {/* Boceto oficial */}
        {boceto && (
          <div style={{ marginBottom: '20px', borderRadius: '12px', overflow: 'hidden', border: '0.5px solid #3a3a3c' }}>
            <img
              src={boceto}
              alt={`Boceto oficial de ${falla.nombre}`}
              style={{ width: '100%', display: 'block', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        {/* Grid de fotos capturadas */}
        {fotos.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Mis fotos ({fotos.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px', borderRadius: '12px', overflow: 'hidden' }}>
              {fotos.map((foto, i) => (
                <div
                  key={foto.id}
                  onClick={() => setLightboxIndex(i)}
                  style={{ aspectRatio: '1', cursor: 'pointer', overflow: 'hidden', background: '#2c2c2e', position: 'relative' }}
                >
                  <img
                    src={foto.data_url}
                    alt={`Foto ${i + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {!foto.synced && (
                    <div style={{
                      position: 'absolute', bottom: 4, right: 4,
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#ff9500',
                      boxShadow: '0 0 0 1.5px rgba(0,0,0,0.5)',
                    }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checklist */}
        <div style={{
          background: '#2c2c2e',
          borderRadius: '13px',
          border: '0.5px solid #3a3a3c',
          padding: '4px 16px',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, paddingTop: '10px', paddingBottom: '4px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Checklist
          </div>
          <CheckItem done={true} label="Datos del cartel (API oficial)" />
          <CheckItem
            done={fotos.length > 0}
            label={fotos.length === 0 ? 'Sin fotos' : `${fotos.length} foto${fotos.length > 1 ? 's' : ''} tomada${fotos.length > 1 ? 's' : ''}`}
          />
          <CheckItem done={tieneValoracion} label="Valoracion completada" />
          <CheckItem done={!!(notas && notas.length > 0)} label="Notas escritas" />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onOpenCamera?.(falla.id)}
              style={{
                flex: 1,
                background: '#FF6B35',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Inter, -apple-system, sans-serif',
              }}
            >
              {botonCaptura}
            </button>
            <button
              onClick={() => setShowImporter(true)}
              style={{
                flexShrink: 0,
                background: '#2c2c2e',
                color: '#ebebf5',
                border: '0.5px solid #3a3a3c',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Inter, -apple-system, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="#ebebf5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 20h16" stroke="#ebebf5" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Importar
            </button>
            {/* Botón URL — importar desde Twitter/X u otra URL */}
            <button
              onClick={() => setShowUrlImporter(true)}
              title="Importar desde URL (Twitter, YouTube...)"
              style={{
                flexShrink: 0,
                background: '#2c2c2e',
                color: '#ebebf5',
                border: '0.5px solid #3a3a3c',
                borderRadius: '12px',
                padding: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#ebebf5" strokeWidth="2"/>
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#ebebf5" strokeWidth="2"/>
              </svg>
            </button>
          </div>
          {boceto && (
            <button
              onClick={() => window.open(boceto, '_blank')}
              style={{
                width: '100%',
                background: '#2c2c2e',
                color: '#8e8e93',
                border: '0.5px solid #3a3a3c',
                borderRadius: '12px',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Inter, -apple-system, sans-serif',
              }}
            >
              Ver boceto
            </button>
          )}
        </div>

        {/* Valoraciones */}
        <div style={{
          background: '#2c2c2e',
          borderRadius: '13px',
          border: '0.5px solid #3a3a3c',
          padding: '16px',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, marginBottom: '14px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Valoracion
          </div>
          {[
            { key: 'originalidad' as const, label: 'Originalidad' },
            { key: 'ejecucion' as const, label: 'Ejecucion' },
            { key: 'tematica' as const, label: 'Tematica' },
            { key: 'humor' as const, label: 'Humor' },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', color: '#fff', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                {label}
              </span>
              <StarRating
                value={valoracion?.[key] ?? 0}
                onChange={(v) => updateValoracion(key, v)}
                size={22}
              />
            </div>
          ))}
        </div>

        {/* Notas */}
        <div style={{
          background: '#2c2c2e',
          borderRadius: '13px',
          border: '0.5px solid #3a3a3c',
          padding: '16px',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, marginBottom: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Notas
          </div>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Escribe observaciones sobre esta falla..."
            rows={4}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '14px',
              fontFamily: 'Inter, -apple-system, sans-serif',
              resize: 'none',
              outline: 'none',
              lineHeight: '1.5',
            }}
          />
          <button
            onClick={saveNotas}
            disabled={saving}
            style={{
              marginTop: '8px',
              background: 'transparent',
              color: '#FF6B35',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'Inter, -apple-system, sans-serif',
            }}
          >
            {saving ? 'Guardando...' : 'Guardar notas'}
          </button>
        </div>

      </div>

      {showImporter && (
        <VideoImporter
          fallaId={falla.id}
          onDone={() => {
            setShowImporter(false)
            reloadFotos()
          }}
        />
      )}
      {showUrlImporter && (
        <UrlImporter
          fallaId={falla.id}
          onDone={() => {
            setShowUrlImporter(false)
            reloadFotos()
          }}
        />
      )}

      {/* Lightbox fullscreen */}
      {lightboxIndex !== null && fotos.length > 0 && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 20000, display: 'flex', flexDirection: 'column' }}
          onClick={() => setLightboxIndex(null)}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px',
            paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))',
            flexShrink: 0,
          }} onClick={e => e.stopPropagation()}>
            <span style={{ color: '#8e8e93', fontSize: '14px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
              {lightboxIndex + 1} / {fotos.length}
            </span>
            <button
              onClick={() => setLightboxIndex(null)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Imagen */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}
               onClick={e => e.stopPropagation()}>
            <img
              src={fotos[lightboxIndex].data_url}
              alt={`Foto ${lightboxIndex + 1}`}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }}
            />
          </div>

          {/* Navegación prev / next */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 20px',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            flexShrink: 0,
          }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightboxIndex(i => i !== null && i > 0 ? i - 1 : fotos.length - 1)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Thumbnails strip */}
            <div style={{ display: 'flex', gap: '6px', overflow: 'hidden', maxWidth: 'calc(100% - 120px)' }}>
              {fotos.map((foto, i) => (
                <div
                  key={foto.id}
                  onClick={() => setLightboxIndex(i)}
                  style={{
                    width: 40, height: 40, borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                    border: i === lightboxIndex ? '2px solid #FF6B35' : '2px solid transparent',
                    opacity: i === lightboxIndex ? 1 : 0.5,
                  }}
                >
                  <img src={foto.data_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>

            <button
              onClick={() => setLightboxIndex(i => i !== null && i < fotos.length - 1 ? i + 1 : 0)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>,
        document.body
      )}
    </BottomSheet>
  )
}
