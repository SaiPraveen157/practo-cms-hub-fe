import type { Video, VideoStatus } from "@/types/video"

/** Statuses meaning a newer version is in rework (Agency → Medical) before Content/Brand sees it again. */
const BEFORE_CONTENT_BRAND: VideoStatus[] = [
  "AGENCY_UPLOAD_PENDING",
  "MEDICAL_REVIEW",
]

/**
 * After Content/Brand rejects, backend may still return the old row in myReviews alongside the new
 * AGENCY_UPLOAD_PENDING version. Hide stale CONTENT_BRAND_REVIEW rows when a higher version is
 * already back in the Agency → Medical loop.
 */
export function filterStaleContentBrandVideos(videos: Video[]): Video[] {
  const byId = new Map<string, Video>()
  for (const v of videos) {
    if (!byId.has(v.id)) byId.set(v.id, v)
  }
  const unique = [...byId.values()]
  const staleIds = new Set<string>()
  const byScriptPhase = new Map<string, Video[]>()
  for (const v of unique) {
    const k = `${v.scriptId}\0${v.phase}`
    const g = byScriptPhase.get(k) ?? []
    g.push(v)
    byScriptPhase.set(k, g)
  }
  for (const group of byScriptPhase.values()) {
    for (const v of group) {
      if (v.status !== "CONTENT_BRAND_REVIEW") continue
      const superseded = group.some(
        (w) => w.version > v.version && BEFORE_CONTENT_BRAND.includes(w.status)
      )
      if (superseded) staleIds.add(v.id)
    }
  }
  return unique.filter((v) => !staleIds.has(v.id))
}

/**
 * Hide stale MEDICAL_REVIEW when a higher version is awaiting Agency upload (rework after CB reject).
 */
export function filterStaleMedicalReviewVideos(videos: Video[]): Video[] {
  const byId = new Map<string, Video>()
  for (const v of videos) {
    if (!byId.has(v.id)) byId.set(v.id, v)
  }
  const unique = [...byId.values()]
  const staleIds = new Set<string>()
  const byScriptPhase = new Map<string, Video[]>()
  for (const v of unique) {
    const k = `${v.scriptId}\0${v.phase}`
    const g = byScriptPhase.get(k) ?? []
    g.push(v)
    byScriptPhase.set(k, g)
  }
  for (const group of byScriptPhase.values()) {
    for (const v of group) {
      if (v.status !== "MEDICAL_REVIEW") continue
      const superseded = group.some(
        (w) => w.version > v.version && w.status === "AGENCY_UPLOAD_PENDING"
      )
      if (superseded) staleIds.add(v.id)
    }
  }
  return unique.filter((v) => !staleIds.has(v.id))
}
