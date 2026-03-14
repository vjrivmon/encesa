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

interface FotoWithFalla extends Foto {
  fallaNombre?: string
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
  const [fotasPendientes, setFotasPendientes] = useState<FotoWithFalla[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    const [fallas, fotos]: [Falla[], Foto[]] = await Promise.all([
      db.fallas.toArray(),
      db.fotos.toArray(),
    ])
    const pendientes = fotos.filter(f => !f.synced)
    const totalBytes = pendientes.reduce((sum, f) => sum + (f.data_url?.length ?? 0) * 0.75, 0)
    const fallasMap = Object.fromEntries(fallas.map(f => [f.id, f.nombre]))

    const enriched: FotoWithFalla[] = pendientes.map(f => ({
      ...f,
      fallaNombre: fallasMap[f.falla_id] ?? f.falla_id,
    }))
    setFotasPendientes(enriched)
    setSelectedIds(new Set(enriched.map(f => f.id)))

    setStats({
      totalFallas: fallas.length,
      enProgreso: fallas.filter(f => f.estado === 'en_progreso').length,
      completas: fallas.filter(f => f.estado === 'completa').length,
      fotasPendientes: pendientes.length,
      tamanoEstimadoMB: Math.round(totalBytes / (1024 * 1024) * 10) / 10,
      lastSync: localStorage.getItem('encesa_last_sync'),
    })
  }

  function toggleFoto(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function eliminarFoto(id: string) {
    await db.fotos.delete(id)
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    await loadStats()
  }

  async function syncAll() {
    setSyncing(true)
    setSyncResult(null)

    try {
      const fallas = await db.fallas.where('synced').equals(0).toArray()
      const allFotos = await db.fotos.where('synced').equals(0).toArray()
      const fotos = allFotos.filter(f => selectedIds.has(f.id))

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
          .from('fotos')
          .upload(path, blob, { upsert: true })

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('fotos')
            .getPublicUrl(path)

          await supabase.from('fotos').upsert({
            id: foto.id,
            falla_id: foto.falla_id,
            angulo: foto.angulo ?? 'frontal',
            url_storage: publicUrl,
            synced: true,
            capturada_at: foto.capturada_at ?? foto.created_at ?? new Date().toISOString(),
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
        marginBottom: fotasPendientes.length > 0 ? '12px' : '24px',
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

      {/* Preview fotos pendientes */}
      {fotasPendientes.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setShowPreview(v => !v)}
            style={{
              width: '100%',
              background: '#2c2c2e',
              border: '0.5px solid #3a3a3c',
              borderRadius: '13px',
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '14px', color: '#0a84ff', fontWeight: 600, fontFamily: 'Inter, -apple-system, sans-serif' }}>
              Revisar fotos ({selectedIds.size}/{fotasPendientes.length} seleccionadas)
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: showPreview ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
              <path d="M6 9l6 6 6-6" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {showPreview && (
            <div style={{
              background: '#2c2c2e',
              border: '0.5px solid #3a3a3c',
              borderTop: 'none',
              borderRadius: '0 0 13px 13px',
              padding: '12px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px',
            }}>
              {fotasPendientes.map(foto => {
                const selected = selectedIds.has(foto.id)
                return (
                  <div
                    key={foto.id}
                    onClick={() => toggleFoto(foto.id)}
                    style={{
                      position: 'relative',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      aspectRatio: '1',
                      cursor: 'pointer',
                      border: `2px solid ${selected ? '#0a84ff' : 'transparent'}`,
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <img
                      src={foto.data_url}
                      alt={foto.fallaNombre}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {/* Checkbox overlay */}
                    <div style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: selected ? '#0a84ff' : 'rgba(0,0,0,0.45)',
                      border: `2px solid ${selected ? '#0a84ff' : 'rgba(255,255,255,0.6)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {selected && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    {/* Falla name + delete */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0, left: 0, right: 0,
                      background: 'linear-gradient(transparent, rgba(0,0,0,0.82))',
                      padding: '20px 8px 7px',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                      gap: '4px',
                    }}>
                      <div style={{ fontSize: '11px', color: '#fff', fontFamily: 'Inter, -apple-system, sans-serif', lineHeight: 1.3, flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {(foto.fallaNombre ?? 'Sin falla').slice(0, 32)}
                        </div>
                      </div>
                      <div
                        onClick={e => { e.stopPropagation(); eliminarFoto(foto.id) }}
                        style={{
                          width: '28px', height: '28px',
                          borderRadius: '8px',
                          background: 'rgba(255,59,48,0.85)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, cursor: 'pointer',
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

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
        {syncing ? 'Sincronizando...' : selectedIds.size > 0 ? `Sincronizar ${selectedIds.size} foto${selectedIds.size > 1 ? 's' : ''}` : 'Sincronizar ahora'}
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
