import type { Falla } from './db'
import { SEED_FALLAS } from './jcf-seed'

// Mapa id → barrio real (del seed actualizado con point-in-polygon)
const BARRIO_REAL: Record<string, string> = Object.fromEntries(
  SEED_FALLAS.map(f => [f.id, f.barrio])
)

export interface RouteParams {
  userPos: [number, number]
  barrios: string[]        // vacío = todos
  categorias: string[]     // vacío = todas
  maxFallas: number        // 999 = sin límite
  soloPendientes: boolean
  tipo: 'grande' | 'infantil' | 'ambas'
  imprescindibles?: string[]  // IDs de fallas que siempre se incluyen
}

export interface RouteResult {
  fallas: Falla[]
  waypoints: [number, number][]
  distanciaMetros: number
  duracionMinutos: number
}

// ─── Distancia euclidiana entre dos coordenadas (en metros aproximados) ───────
function distEuclid(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Nearest-neighbor greedy (sin API) ────────────────────────────────────────
function nearestNeighborOrder(
  start: [number, number],
  fallas: Falla[]
): Falla[] {
  const remaining = [...fallas]
  const ordered: Falla[] = []
  let cur = start

  while (remaining.length > 0) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = distEuclid(cur[0], cur[1], remaining[i].lat, remaining[i].lng)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]
    ordered.push(next)
    cur = [next.lat, next.lng]
  }

  return ordered
}

// ─── Extraer coordenadas de GeoJSON LineString ─────────────────────────────────
function extractWaypoints(geometry: { type: string; coordinates: number[][] }): [number, number][] {
  if (geometry.type === 'LineString') {
    return geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
  }
  return []
}

// ─── Llamada a OSRM /trip (TSP real) para <= 12 fallas ────────────────────────
async function osrmTrip(
  start: [number, number],
  fallas: Falla[]
): Promise<{ ordered: Falla[]; waypoints: [number, number][]; distanciaMetros: number; duracionMinutos: number }> {
  // Construir lista de coordenadas: inicio + fallas
  const coords = [
    `${start[1]},${start[0]}`,
    ...fallas.map(f => `${f.lng},${f.lat}`),
  ].join(';')

  const url =
    `https://router.project-osrm.org/trip/v1/foot/${coords}` +
    `?source=first&roundtrip=false&geometries=geojson&overview=full`

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`OSRM error ${res.status}`)

  const data = await res.json()
  if (data.code !== 'Ok') throw new Error(`OSRM code: ${data.code}`)

  // Reordenar fallas según el orden que devuelve OSRM
  // trips[0].waypoints tiene el índice original de cada waypoint
  const waypointOrder: number[] = data.waypoints
    .map((wp: { waypoint_index: number }) => wp.waypoint_index)
    // quitar el primer punto (userPos, índice 0)
    .filter((idx: number) => idx > 0)
    .map((idx: number) => idx - 1) // desplazar por el punto inicial

  const orderedFallas = waypointOrder.map((i: number) => fallas[i]).filter(Boolean) as Falla[]

  const trip = data.trips[0]
  const waypoints = extractWaypoints(trip.geometry)
  const distanciaMetros = Math.round(trip.distance)
  const duracionMinutos = Math.round(trip.duration / 60)

  return { ordered: orderedFallas, waypoints, distanciaMetros, duracionMinutos }
}

// ─── Función principal ──────────────────────────────────────────────────────────
export async function calcularRuta(
  params: RouteParams,
  todasFallas: Falla[]
): Promise<RouteResult> {
  // 1. Filtrar
  let candidatas = todasFallas.filter(f => {
    if (params.soloPendientes && f.estado === 'completa') return false
    if (params.barrios.length > 0 && !params.barrios.includes(BARRIO_REAL[f.id] ?? f.barrio)) return false
    if (params.categorias.length > 0) {
      const catMap: Record<string, Falla['categoria']> = {
        Especial: 'especial',
        '1a': 'primera',
        '2a': 'segunda',
        '3a': 'tercera',
      }
      const cats = params.categorias.map(c => catMap[c]).filter(Boolean)
      if (cats.length > 0 && !cats.includes(f.categoria)) return false
    }
    if (params.tipo !== 'ambas') {
      if (f.tipo && f.tipo !== params.tipo) return false
    }
    if (!f.lat || !f.lng) return false
    return true
  })

  // 1b. Asegurar que las imprescindibles están en la lista
  if (params.imprescindibles && params.imprescindibles.length > 0) {
    const idsImprescindibles = new Set(params.imprescindibles)
    const imprescindiblesEncontradas = todasFallas.filter(
      f => idsImprescindibles.has(f.id) && f.lat && f.lng
    )
    const candidatasIds = new Set(candidatas.map(f => f.id))
    for (const f of imprescindiblesEncontradas) {
      if (!candidatasIds.has(f.id)) candidatas.push(f)
    }
  }

  // 2. Ordenar por cercanía inicial para mejor selección cuando hay maxFallas
  candidatas = nearestNeighborOrder(params.userPos, candidatas)

  // 3. Limitar
  const maxF = params.maxFallas >= 999 ? candidatas.length : params.maxFallas
  const seleccionadas = candidatas.slice(0, maxF)

  if (seleccionadas.length === 0) {
    return { fallas: [], waypoints: [], distanciaMetros: 0, duracionMinutos: 0 }
  }

  // 4. Routing
  try {
    if (seleccionadas.length <= 12) {
      // OSRM TSP real
      const result = await osrmTrip(params.userPos, seleccionadas)
      return {
        fallas: result.ordered,
        waypoints: result.waypoints,
        distanciaMetros: result.distanciaMetros,
        duracionMinutos: result.duracionMinutos,
      }
    } else {
      // Para >12 fallas: ordenar con greedy y obtener geometría real con OSRM /route
      // /route respeta el orden dado (no reordena como /trip)
      const ordered = nearestNeighborOrder(params.userPos, seleccionadas)
      const allPoints: [number, number][] = [
        params.userPos,
        ...ordered.map(f => [f.lat, f.lng] as [number, number]),
      ]

      try {
        // OSRM /route con todos los puntos en orden greedy — NO reordena
        const coords = allPoints.map(([lat, lng]) => `${lng},${lat}`).join(';')
        const url = `https://router.project-osrm.org/route/v1/foot/${coords}?geometries=geojson&overview=full`
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (!res.ok) throw new Error('OSRM route failed')
        const data = await res.json()
        if (data.code !== 'Ok') throw new Error('OSRM route code: ' + data.code)

        const route = data.routes[0]
        const waypoints = extractWaypoints(route.geometry)
        return {
          fallas: ordered,
          waypoints,
          distanciaMetros: Math.round(route.distance),
          duracionMinutos: Math.round(route.duration / 60),
        }
      } catch {
        // Fallback: línea directa entre puntos consecutivos en orden greedy
        return {
          fallas: ordered,
          waypoints: allPoints,
          distanciaMetros: Math.round(
            ordered.reduce((sum, f, i) => {
              const prev = i === 0
                ? params.userPos
                : [ordered[i - 1].lat, ordered[i - 1].lng] as [number, number]
              return sum + distEuclid(prev[0], prev[1], f.lat, f.lng)
            }, 0)
          ),
          duracionMinutos: Math.round(ordered.length * 10),
        }
      }
    }
  } catch {
    // Fallback completo: nearest-neighbor puro sin OSRM
    const ordered = nearestNeighborOrder(params.userPos, seleccionadas)
    const waypoints: [number, number][] = [
      params.userPos,
      ...ordered.map(f => [f.lat, f.lng] as [number, number]),
    ]
    const distanciaMetros = ordered.reduce((sum, f, i) => {
      const prev = i === 0 ? params.userPos : [ordered[i - 1].lat, ordered[i - 1].lng] as [number, number]
      return sum + distEuclid(prev[0], prev[1], f.lat, f.lng)
    }, 0)
    return {
      fallas: ordered,
      waypoints,
      distanciaMetros: Math.round(distanciaMetros),
      duracionMinutos: Math.round(ordered.length * 10),
    }
  }
}
