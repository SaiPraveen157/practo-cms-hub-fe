import type { Script, ScriptQueueResponse, ScriptStatus } from "@/types/script"
import type { Video, VideoQueueResponse } from "@/types/video"

/** Merge GET /api/videos/queue sections (dedupe by video row id). */
export function mergeVideoQueueRows(res: VideoQueueResponse): Video[] {
  const pendingUpload = res.pendingUpload ?? []
  const raw = [
    ...(res.available ?? []),
    ...(res.myReviews ?? []),
    ...pendingUpload,
  ]
  const seen = new Set<string>()
  const out: Video[] = []
  for (const v of raw) {
    if (seen.has(v.id)) continue
    seen.add(v.id)
    out.push(v)
  }
  return out
}

/** Merge GET /api/scripts/queue sections (dedupe by script id). */
export function mergeScriptQueueRows(res: ScriptQueueResponse): Script[] {
  const raw = [...(res.available ?? []), ...(res.myReviews ?? [])]
  const seen = new Set<string>()
  const out: Script[] = []
  for (const s of raw) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    out.push(s)
  }
  return out
}

function parseScriptStatus(raw: string | undefined): ScriptStatus {
  const s = raw as ScriptStatus
  const allowed: ScriptStatus[] = [
    "DRAFT",
    "CONTENT_BRAND_REVIEW",
    "AGENCY_PRODUCTION",
    "MEDICAL_REVIEW",
    "CONTENT_BRAND_APPROVAL",
    "CONTENT_APPROVER_REVIEW",
    "LOCKED",
  ]
  return allowed.includes(s) ? s : "AGENCY_PRODUCTION"
}

/**
 * One merged `Script` per `scriptId` for list cards — built only from queue video rows
 * (no GET /api/scripts/queue).
 */
export function scriptsFromQueueVideos(videos: Video[]): Script[] {
  const byScript = new Map<string, Video[]>()
  for (const v of videos) {
    const sid = v.script?.id ?? v.scriptId
    if (!sid) continue
    const list = byScript.get(sid) ?? []
    list.push(v)
    byScript.set(sid, list)
  }
  const scripts: Script[] = []
  for (const [, rows] of byScript) {
    scripts.push(mergeQueueRowsToMinimalScript(rows))
  }
  scripts.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
  return scripts
}

function mergeQueueRowsToMinimalScript(rows: Video[]): Script {
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
  const best = sorted[0]!
  const ref = best.script
  const scriptId = ref?.id ?? best.scriptId
  const latestMs = Math.max(
    ...rows.map((r) => new Date(r.updatedAt).getTime())
  )
  const uploaded = rows.map((r) => r.uploadedBy).find(Boolean)
  return {
    id: scriptId,
    version: 1,
    title: ref?.title ?? "Untitled script",
    insight: null,
    content: "",
    status: parseScriptStatus(ref?.status),
    createdAt: best.createdAt,
    updatedAt: new Date(latestMs).toISOString(),
    createdBy: uploaded
      ? {
          id: uploaded.id,
          firstName: uploaded.firstName,
          lastName: uploaded.lastName,
        }
      : null,
  }
}

function normalizeVideoStatusLoose(v: Video): string {
  return String(v.status ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_")
}

/**
 * Agency-owned work: upload still required, excluding First Line Up on locked scripts
 * (those are the focused "Ready to upload" tab).
 *
 * Typical data: `AGENCY_UPLOAD_PENDING` is often `FIRST_LINE_UP` + locked — those go to
 * Ready to upload only. Resubmit / rejection-return video rows are included here
 * (same tab as first-time pending uploads).
 */
export function isVideoScriptQueueAgency(v: Video): boolean {
  if (normalizeVideoStatusLoose(v) !== "AGENCY_UPLOAD_PENDING") return false
  if (isVideoReadyToUploadFlu(v)) return false
  return true
}

/**
 * Script queue tab: scripts `GET /api/scripts/queue` returns for Agency at
 * `AGENCY_PRODUCTION` (new handoff from Content/Brand or after rejection), plus
 * script shells built from video rows that need agency upload (when not already
 * covered by the script queue). Script-queue rows are merged last so they win
 * over minimal objects derived from videos.
 */
export function scriptsForScriptQueueTab(
  queueVideos: Video[],
  scriptQueueScripts: Script[]
): Script[] {
  const fromVideos =
    queueVideos.length === 0
      ? []
      : scriptsMatchingVideoFilter(queueVideos, isVideoScriptQueueAgency)
  const fromScriptQueue = scriptQueueScripts.filter(
    (s) => s.status === "AGENCY_PRODUCTION"
  )
  const byId = new Map<string, Script>()
  for (const s of fromVideos) {
    byId.set(s.id, s)
  }
  for (const s of fromScriptQueue) {
    byId.set(s.id, s)
  }
  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

/**
 * Script workflow stages where the document is with Medical, Content/Brand, or
 * Content Approver — not with Agency. Used for Agency POC "Script review in
 * progress" (script queue for Agency only returns AGENCY_PRODUCTION + LOCKED).
 */
export const SCRIPT_REVIEW_WITH_OTHER_TEAMS_STATUSES: ScriptStatus[] = [
  "MEDICAL_REVIEW",
  "CONTENT_BRAND_REVIEW",
  "CONTENT_BRAND_APPROVAL",
  "CONTENT_APPROVER_REVIEW",
]

/** Dedupe by script id, newest first. */
export function mergeUniqueScriptsById(scripts: Script[]): Script[] {
  const byId = new Map<string, Script>()
  for (const s of scripts) {
    byId.set(s.id, s)
  }
  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

/** Locked script — ready to start Phase 4 (First Line Up upload). */
export function isVideoReadyToUploadFlu(v: Video): boolean {
  return (
    v.phase === "FIRST_LINE_UP" &&
    normalizeVideoStatusLoose(v) === "AGENCY_UPLOAD_PENDING" &&
    v.script?.status === "LOCKED"
  )
}

/** Phase 3 (First Cut) complete for this row — approved after review. */
export function isVideoLockedPhase3Done(v: Video): boolean {
  return (
    v.phase === "FIRST_CUT" && normalizeVideoStatusLoose(v) === "APPROVED"
  )
}

export function scriptsMatchingVideoFilter(
  allVideos: Video[],
  predicate: (v: Video) => boolean
): Script[] {
  return scriptsFromQueueVideos(allVideos.filter(predicate))
}
