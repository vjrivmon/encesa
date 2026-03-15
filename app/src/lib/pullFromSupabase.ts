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

    const fallasToUpdate: Falla[] = []
    for (const remote of remoteFallas) {
      const local = localMap[remote.id]
      if (!local || remote.updated_at > local.updated_at) {
        fallasToUpdate.push({
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
      }
    }
    if (fallasToUpdate.length > 0) {
      await db.fallas.bulkPut(fallasToUpdate)
      fallasSynced = fallasToUpdate.length
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

    const fotosToAdd: Foto[] = []
    for (const remote of remoteFotos) {
      if (!remote.url_storage) continue
      if (!localIds.has(remote.id)) {
        fotosToAdd.push({
          id: remote.id,
          falla_id: remote.falla_id,
          angulo: remote.angulo ?? 'libre',
          data_url: remote.url_storage,
          url_storage: remote.url_storage,
          synced: true,
          capturada_at: remote.capturada_at,
        } as Foto)
      }
    }
    if (fotosToAdd.length > 0) {
      await db.fotos.bulkPut(fotosToAdd)
      fotosSynced = fotosToAdd.length
    }
  }

  // ── 3. Valoraciones ───────────────────────────────────────────────────────
  const { data: remoteVals, error: eVals } = await supabase
    .from('valoraciones')
    .select('*')

  if (!eVals && remoteVals) {
    const localVals = await db.valoraciones.toArray()
    const localMap = Object.fromEntries(localVals.map(v => [v.falla_id, v]))

    const valsToUpdate: Valoracion[] = []
    for (const remote of remoteVals) {
      const local = localMap[remote.falla_id]
      if (!local || remote.updated_at > local.updated_at) {
        valsToUpdate.push({
          id: remote.id,
          falla_id: remote.falla_id,
          originalidad: remote.originalidad,
          ejecucion: remote.ejecucion,
          tematica: remote.tematica,
          humor: remote.humor,
          updated_at: remote.updated_at,
          synced: true,
        } as Valoracion)
      }
    }
    if (valsToUpdate.length > 0) {
      await db.valoraciones.bulkPut(valsToUpdate)
      valoracionesSynced = valsToUpdate.length
    }
  }

  return { fallas: fallasSynced, fotos: fotosSynced, valoraciones: valoracionesSynced }
}
