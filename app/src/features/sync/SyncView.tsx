import { useState, useEffect } from 'react'
import { db, type Falla, type Foto } from '../../lib/db'
import { supabase } from '../../lib/supabase'

interface SyncStats {
  totalFallas: number
  enProgreso: number
  completas: number
  fotasPendientes: number
  tamanoEstimadoMB: number
  lastSync: string | null
}

export default function SyncView() {
  const [stats, setStats] = useState<SyncStats>({
    totalFallas: 0,
    enProgreso: 0,
    completas: 0,
    fotasPendientes: 0,
    tamanoEstimadoMB: 0,
    lastSync: null,
  })
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    const [fallas, fotos]: [Falla[], Foto[]] = await Promise.all([
      db.fallas.toArray(),
      db.fotos.toArray(),
    ])
    const fotasPendientes = fotos.filter(f => !f.synced)
    const totalBytes = fotasPendientes.reduce((sum, f) => sum + (f.data_url?.length ?? 0) * 0.75, 0)

    setStats({
      totalFallas: fallas.length,
      enProgreso: fallas.filter(f => f.estado === 'en_progreso').length,
      completas: fallas.filter(f => f.estado === 'completa').length,
      fotasPendientes: fotasPendientes.length,
      tamanoEstimadoMB: Math.round(totalBytes / (1024 * 1024) * 10) / 10,
      lastSync: localStorage.getItem('encesa_last_sync'),
    })
  }

  async function syncAll() {
    setSyncing(true)
    setSyncResult(null)

    try {
      const fallas = await db.fallas.where('synced').equals(0).toArray()
      const fotos = await db.fotos.where('synced').equals(0).toArray()

      let uploaded = 0
      let errors = 0

      // Upload fallas metadata
      for (const falla of fallas) {
        const { error } = await supabase.from('fallas').upsert({
          id: falla.id,
          nombre: falla.nombre,
          barrio: falla.barrio,
          artista: falla.artista,
          categoria: falla.categoria,
          lema: falla.lema,
          anyo: falla.anyo,
          lat: falla.lat,
          lng: falla.lng,
          estado: falla.estado,
          completitud_pct: falla.completitud_pct,
          notas: falla.notas,
          ocr_realizado: falla.ocr_realizado,
          created_at: falla.created_at,
          updated_at: falla.updated_at,
        })
        if (!error) {
          await db.fallas.update(falla.id, { synced: true })
          uploaded++
        } else {
          errors++
        }
      }

      // Upload photos to Storage
      for (const foto of fotos) {
        const base64 = foto.data_url.split(',')[1]
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        const blob = new Blob([bytes], { type: 'image/jpeg' })
        const path = `fotos/${foto.falla_id}/${foto.id}.jpg`

        const { error: uploadError } = await supabase.storage
          .from('encesa-fotos')
          .upload(path, blob, { upsert: true })

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('encesa-fotos')
            .getPublicUrl(path)

          await supabase.from('fotos').upsert({
            id: foto.id,
            falla_id: foto.falla_id,
            angulo: foto.angulo,
            url_storage: publicUrl,
            synced: true,
            capturada_at: foto.capturada_at,
          })
          await db.fotos.update(foto.id, { synced: true, url_storage: publicUrl })
          uploaded++
        } else {
          errors++
        }
      }

      const now = new Date().toISOString()
      localStorage.setItem('encesa_last_sync', now)

      setSyncResult({
        ok: errors === 0,
        message: errors === 0
          ? `Sync completado: ${uploaded} registros subidos`
          : `Sync parcial: ${uploaded} ok, ${errors} errores`,
      })
      await loadStats()
    } catch (err) {
      setSyncResult({ ok: false, message: `Error de conexion: ${String(err)}` })
    }

    setSyncing(false)
  }

  const lastSyncDate = stats.lastSync ? new Date(stats.lastSync) : null
  const isSupabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>

      {/* Status header */}
      <div style={{
        background: '#2c2c2e',
        borderRadius: '13px',
        border: '0.5px solid #3a3a3c',
        padding: '16px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: isSupabaseConfigured ? '#34c759' : '#ff3b30',
          flexShrink: 0,
        }} />
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {isSupabaseConfigured ? 'Supabase conectado' : 'Supabase no configurado'}
          </div>
          <div style={{ fontSize: '12px', color: '#8e8e93', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {lastSyncDate
              ? `Ultima sync: ${lastSyncDate.toLocaleDateString('es-ES')} ${lastSyncDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
              : 'Sin sincronizaciones previas'
            }
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
        marginBottom: '24px',
      }}>
        {[
          { label: 'Total fallas', value: stats.totalFallas, color: '#fff' },
          { label: 'En progreso', value: stats.enProgreso, color: '#FF6B35' },
          { label: 'Completas', value: stats.completas, color: '#34c759' },
          { label: 'Fotos pendientes', value: stats.fotasPendientes, color: '#0a84ff' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#2c2c2e',
            borderRadius: '13px',
            border: '0.5px solid #3a3a3c',
            padding: '14px',
          }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color, fontFamily: 'Inter, -apple-system, sans-serif', lineHeight: 1 }}>
              {value}
            </div>
            <div style={{ fontSize: '12px', color: '#8e8e93', marginTop: '4px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Size estimate */}
      <div style={{
        background: '#2c2c2e',
        borderRadius: '13px',
        border: '0.5px solid #3a3a3c',
        padding: '14px 16px',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '14px', color: '#8e8e93', fontFamily: 'Inter, -apple-system, sans-serif' }}>
          Tamano estimado a subir
        </span>
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff', fontFamily: 'Inter, -apple-system, sans-serif' }}>
          {stats.tamanoEstimadoMB} MB
        </span>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div style={{
          background: syncResult.ok ? 'rgba(52,199,89,0.15)' : 'rgba(255,59,48,0.15)',
          border: `0.5px solid ${syncResult.ok ? '#34c759' : '#ff3b30'}`,
          borderRadius: '13px',
          padding: '12px 16px',
          marginBottom: '16px',
          fontSize: '14px',
          color: syncResult.ok ? '#34c759' : '#ff3b30',
          fontFamily: 'Inter, -apple-system, sans-serif',
        }}>
          {syncResult.message}
        </div>
      )}

      {/* Sync button */}
      <button
        onClick={syncAll}
        disabled={syncing || !isSupabaseConfigured}
        style={{
          width: '100%',
          padding: '16px',
          background: syncing || !isSupabaseConfigured
            ? '#2c2c2e'
            : 'linear-gradient(135deg, #FF6B35, #ff9500)',
          color: syncing || !isSupabaseConfigured ? '#636366' : '#fff',
          border: 'none',
          borderRadius: '14px',
          fontSize: '16px',
          fontWeight: 700,
          cursor: syncing || !isSupabaseConfigured ? 'not-allowed' : 'pointer',
          fontFamily: 'Inter, -apple-system, sans-serif',
          boxShadow: syncing || !isSupabaseConfigured ? 'none' : '0 4px 20px rgba(255,107,53,0.35)',
          transition: 'all 0.2s',
          marginBottom: '10px',
        }}
      >
        {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
      </button>

      <p style={{
        textAlign: 'center',
        fontSize: '13px',
        color: '#8e8e93',
        fontFamily: 'Inter, -apple-system, sans-serif',
        marginBottom: '32px',
      }}>
        Solo se sincroniza cuando tu lo decides
      </p>

      {/* Python script block */}
      <div style={{
        background: '#000',
        borderRadius: '13px',
        border: '0.5px solid #3a3a3c',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <div style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, marginBottom: '10px', fontFamily: 'Inter, -apple-system, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Exportar dataset
        </div>
        <code style={{
          display: 'block',
          fontSize: '12px',
          color: '#FF6B35',
          fontFamily: 'monospace',
          lineHeight: 1.6,
          wordBreak: 'break-all',
        }}>
          pip install supabase python-dotenv{'\n'}
          python scripts/encesa_sync.py
        </code>
      </div>

      {!isSupabaseConfigured && (
        <div style={{
          background: 'rgba(255,107,53,0.1)',
          border: '0.5px solid #FF6B35',
          borderRadius: '13px',
          padding: '14px 16px',
          fontSize: '13px',
          color: '#FF6B35',
          fontFamily: 'Inter, -apple-system, sans-serif',
          lineHeight: 1.5,
        }}>
          Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.local para habilitar la sincronizacion.
        </div>
      )}

    </div>
  )
}
