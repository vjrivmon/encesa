import { useState } from 'react'
import { createPortal } from 'react-dom'
import { db, type Foto } from '../../lib/db'

interface UrlImporterProps {
  fallaId: string
  onDone: () => void
}

interface Frame {
  dataUrl: string
  selected: boolean
}

type Stage = 'input' | 'loading' | 'frames'

const PROXY = 'https://48ad08e8a1b56528-77-42-16-230.serveousercontent.com/?url='

/** Extrae el tweet ID de una URL de twitter.com o x.com */
function extractTweetId(raw: string): string | null {
  try {
    const u = new URL(raw)
    const match = u.pathname.match(/\/status\/(\d+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/** Detecta si es una URL de TikTok */
function isTikTok(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.hostname.endsWith('tiktok.com')
  } catch { return false }
}

export default function UrlImporter({ fallaId, onDone }: UrlImporterProps) {
  const [stage, setStage] = useState<Stage>('input')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [frames, setFrames] = useState<Frame[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')

  async function handleImport() {
    const trimmed = url.trim()
    if (!trimmed) return
    setError('')
    setStage('loading')
    setLoadingMsg('Buscando vídeo...')

    try {
      let videoUrl: string | null = null
      let directImages: { url: string }[] = []

      if (isTikTok(trimmed)) {
        // ── TikTok via tikwm API ─────────────────────────────────────────
        setLoadingMsg('Obteniendo vídeo de TikTok...')
        const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(trimmed)}`)
        if (!res.ok) throw new Error(`tikwm respondió ${res.status}`)
        const data = await res.json()
        if (data.code !== 0 || !data.data?.play) throw new Error('No se pudo obtener el vídeo de TikTok')
        videoUrl = data.data.play

      } else {
        // ── Twitter/X via fxtwitter API ──────────────────────────────────
        const tweetId = extractTweetId(trimmed)
        if (!tweetId) throw new Error('URL no válida. Pega un enlace de x.com, twitter.com o tiktok.com')

        const res = await fetch(`https://api.fxtwitter.com/status/${tweetId}`)
        if (!res.ok) throw new Error(`fxtwitter respondió ${res.status}`)
        const data = await res.json()
        const tweet = data.tweet
        if (!tweet) throw new Error('Tweet no encontrado o privado')

        const allMedia: { type: string; url: string; formats?: { url: string; bitrate?: number; container: string }[] }[] =
          tweet.media?.all ?? []

        const videoMedia = allMedia.find(m => m.type === 'video' || m.type === 'gif')
        directImages = allMedia.filter(m => m.type === 'photo')

        if (videoMedia) {
          const mp4Formats = (videoMedia.formats ?? []).filter(f => f.container === 'mp4' && f.bitrate)
          const best = mp4Formats.length > 0
            ? mp4Formats.reduce((a, b) => (b.bitrate! < a.bitrate! ? b : a))
            : null
          videoUrl = best?.url ?? videoMedia.url
        }
      }

      if (videoUrl) {
        const proxiedUrl = PROXY + encodeURIComponent(videoUrl)
        setLoadingMsg('Cargando vídeo...')
        await extractFrames(proxiedUrl)

      } else if (directImages.length > 0) {
        // Tweet con fotos — importarlas directamente
        setLoadingMsg(`Importando ${directImages.length} imagen${directImages.length > 1 ? 'es' : ''}...`)
        const now = new Date().toISOString()
        for (const img of directImages) {
          const imgBlob = await fetch(img.url).then(r => r.blob())
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = e => resolve(e.target?.result as string)
            reader.readAsDataURL(imgBlob)
          })
          await db.fotos.add({
            id: crypto.randomUUID(),
            falla_id: fallaId,
            angulo: 'libre',
            data_url: dataUrl,
            synced: false,
            capturada_at: now,
          })
        }
        onDone()

      } else {
        throw new Error('Este contenido no tiene vídeo ni imágenes adjuntas')
      }

    } catch (err) {
      setError(String(err).replace('Error: ', ''))
      setStage('input')
    }
  }

  async function extractFrames(src: string): Promise<void> {
    const isBlob = src.startsWith('blob:')
    return new Promise<void>((resolve, reject) => {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'metadata'
      video.crossOrigin = 'anonymous'
      video.src = src

      video.addEventListener('error', () => {
        if (isBlob) URL.revokeObjectURL(src)
        reject(new Error('No se pudo cargar el vídeo'))
      })

      video.addEventListener('loadedmetadata', () => {
        const duration = video.duration
        const MAX_FRAMES = 20
        const totalFrames = Math.min(MAX_FRAMES, Math.floor(duration / 2) + 1)
        const step = totalFrames > 1 ? duration / totalFrames : duration
        const times: number[] = []
        for (let i = 0; i < totalFrames; i++) {
          times.push(Math.min(i * step, duration - 0.1))
        }

        const canvas = document.createElement('canvas')
        const capturedFrames: Frame[] = []
        let idx = 0

        function captureNext() {
          if (idx >= times.length) {
            if (isBlob) URL.revokeObjectURL(src)
            setFrames(capturedFrames)
            setStage('frames')
            resolve()
            return
          }
          video.currentTime = times[idx]
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
          idx++
          captureNext()
        })

        captureNext()
      })

      video.load()
    })
  }

  function toggleFrame(i: number) {
    setFrames(prev => prev.map((f, fi) => fi === i ? { ...f, selected: !f.selected } : f))
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

  // ── Grid de frames (idéntico al VideoImporter) ──────────────────────────
  if (stage === 'frames') {
    return createPortal(
      <div style={{
        position: 'fixed', inset: 0,
        background: '#1c1c1e',
        zIndex: 10001,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))',
          borderBottom: '0.5px solid #3a3a3c',
          flexShrink: 0,
        }}>
          <button onClick={onDone} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span style={{ color: '#fff', fontSize: '15px', fontWeight: 600, fontFamily: 'Inter, -apple-system, sans-serif' }}>
            Selecciona los mejores frames
          </span>
          <div style={{ width: 28 }} />
        </div>

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
                position: 'relative', cursor: 'pointer',
                borderRadius: '8px', overflow: 'hidden',
                border: frame.selected ? '2px solid #FF6B35' : '2px solid transparent',
                aspectRatio: '16/9', background: '#2c2c2e',
              }}
            >
              <img src={frame.dataUrl} alt={`Frame ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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

        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
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
              border: 'none', borderRadius: '12px', padding: '14px',
              fontSize: '15px', fontWeight: 600,
              cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter, -apple-system, sans-serif',
              transition: 'background 0.2s',
            }}
          >
            {saving ? 'Guardando...' : `Guardar ${selectedCount} seleccionada${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>,
      document.body
    )
  }

  // ── Modal de entrada / cargando ─────────────────────────────────────────
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      zIndex: 10001,
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div style={{
        width: '100%',
        background: '#1c1c1e',
        borderRadius: '20px 20px 0 0',
        padding: '20px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <span style={{ color: '#fff', fontSize: '16px', fontWeight: 700, fontFamily: 'Inter, -apple-system, sans-serif' }}>
            Importar desde URL
          </span>
          <button onClick={onDone} style={{ background: 'none', border: 'none', color: '#8e8e93', cursor: 'pointer', padding: '4px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {stage === 'input' ? (
          <>
            {/* Input URL */}
            <input
              type="url"
              placeholder="https://x.com/... o https://vm.tiktok.com/..."
              value={url}
              onChange={e => { setUrl(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleImport()}
              autoFocus
              style={{
                width: '100%',
                background: '#2c2c2e',
                border: error ? '1px solid #ff3b30' : '1px solid #3a3a3c',
                borderRadius: '10px',
                padding: '13px 14px',
                fontSize: '14px',
                color: '#fff',
                fontFamily: 'Inter, -apple-system, sans-serif',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: error ? '8px' : '16px',
              }}
            />

            {error && (
              <div style={{
                color: '#ff3b30', fontSize: '13px',
                fontFamily: 'Inter, -apple-system, sans-serif',
                marginBottom: '12px', lineHeight: 1.4,
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!url.trim()}
              style={{
                width: '100%',
                background: url.trim() ? '#FF6B35' : '#3a3a3c',
                color: url.trim() ? '#fff' : '#636366',
                border: 'none', borderRadius: '12px', padding: '14px',
                fontSize: '15px', fontWeight: 600,
                cursor: url.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'Inter, -apple-system, sans-serif',
                transition: 'background 0.2s',
              }}
            >
              Extraer frames
            </button>
          </>
        ) : (
          /* Loading */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', paddingTop: '12px', paddingBottom: '24px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              border: '3px solid #3a3a3c',
              borderTopColor: '#FF6B35',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ color: '#8e8e93', fontSize: '14px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
              {loadingMsg}
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
