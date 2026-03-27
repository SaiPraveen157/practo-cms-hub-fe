import type { FinalPackage } from "@/types/package"
import type { Video } from "@/types/video"

/** Latest row for a script + phase (by version). */
export function getLatestVideoForScriptPhase(
  videos: Video[],
  scriptId: string,
  phase: Video["phase"]
): Video | undefined {
  const list = videos.filter(
    (v) => v.scriptId === scriptId && v.phase === phase
  )
  if (list.length === 0) return undefined
  return [...list].sort((a, b) => b.version - a.version)[0]
}

/**
 * Phase 6 (final package) is only valid after Phase 5 (First Cut) is approved.
 * Phases 4–5 (FLU → First Cut) must complete before Final Package Delivery.
 *
 * @see Postman Phase 6 — "Cannot submit package — First Cut video has not been approved yet"
 */
export function isScriptEligibleForPhase6FinalPackage(
  videos: Video[],
  scriptId: string
): boolean {
  const latest = getLatestVideoForScriptPhase(videos, scriptId, "FIRST_CUT")
  return latest?.status === "APPROVED"
}

export function mergeVideoListsById(...lists: Video[][]): Video[] {
  const byId = new Map<string, Video>()
  for (const list of lists) {
    for (const v of list) byId.set(v.id, v)
  }
  return [...byId.values()]
}

/**
 * DRAFT final packages may be auto-created before Phase 5 completes; hide them until
 * First Cut is approved. In-review packages are assumed backend-validated.
 */
export function packageVisibleInAgencyPhase6Workflow(
  pkg: FinalPackage,
  videos: Video[]
): boolean {
  if (pkg.status !== "DRAFT") return true
  return isScriptEligibleForPhase6FinalPackage(videos, pkg.scriptId)
}
