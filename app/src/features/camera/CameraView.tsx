import { useRef, useEffect, useState, useCallback } from 'react'
import { db, type Foto, type Falla } from '../../lib/db'
import { calcularCompletitud, getEstadoFromCompletitud } from '../../lib/completitud'

interface CameraViewProps {
  fallaId?: string
}

export default function CameraView({ fallaId }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [lastPhoto, setLastPhoto] = useState<string | null>(null)
  const [falla, setFalla] = useState<Falla | null>(null)
  const [photoCount, setPhotoCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    if (fallaId) {
      db.fallas.get(fallaId).then(f => setFalla(f ?? null))
      db.fotos.where('falla_id').equals(fallaId).toArray().then(fotos => {
        setPhotoCount(fotos.length)
        const lastFoto = fotos[fotos.length - 1]
        if (lastFoto) setLastPhoto(lastFoto.data_url)
      })
    }
  }, [fallaId])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setError(null)
    } catch (err) {
      setError('Sin acceso a la camara. Verifica los permisos.')
      console.error(err)
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [startCamera])

  async function capture() {
    if (!videoRef.current || !canvasRef.current) return
    setCapturing(true)

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

    const foto: Foto = {
      id: `foto-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      falla_id: fallaId ?? 'libre',
      angulo: 'libre',
      data_url: dataUrl,
      synced: false,
      capturada_at: new Date().toISOString(),
    }

    await db.fotos.add(foto)
    setLastPhoto(dataUrl)
    setPhotoCount(prev => prev + 1)

    // Update falla completitud
    if (fallaId && falla) {
      const fotos = await db.fotos.where('falla_id').equals(fallaId).toArray()
      const valoracion = await db.valoraciones.where('falla_id').equals(fallaId).first()
      const pct = calcularCompletitud(falla, fotos, valoracion, undefined)
      const estado = getEstadoFromCompletitud(pct)
      await db.fallas.update(fallaId, {
        completitud_pct: pct,
        estado,
        updated_at: new Date().toISOString(),
        synced: false,
      })
    }

    setCapturing(false)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>

      {/* Video */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Error */}
      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(28,28,30,0.9)',
          borderRadius: '13px',
          padding: '20px',
          textAlign: 'center',
          color: '#ff3b30',
          fontSize: '14px',
          fontFamily: 'Inter, -apple-system, sans-serif',
          maxWidth: '280px',
        }}>
          {error}
        </div>
      )}

      {/* Falla name badge */}
      {falla && (
        <div style={{
          position: 'absolute',
          top: 'calc(54px + env(safe-area-inset-top, 0px))',
          left: '16px',
          right: '16px',
          background: 'rgba(28,28,30,0.8)',
          borderRadius: '10px',
          padding: '8px 12px',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {falla.nombre}
          </div>
          <div style={{ fontSize: '11px', color: '#8e8e93', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {falla.artista} · {falla.barrio}
          </div>
        </div>
      )}

      {/* Contador de fotos */}
      {photoCount > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(64px + env(safe-area-inset-top, 0px))',
          right: '16px',
          background: 'rgba(0,0,0,0.55)',
          borderRadius: '20px',
          padding: '4px 12px',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {photoCount} {photoCount === 1 ? 'foto' : 'fotos'}
          </span>
        </div>
      )}

      {/* Shutter + last photo */}
      <div style={{
        position: 'absolute',
        bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '32px',
        paddingBottom: '10px',
      }}>

        {/* Last photo thumbnail */}
        {lastPhoto ? (
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '10px',
            overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.4)',
          }}>
            <img src={lastPhoto} alt="ultima foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div style={{ width: '52px', height: '52px' }} />
        )}

        {/* Shutter button */}
        <button
          onClick={capture}
          disabled={capturing}
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: capturing ? '#888' : '#fff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.1s, background 0.1s',
          }}
        >
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            border: '2px solid rgba(0,0,0,0.2)',
          }} />
        </button>

        {/* Spacer */}
        <div style={{ width: '52px' }} />
      </div>

    </div>
  )
}
