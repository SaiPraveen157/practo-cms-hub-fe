import type { Video } from "@/types/video"
import { getVideoQueue } from "@/lib/videos-api"

/** True when this row is tied to a prior rejection — version may still be 1 if API uses previousVideoId instead. */
export function isVideoResubmitFlow(video: Video): boolean {
  return (
    video.version > 1 ||
    video.previousVideoId != null ||
    video.rejectionComment != null
  )
}

/**
 * Agency queue/detail: row is a return / continuation slot (reject, or e.g. First Cut
 * after First Line Up) — POST /api/videos must include `videoId` for that row.
 * Do not require `!fileUrl`: some APIs still echo a file URL on AGENCY_UPLOAD_PENDING until
 * a new file is registered; the upload UI must still appear.
 */
export function isAgencyRejectedReturn(video: Video): boolean {
  return (
    video.status === "AGENCY_UPLOAD_PENDING" && isVideoResubmitFlow(video)
  )
}

/**
 * Find the previous version row in the queue (same script + phase, version N-1, has a file).
 * Used on the agency detail page to show the rejected cut while v{N} awaits upload.
 */
export async function findPriorVideoVersionInQueue(
  token: string,
  current: Video
): Promise<Video | null> {
  if (current.version <= 1) return null
  const res = await getVideoQueue(token)
  const combined = [...(res.available ?? []), ...(res.myReviews ?? [])]
  const target = current.version - 1
  return (
    combined.find(
      (v) =>
        v.scriptId === current.scriptId &&
        v.phase === current.phase &&
        v.version === target &&
        v.fileUrl
    ) ?? null
  )
}
