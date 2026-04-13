/**
 * Videos API — Phase 4 (First Line Up) & Phase 5 (First Cut).
 * Upload: Step A (presigned URL) → Step B (PUT to S3) → Step C (POST /api/videos).
 */

import { apiRequest } from "@/lib/api"
import { assertDeliverableVideoFileIfVideo } from "@/lib/video-file-validation"
import {
  filterVideoCommentsWithTimestamp,
  normalizeVideoComment,
} from "@/lib/video-comment"
import type {
  Video,
  VideoPhase,
  VideoStatus,
  UploadUrlResponse,
  SubmitVideoBody,
  SubmitVideoResponse,
  VideoQueueResponse,
  VideoStatsResponse,
  ApproveRejectBody,
  RejectVideoResponse,
  VideoComment,
} from "@/types/video"

const VIDEO_STATUSES: VideoStatus[] = [
  "AGENCY_UPLOAD_PENDING",
  "MEDICAL_REVIEW",
  "CONTENT_BRAND_REVIEW",
  "APPROVED",
]

/** Map API casing/aliases to canonical `VideoStatus` so UI gates (e.g. Agency upload) match. */
function normalizeVideoStatus(raw: unknown): VideoStatus | undefined {
  if (typeof raw !== "string") return undefined
  const s = raw.trim().toUpperCase().replace(/-/g, "_")
  return VIDEO_STATUSES.includes(s as VideoStatus) ? (s as VideoStatus) : undefined
}

function checkToken(token: string | null): asserts token is string {
  if (!token) throw new Error("Not authenticated")
}

/** Backend may return `video` at top level or under `data`. */
function extractVideoFromResponse(
  data: Record<string, unknown>
): Video | undefined {
  const top = data.video
  if (top && typeof top === "object") return top as Video
  const nest = data.data
  if (nest && typeof nest === "object") {
    const inner = nest as Record<string, unknown>
    const v = inner.video
    if (v && typeof v === "object") return v as Video
  }
  return undefined
}

function extractCommentsArrayFromResponse(
  data: Record<string, unknown>
): unknown[] {
  const top = data.comments
  if (Array.isArray(top)) return top
  const nest = data.data
  if (nest && typeof nest === "object") {
    const inner = (nest as { comments?: unknown }).comments
    if (Array.isArray(inner)) return inner
  }
  return []
}

/**
 * When API omits `fileCategory`, infer from `fileType` so the player renders.
 * Normalizes `status` casing so `AGENCY_UPLOAD_PENDING` checks work across backends.
 */
export function coerceVideoFileCategory(v: Video): Video {
  const statusNorm = normalizeVideoStatus(v.status)
  const base: Video = statusNorm ? { ...v, status: statusNorm } : v
  const ft = base.fileType ?? ""
  if (
    base.fileCategory === "video" ||
    base.fileCategory === "pdf" ||
    base.fileCategory === "image" ||
    base.fileCategory === "other"
  ) {
    return base
  }
  if (base.fileUrl && ft.startsWith("video/")) {
    return { ...base, fileCategory: "video" }
  }
  if (base.fileUrl && ft.startsWith("image/")) {
    return { ...base, fileCategory: "image" }
  }
  if (base.fileUrl && ft === "application/pdf") {
    return { ...base, fileCategory: "pdf" }
  }
  return base
}

/** Step A: POST /api/videos/upload-url — get presigned S3 URL. */
export async function getUploadUrl(
  token: string | null,
  params: { fileName: string; fileType: string; fileSize: number }
): Promise<UploadUrlResponse> {
  checkToken(token)
  return apiRequest<UploadUrlResponse>("/api/videos/upload-url", {
    method: "POST",
    body: params,
    token,
  })
}

/** Step B: PUT file binary to presigned URL (direct to S3/MinIO). No auth. */
export async function uploadFileToPresignedUrl(
  uploadUrl: string,
  file: File
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Upload failed: ${res.status}`)
  }
}

/** Step C: POST /api/videos — register video after S3 upload. */
export async function submitVideo(
  token: string | null,
  body: SubmitVideoBody
): Promise<SubmitVideoResponse> {
  checkToken(token)
  return apiRequest<SubmitVideoResponse>("/api/videos", {
    method: "POST",
    body,
    token,
  })
}

/** GET /api/videos/queue — role-based: available + myReviews. */
export async function getVideoQueue(
  token: string | null
): Promise<VideoQueueResponse> {
  checkToken(token)
  const res = await apiRequest<VideoQueueResponse>("/api/videos/queue", {
    token,
  })
  return {
    ...res,
    available: (res.available ?? []).map(coerceVideoFileCategory),
    myReviews: (res.myReviews ?? []).map(coerceVideoFileCategory),
  }
}

/** GET /api/videos/stats — dashboard counts. */
export async function getVideoStats(
  token: string | null
): Promise<VideoStatsResponse> {
  checkToken(token)
  return apiRequest<VideoStatsResponse>("/api/videos/stats", { token })
}

/** GET /api/videos/:id — full video with reviews, script, TAT. */
export async function getVideo(
  token: string | null,
  videoId: string
): Promise<{ video: Video }> {
  checkToken(token)
  const data = await apiRequest<Record<string, unknown>>(
    `/api/videos/${videoId}`,
    { token }
  )
  const video = extractVideoFromResponse(data)
  if (!video) throw new Error("Video not found")
  return { video: coerceVideoFileCategory(video) }
}

/**
 * POST /api/videos/:id/approve — Step D (Medical) / Step E (Content/Brand).
 * Postman: comments required on approve; we always send a non-empty string.
 */
export async function approveVideo(
  token: string | null,
  videoId: string,
  body: { comments?: string | null } = {}
): Promise<{ success: boolean; message?: string; video: Video }> {
  checkToken(token)
  const trimmed = body?.comments != null ? String(body.comments).trim() : ""
  const comments = trimmed || "Approved."
  return apiRequest(`/api/videos/${videoId}/approve`, {
    method: "POST",
    body: { comments },
    token,
  })
}

function parseRejectVideoResponse(
  raw: Record<string, unknown>
): RejectVideoResponse {
  const rejectedVideo = (raw.rejectedVideo ?? raw.rejected_video) as
    | Video
    | undefined
  const newVersion = (raw.newVersion ?? raw.new_version) as Video | undefined
  if (!rejectedVideo) {
    throw new Error("Invalid reject response from server.")
  }
  return { rejectedVideo, newVersion }
}

/**
 * POST /api/videos/:id/reject — Step D alt (Medical) / Step E alt (Content/Brand).
 * Response: { rejectedVideo, newVersion } — newVersion is AGENCY_UPLOAD_PENDING for Agency re-upload.
 */
export async function rejectVideo(
  token: string | null,
  videoId: string,
  body: ApproveRejectBody
): Promise<RejectVideoResponse> {
  checkToken(token)
  if (!body.comments || !body.comments.trim()) {
    throw new Error("Feedback comments are required to reject a video.")
  }
  const raw = await apiRequest<Record<string, unknown>>(
    `/api/videos/${videoId}/reject`,
    {
      method: "POST",
      body,
      token,
    }
  )
  return parseRejectVideoResponse(raw)
}

/** GET /api/videos/:id/comments. */
export async function getVideoComments(
  token: string | null,
  videoId: string,
  options?: { previousVideoId?: string | null }
): Promise<VideoComment[]> {
  checkToken(token)
  const params = new URLSearchParams()
  if (options?.previousVideoId) {
    params.set("previousVideoId", options.previousVideoId)
  }
  const qs = params.toString()
  const path = `/api/videos/${videoId}/comments${qs ? `?${qs}` : ""}`
  const data = await apiRequest<Record<string, unknown>>(path, { token })
  const list = extractCommentsArrayFromResponse(data)
  return filterVideoCommentsWithTimestamp(
    list.map((c) => normalizeVideoComment(c as Record<string, unknown>))
  )
}

/** POST /api/videos/:id/comments — timestamp + asset version (matches `Video.version`). */
export async function addVideoComment(
  token: string | null,
  videoId: string,
  body: { content: string; timestampSeconds: number; assetVersion: number }
): Promise<{ success: boolean; comment: VideoComment }> {
  checkToken(token)
  const trimmed = body.content.trim()
  if (!trimmed) throw new Error("Comment cannot be empty")
  const ts = body.timestampSeconds
  if (!Number.isFinite(ts) || ts < 0) {
    throw new Error(
      "Video comments must include a valid timestamp (scrub the timeline first)."
    )
  }
  const av = body.assetVersion
  if (!Number.isFinite(av) || av < 1) {
    throw new Error("Video comments must include a valid asset version (≥ 1).")
  }
  const payload = {
    content: trimmed,
    timestampSeconds: ts,
    assetVersion: Math.trunc(av),
  }
  const res = await apiRequest<{
    success: boolean
    comment: Record<string, unknown>
  }>(`/api/videos/${videoId}/comments`, {
    method: "POST",
    body: payload,
    token,
  })
  return {
    success: res.success,
    comment: normalizeVideoComment(res.comment ?? {}),
  }
}

/** Step A → B → C — POST /api/videos body matches Postman (scriptId, phase, file metadata). */
export async function uploadVideoFlow(
  token: string | null,
  file: File,
  scriptId: string,
  phase: VideoPhase,
  options?: { videoId?: string }
): Promise<Video> {
  assertDeliverableVideoFileIfVideo(file)
  const fileName = file.name
  const fileType = file.type || "application/octet-stream"
  const fileSize = file.size

  const { uploadUrl, fileUrl } = await getUploadUrl(token, {
    fileName,
    fileType,
    fileSize,
  })
  await uploadFileToPresignedUrl(uploadUrl, file)
  const body: SubmitVideoBody = {
    scriptId,
    phase,
    fileUrl,
    fileName,
    fileType,
    fileSize,
  }
  if (options?.videoId) {
    body.videoId = options.videoId
  }
  const res = await submitVideo(token, body)
  if (!res.video) throw new Error("No video in response")
  return res.video
}
