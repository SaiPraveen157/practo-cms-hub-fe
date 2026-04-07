import type { VideoComment } from "@/types/video"

/**
 * Parse timestamp from API comment payloads (camelCase or snake_case).
 */
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

/** Normalize GET/POST comment JSON to `VideoComment` with `timestampSeconds` set. */
export function normalizeVideoComment(
  raw: Record<string, unknown>
): VideoComment {
  return {
    id: String(raw.id ?? ""),
    content: String(raw.content ?? ""),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    timestampSeconds: parseVideoCommentTimestampSeconds(raw),
    author: raw.author as VideoComment["author"],
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
