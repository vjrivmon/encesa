import { useRef, useEffect, useState, useCallback } from 'react'
import { createWorker } from 'tesseract.js'
import { db, type OCRResult } from '../../lib/db'

interface OCRCampo {
  valor: string
  confianza: number
}

interface OCRCampos {
  nombre: OCRCampo
  artista: OCRCampo
  categoria: OCRCampo
  lema: OCRCampo
}

function parseOCRText(text: string): OCRCampos {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  const findByKeyword = (keywords: string[]): OCRCampo => {
    for (const kw of keywords) {
      const idx = lines.findIndex(l => l.toLowerCase().includes(kw.toLowerCase()))
      if (idx >= 0) {
        const value = lines[idx].replace(new RegExp(kw, 'i'), '').replace(/[:\-–]/g, '').trim()
        return { valor: value || lines[idx + 1] || '', confianza: 75 }
      }
    }
    return { valor: '', confianza: 0 }
  }

  return {
    nombre: findByKeyword(['Nom:', 'Nombre:', 'Falla', 'NOM']),
    artista: findByKeyword(['Artista:', 'Artist', 'Artiste']),
    categoria: findByKeyword(['Secció', 'Sección', 'Categoria', 'Categoria:']),
    lema: findByKeyword(['Lema:', 'Tema:', 'LEMA', 'TEMA']),
  }
}

export default function OCRView({ fallaId }: { fallaId?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [processing, setProcessing] = useState(false)
  const [campos, setCampos] = useState<OCRCampos | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {
      setError('Sin acceso a la camara')
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [startCamera])

  async function captureAndOCR() {
    if (!videoRef.current || !canvasRef.current) return
    setProcessing(true)
    setCampos(null)
    setSaved(false)

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedImage(dataUrl)

    try {
      const worker = await createWorker(['spa', 'eng'])
      const { data } = await worker.recognize(dataUrl)
      await worker.terminate()

      const parsed = parseOCRText(data.text)
      setCampos(parsed)
    } catch (err) {
      console.error(err)
      setError('Error al procesar el texto')
    }

    setProcessing(false)
  }

  async function confirmOCR() {
    if (!campos || !fallaId) return

    const fotoId = `ocr-foto-${Date.now()}`
    await db.fotos.add({
      id: fotoId,
      falla_id: fallaId,
      angulo: 'detalle',
      data_url: capturedImage!,
      synced: false,
      capturada_at: new Date().toISOString(),
    })

    const ocrResult: OCRResult = {
      id: `ocr-${Date.now()}`,
      falla_id: fallaId,
      campos: campos as unknown as Record<string, { valor: string; confianza: number }>,
      foto_cartel_id: fotoId,
      procesado_at: new Date().toISOString(),
      synced: false,
    }
    await db.ocr_results.add(ocrResult)
    await db.fallas.update(fallaId, { ocr_realizado: true, synced: false })

    setSaved(true)
  }

  function updateCampo(key: keyof OCRCampos, valor: string) {
    if (!campos) return
    setCampos({ ...campos, [key]: { ...campos[key], valor } })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>

      {/* Live camera or captured image */}
      {capturedImage ? (
        <img src={capturedImage} alt="captura OCR" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Scan frame */}
      {!capturedImage && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%',
          height: '35%',
          pointerEvents: 'none',
        }}>
          {/* Corner borders */}
          {[
            { top: 0, left: 0, borderTop: '3px solid #FF6B35', borderLeft: '3px solid #FF6B35' },
            { top: 0, right: 0, borderTop: '3px solid #FF6B35', borderRight: '3px solid #FF6B35' },
            { bottom: 0, left: 0, borderBottom: '3px solid #FF6B35', borderLeft: '3px solid #FF6B35' },
            { bottom: 0, right: 0, borderBottom: '3px solid #FF6B35', borderRight: '3px solid #FF6B35' },
          ].map((style, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: '24px',
              height: '24px',
              borderRadius: '2px',
              ...style,
            }} />
          ))}

          {/* Scan line */}
          <div
            className="animate-scan"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, transparent, #FF6B35, transparent)',
            }}
          />
        </div>
      )}

      {/* Processing overlay */}
      {processing && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid #3a3a3c',
            borderTopColor: '#FF6B35',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ color: '#fff', fontSize: '16px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            Procesando texto...
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {error && !processing && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '16px',
          right: '16px',
          transform: 'translateY(-50%)',
          background: 'rgba(255,59,48,0.15)',
          border: '0.5px solid #ff3b30',
          borderRadius: '13px',
          padding: '16px',
          textAlign: 'center',
          color: '#ff3b30',
          fontSize: '14px',
          fontFamily: 'Inter, -apple-system, sans-serif',
        }}>
          {error}
        </div>
      )}

      {/* OCR results */}
      {campos && !processing && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(28,28,30,0.97)',
          borderRadius: '20px 20px 0 0',
          padding: '20px',
          paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '70%',
          overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '4px', background: '#3a3a3c', borderRadius: '2px' }} />
          </div>

          <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            Resultado del escaneo
          </div>

          {(Object.entries(campos) as [keyof OCRCampos, OCRCampo][]).map(([key, campo]) => (
            <div key={key} style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </span>
                {campo.confianza > 0 && (
                  <span style={{ fontSize: '11px', color: campo.confianza > 70 ? '#34c759' : '#FF6B35', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                    {campo.confianza}% confianza
                  </span>
                )}
              </div>
              <input
                value={campo.valor}
                onChange={e => updateCampo(key, e.target.value)}
                placeholder={`Editar ${key}...`}
                style={{
                  width: '100%',
                  background: '#2c2c2e',
                  border: '0.5px solid #3a3a3c',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  color: '#fff',
                  fontSize: '14px',
                  fontFamily: 'Inter, -apple-system, sans-serif',
                  outline: 'none',
                }}
              />
            </div>
          ))}

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              onClick={() => { setCampos(null); setCapturedImage(null) }}
              style={{
                flex: 1,
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
              Repetir
            </button>
            <button
              onClick={confirmOCR}
              disabled={saved || !fallaId}
              style={{
                flex: 1,
                background: saved ? '#34c759' : '#FF6B35',
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
              {saved ? 'Guardado' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* Capture button (only when no results) */}
      {!campos && !processing && !capturedImage && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100px + env(safe-area-inset-bottom, 0px))',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
        }}>
          <button
            onClick={captureAndOCR}
            style={{
              padding: '14px 40px',
              background: '#FF6B35',
              color: '#fff',
              border: 'none',
              borderRadius: '30px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Inter, -apple-system, sans-serif',
              boxShadow: '0 4px 20px rgba(255,107,53,0.4)',
            }}
          >
            Escanear cartel
          </button>
        </div>
      )}

    </div>
  )
}
