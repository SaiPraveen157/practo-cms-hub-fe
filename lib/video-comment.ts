import type { VideoComment } from "@/types/video"

/**
 * Parse timestamp from API comment payloads (camelCase or snake_case).
 */
/** Integer asset / video version the comment belongs to (GET often nests under `video.version`). */
export function parseVideoCommentAssetVersion(
  raw: Record<string, unknown>
): number | null {
  const videoNest = raw.video
  if (videoNest && typeof videoNest === "object") {
    const vo = videoNest as Record<string, unknown>
    const ver = vo.version ?? vo.video_version
    if (ver != null && ver !== "") {
      const n = typeof ver === "number" ? ver : Number(ver)
      if (Number.isFinite(n) && n >= 1) return Math.trunc(n)
    }
  }
  const candidates = [
    raw.assetVersion,
    raw.asset_version,
    raw.videoVersion,
    raw.video_version,
    raw.packageAssetVersion,
    raw.package_asset_version,
  ]
  for (const v of candidates) {
    if (v == null || v === "") continue
    const n = typeof v === "number" ? v : Number(v)
    if (Number.isFinite(n) && n >= 1) return Math.trunc(n)
  }
  const only = raw.version
  if (only != null && only !== "") {
    const n = typeof only === "number" ? only : Number(only)
    if (Number.isFinite(n) && n >= 1) return Math.trunc(n)
  }
  return null
}

export function parseVideoCommentTimestampSeconds(
  raw: Record<string, unknown>
): number | null {
  const v =
    raw.timestampSeconds ??
    raw.timestamp_seconds ??
    raw.timestamp_sec ??
    raw.timeStamp ??
    raw.time_stamp
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeCommentAuthor(
  raw: Record<string, unknown>
): VideoComment["author"] {
  const a = raw.author
  if (a && typeof a === "object") {
    const o = a as Record<string, unknown>
    return {
      id: String(o.id ?? ""),
      firstName: String(o.firstName ?? o.first_name ?? ""),
      lastName: String(o.lastName ?? o.last_name ?? ""),
      role: String(o.role ?? ""),
    }
  }
  return undefined
}

/** Normalize GET/POST comment JSON to `VideoComment` with `timestampSeconds` set. */
export function normalizeVideoComment(
  raw: Record<string, unknown>
): VideoComment {
  const assetVersion = parseVideoCommentAssetVersion(raw)
  const videoNest = raw.video
  let nestedVersion: number | undefined
  if (videoNest && typeof videoNest === "object") {
    const vo = videoNest as Record<string, unknown>
    const vv = vo.version ?? vo.video_version
    if (vv != null && vv !== "") {
      const n = typeof vv === "number" ? vv : Number(vv)
      if (Number.isFinite(n) && n >= 1) nestedVersion = Math.trunc(n)
    }
  }
  return {
    id: String(raw.id ?? ""),
    content: String(raw.content ?? ""),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    timestampSeconds: parseVideoCommentTimestampSeconds(raw),
    assetVersion,
    ...(nestedVersion != null ? { video: { version: nestedVersion } } : {}),
    author: normalizeCommentAuthor(raw),
  }
}

/** Read timestamp from a comment (normalized or raw API shape). */
export function getVideoCommentTimestampSeconds(
  c: VideoComment
): number | null {
  const direct = c.timestampSeconds
  if (direct != null && Number.isFinite(direct)) return direct
  return parseVideoCommentTimestampSeconds(
    c as unknown as Record<string, unknown>
  )
}

export function getVideoCommentAssetVersion(c: VideoComment): number | null {
  const direct = c.assetVersion
  if (direct != null && Number.isFinite(direct) && direct >= 1) {
    return Math.trunc(direct)
  }
  const nv = c.video?.version
  if (nv != null && Number.isFinite(nv) && nv >= 1) return Math.trunc(nv)
  return parseVideoCommentAssetVersion(c as unknown as Record<string, unknown>)
}

/**
 * Keep comments that belong to the current file version. Legacy comments with
 * no `assetVersion` are shown only for version 1 so a new version (v2+) starts clean.
 */
export function filterVideoCommentsForAssetVersion(
  comments: VideoComment[],
  currentVersion: number
): VideoComment[] {
  if (!Number.isFinite(currentVersion) || currentVersion < 1) return comments
  return comments.filter((c) => {
    const v = getVideoCommentAssetVersion(c)
    if (v == null) return currentVersion === 1
    return v === currentVersion
  })
}

/** True if any timestamped thread comment applies to this version (blocks approve). */
export function videoThreadBlocksApprove(
  comments: VideoComment[],
  currentVersion: number
): boolean {
  return (
    filterVideoCommentsForAssetVersion(comments, currentVersion).length > 0
  )
}

/** Shown near disabled Approve when `videoThreadBlocksApprove` is true. */
export const VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION =
  "Approve is disabled until all the comments are resolved for this video."

/**
 * Phase 4+ video threads (first line up / first cut / final package / language):
 * only timeline-scoped comments are supported — omit legacy entries without a time.
 */
export function filterVideoCommentsWithTimestamp(
  comments: VideoComment[]
): VideoComment[] {
  return comments.filter((c) => getVideoCommentTimestampSeconds(c) != null)
}
