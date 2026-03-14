import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { db, type Foto } from '../../lib/db'

interface VideoImporterProps {
  fallaId: string
  onDone: () => void
}

interface Frame {
  dataUrl: string
  selected: boolean
}

export default function VideoImporter({ fallaId, onDone }: VideoImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Abrir el picker automáticamente al montar
    const t = setTimeout(() => inputRef.current?.click(), 50)
    return () => clearTimeout(t)
  }, [])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) { onDone(); return }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string
        const foto: Foto = {
          id: crypto.randomUUID(),
          falla_id: fallaId,
          angulo: 'libre',
          data_url: dataUrl,
          synced: false,
          capturada_at: new Date().toISOString(),
        }
        await db.fotos.add(foto)
        onDone()
      }
      reader.readAsDataURL(file)
    } else if (file.type.startsWith('video/')) {
      setProcessing(true)
      await extractFrames(file)
      setProcessing(false)
    } else {
      onDone()
    }
  }

  async function extractFrames(file: File): Promise<void> {
    return new Promise<void>((resolve) => {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'metadata'
      const objectUrl = URL.createObjectURL(file)
      video.src = objectUrl

      video.addEventListener('loadedmetadata', () => {
        const duration = video.duration
        const MAX_FRAMES = 20
        // Distribuir frames uniformemente, mínimo cada 2s
        const totalFrames = Math.min(MAX_FRAMES, Math.floor(duration / 2) + 1)
        const step = duration / totalFrames
        const times: number[] = []
        for (let i = 0; i < totalFrames; i++) {
          times.push(Math.min(i * step, duration - 0.1))
        }

        const canvas = document.createElement('canvas')
        const capturedFrames: Frame[] = []
        let currentIndex = 0

        function captureNext() {
          if (currentIndex >= times.length) {
            URL.revokeObjectURL(objectUrl)
            setFrames(capturedFrames)
            resolve()
            return
          }
          video.currentTime = times[currentIndex]
        }

        video.addEventListener('seeked', () => {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(video, 0, 0)
            capturedFrames.push({
              dataUrl: canvas.toDataURL('image/jpeg', 0.92),
              selected: false,
            })
          }
          currentIndex++
          captureNext()
        })

        captureNext()
      })

      video.load()
    })
  }

  function toggleFrame(i: number) {
    setFrames(prev =>
      prev.map((f, idx) => idx === i ? { ...f, selected: !f.selected } : f)
    )
  }

  async function saveSelected() {
    setSaving(true)
    const selected = frames.filter(f => f.selected)
    const now = new Date().toISOString()
    for (const frame of selected) {
      const foto: Foto = {
        id: crypto.randomUUID(),
        falla_id: fallaId,
        angulo: 'libre',
        data_url: frame.dataUrl,
        synced: false,
        capturada_at: now,
      }
      await db.fotos.add(foto)
    }
    setSaving(false)
    onDone()
  }

  const selectedCount = frames.filter(f => f.selected).length

  // Grid de selección de frames
  if (frames.length > 0) {
    return createPortal(
      <div style={{
        position: 'fixed', inset: 0,
        background: '#1c1c1e',
        zIndex: 10001,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))',
          borderBottom: '0.5px solid #3a3a3c',
          flexShrink: 0,
        }}>
          <button
            onClick={onDone}
            style={{
              background: 'none', border: 'none', color: '#fff',
              cursor: 'pointer', padding: '4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span style={{
            color: '#fff', fontSize: '15px', fontWeight: 600,
            fontFamily: 'Inter, -apple-system, sans-serif',
          }}>
            Selecciona los mejores frames
          </span>
          <div style={{ width: 28 }} />
        </div>

        {/* Grid */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '8px',
          paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '4px',
          alignContent: 'start',
        }}>
          {frames.map((frame, i) => (
            <div
              key={i}
              onClick={() => toggleFrame(i)}
              style={{
                position: 'relative',
                cursor: 'pointer',
                borderRadius: '8px',
                overflow: 'hidden',
                border: frame.selected ? '2px solid #FF6B35' : '2px solid transparent',
                aspectRatio: '9/16',
                background: '#2c2c2e',
              }}
            >
              <img
                src={frame.dataUrl}
                alt={`Frame ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {frame.selected && (
                <div style={{
                  position: 'absolute', top: '6px', right: '6px',
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: '#FF6B35',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5l3 3 7-7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer — fixed para garantizar visibilidad */}
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 20px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          background: '#1c1c1e',
          borderTop: '0.5px solid #3a3a3c',
          zIndex: 10002,
        }}>
          <button
            onClick={saveSelected}
            disabled={selectedCount === 0 || saving}
            style={{
              width: '100%',
              background: selectedCount === 0 ? '#3a3a3c' : '#FF6B35',
              color: selectedCount === 0 ? '#8e8e93' : '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '14px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter, -apple-system, sans-serif',
              transition: 'background 0.2s',
            }}
          >
            {saving
              ? 'Guardando...'
              : `Guardar ${selectedCount} seleccionada${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>,
      document.body
    )
  }

  // Procesando o esperando selección
  return createPortal(
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      {processing && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(28,28,30,0.92)',
          zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '12px',
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            border: '3px solid #3a3a3c',
            borderTopColor: '#FF6B35',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{
            color: '#8e8e93', fontSize: '14px',
            fontFamily: 'Inter, -apple-system, sans-serif',
          }}>
            Extrayendo frames...
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
    </>,
    document.body
  )
}
