/**
 * Sync bidireccional: descarga fallas, fotos y valoraciones desde Supabase
 * y las vuelca en IndexedDB local (last-write-wins por updated_at / capturada_at).
 * Las fotos remotas se almacenan sin data_url; se muestran vía url_storage.
 */
import { supabase } from './supabase'
import { db, type Falla, type Foto, type Valoracion } from './db'

export async function pullFromSupabase(): Promise<{ fallas: number; fotos: number; valoraciones: number }> {
  let fallasSynced = 0
  let fotosSynced = 0
  let valoracionesSynced = 0

  // ── 1. Fallas ────────────────────────────────────────────────────────────
  const { data: remoteFallas, error: eFallas } = await supabase
    .from('fallas')
    .select('*')
    .order('updated_at', { ascending: false })

  if (!eFallas && remoteFallas) {
    const localFallas = await db.fallas.toArray()
    const localMap = Object.fromEntries(localFallas.map(f => [f.id, f]))

    for (const remote of remoteFallas) {
      const local = localMap[remote.id]
      // Actualizar si no existe localmente o si el remoto es más reciente
      if (!local || remote.updated_at > local.updated_at) {
        await db.fallas.put({
          id: remote.id,
          nombre: remote.nombre,
          barrio: remote.barrio,
          artista: remote.artista,
          categoria: remote.categoria,
          lema: remote.lema ?? undefined,
          anyo: remote.anyo,
          lat: remote.lat,
          lng: remote.lng,
          tipo: remote.tipo ?? 'grande',
          estado: remote.estado,
          completitud_pct: remote.completitud_pct,
          notas: remote.notas ?? undefined,
          ocr_realizado: remote.ocr_realizado,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          synced: true,
          imprescindible: remote.imprescindible ?? false,
        } as Falla)
        fallasSynced++
      }
    }
  }

  // ── 2. Fotos ─────────────────────────────────────────────────────────────
  const { data: remoteFotos, error: eFotos } = await supabase
    .from('fotos')
    .select('*')
    .order('capturada_at', { ascending: false })

  if (!eFotos && remoteFotos) {
    const localFotos = await db.fotos.toArray()
    const localIds = new Set(localFotos.map(f => f.id))

    for (const remote of remoteFotos) {
      if (!remote.url_storage) continue
      if (!localIds.has(remote.id)) {
        // Foto remota que no existe localmente — guardar con url_storage como fuente
        await db.fotos.put({
          id: remote.id,
          falla_id: remote.falla_id,
          angulo: remote.angulo ?? 'libre',
          data_url: remote.url_storage, // usar URL pública como data_url
          url_storage: remote.url_storage,
          synced: true,
          capturada_at: remote.capturada_at,
        } as Foto)
        fotosSynced++
      }
    }
  }

  // ── 3. Valoraciones ───────────────────────────────────────────────────────
  const { data: remoteVals, error: eVals } = await supabase
    .from('valoraciones')
    .select('*')

  if (!eVals && remoteVals) {
    const localVals = await db.valoraciones.toArray()
    const localMap = Object.fromEntries(localVals.map(v => [v.falla_id, v]))

    for (const remote of remoteVals) {
      const local = localMap[remote.falla_id]
      if (!local || remote.updated_at > local.updated_at) {
        await db.valoraciones.put({
          id: remote.id,
          falla_id: remote.falla_id,
          originalidad: remote.originalidad,
          ejecucion: remote.ejecucion,
          tematica: remote.tematica,
          humor: remote.humor,
          updated_at: remote.updated_at,
          synced: true,
        } as Valoracion)
        valoracionesSynced++
      }
    }
  }

  return { fallas: fallasSynced, fotos: fotosSynced, valoraciones: valoracionesSynced }
}
