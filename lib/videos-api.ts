/**
 * Videos API — Phase 4 (First Line Up) & Phase 5 (First Cut).
 * Upload: Step A (presigned URL) → Step B (PUT to S3) → Step C (POST /api/videos).
 */

import { apiRequest } from "@/lib/api"
import { assertDeliverableVideoFileIfVideo } from "@/lib/video-file-validation"
import {
  ensureVideoCommentAssetVersion,
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
  VideoVersionDetailView,
  VideoVersionListEntry,
  VideoVersionsListResponse,
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

/** API may nest payload under `data`. */
function unwrapDataRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const d = raw.data
  if (d != null && typeof d === "object" && !Array.isArray(d)) {
    return d as Record<string, unknown>
  }
  return raw
}

function numOrUndef(v: unknown): number | undefined {
  if (v == null || v === "") return undefined
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

function parseVideoVersionListEntry(
  item: Record<string, unknown>
): VideoVersionListEntry | null {
  const v = numOrUndef(item.version ?? item.videoVersion ?? item.video_version)
  if (v == null || v < 1) return null
  const vid = String(
    item.videoId ?? item.video_id ?? item.id ?? ""
  ).trim()
  const cc = numOrUndef(item.commentCount ?? item.comment_count)
  return {
    version: v,
    videoId: vid,
    status: typeof item.status === "string" ? item.status : undefined,
    fileName:
      item.fileName != null || item.file_name != null
        ? String(item.fileName ?? item.file_name)
        : undefined,
    createdAt:
      typeof item.createdAt === "string"
        ? item.createdAt
        : typeof item.created_at === "string"
          ? item.created_at
          : undefined,
    updatedAt:
      typeof item.updatedAt === "string"
        ? item.updatedAt
        : typeof item.updated_at === "string"
          ? item.updated_at
          : undefined,
    uploadedAt:
      typeof item.uploadedAt === "string"
        ? item.uploadedAt
        : typeof item.uploaded_at === "string"
          ? item.uploaded_at
          : undefined,
    commentCount: cc,
    wasRejected: Boolean(item.wasRejected ?? item.was_rejected),
    rejectionReason:
      item.rejectionReason != null || item.rejection_reason != null
        ? String(item.rejectionReason ?? item.rejection_reason)
        : null,
    rejection:
      item.rejection != null && typeof item.rejection === "object"
        ? (item.rejection as Record<string, unknown>)
        : null,
  }
}

/**
 * GET /api/videos/:videoId/versions — version dropdown (current row id from route).
 */
export async function getVideoVersionsList(
  token: string | null,
  videoId: string
): Promise<VideoVersionsListResponse> {
  checkToken(token)
  const raw = await apiRequest<Record<string, unknown>>(
    `/api/videos/${videoId}/versions`,
    { token }
  )
  const body = unwrapDataRecord(raw)
  const versionsRaw = body.versions
  const versions: VideoVersionListEntry[] = []
  if (Array.isArray(versionsRaw)) {
    for (const el of versionsRaw) {
      if (!el || typeof el !== "object") continue
      const row = parseVideoVersionListEntry(el as Record<string, unknown>)
      if (row) {
        versions.push({
          ...row,
          videoId: row.videoId.trim() ? row.videoId : videoId,
        })
      }
    }
  }
  versions.sort((a, b) => b.version - a.version)
  const cv = numOrUndef(body.currentVersion ?? body.current_version)
  const tv = numOrUndef(body.totalVersions ?? body.total_versions)
  return {
    success: Boolean(raw.success ?? body.success),
    scriptId: typeof body.scriptId === "string" ? body.scriptId : undefined,
    scriptTitle:
      typeof body.scriptTitle === "string"
        ? body.scriptTitle
        : typeof body.script_title === "string"
          ? body.script_title
          : undefined,
    phase: typeof body.phase === "string" ? body.phase : undefined,
    currentVersion: cv,
    totalVersions: tv,
    versions,
  }
}

function parseVersionDetailFileFields(body: Record<string, unknown>): {
  fileUrl: string | null
  fileName: string | null
  fileType: string | null
  fileSize: number | null
} {
  const file = body.file
  if (file != null && typeof file === "object") {
    const f = file as Record<string, unknown>
    const url = f.fileUrl ?? f.file_url
    return {
      fileUrl: typeof url === "string" && url ? url : null,
      fileName:
        f.fileName != null || f.file_name != null
          ? String(f.fileName ?? f.file_name)
          : null,
      fileType:
        f.fileType != null || f.file_type != null
          ? String(f.fileType ?? f.file_type)
          : null,
      fileSize: numOrUndef(f.fileSize ?? f.file_size) ?? null,
    }
  }
  const url = body.fileUrl ?? body.file_url
  return {
    fileUrl: typeof url === "string" && url ? url : null,
    fileName:
      body.fileName != null || body.file_name != null
        ? String(body.fileName ?? body.file_name)
        : null,
    fileType:
      body.fileType != null || body.file_type != null
        ? String(body.fileType ?? body.file_type)
        : null,
    fileSize: numOrUndef(body.fileSize ?? body.file_size) ?? null,
  }
}

/**
 * GET /api/videos/:videoId/versions/:version — full file + comments for one version (read-only history).
 * `:videoId` is the **current** row id from the route; backend resolves the chain.
 */
export async function getVideoVersionDetail(
  token: string | null,
  videoId: string,
  version: number
): Promise<VideoVersionDetailView> {
  checkToken(token)
  if (!Number.isFinite(version) || version < 1) {
    throw new Error("version must be a positive integer")
  }
  const raw = await apiRequest<Record<string, unknown>>(
    `/api/videos/${videoId}/versions/${Math.trunc(version)}`,
    { token }
  )
  const body = unwrapDataRecord(raw)
  const id = String(
    body.id ?? body.videoId ?? body.video_id ?? ""
  ).trim()
  const ver = numOrUndef(body.version) ?? Math.trunc(version)
  const { fileUrl, fileName, fileType, fileSize } =
    parseVersionDetailFileFields(body)
  const list = extractCommentsArrayFromResponse(body)
  const comments: VideoComment[] = filterVideoCommentsWithTimestamp(
    list.map((c) =>
      ensureVideoCommentAssetVersion(
        normalizeVideoComment(c as Record<string, unknown>),
        ver
      )
    )
  )
  return {
    id: id || String(videoId),
    version: ver,
    isCurrentVersion: Boolean(body.isCurrentVersion ?? body.is_current_version),
    scriptId: typeof body.scriptId === "string" ? body.scriptId : undefined,
    scriptTitle:
      typeof body.scriptTitle === "string"
        ? body.scriptTitle
        : typeof body.script_title === "string"
          ? body.script_title
          : undefined,
    phase: typeof body.phase === "string" ? body.phase : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    fileUrl,
    fileName,
    fileType,
    fileSize,
    createdAt:
      typeof body.createdAt === "string"
        ? body.createdAt
        : typeof body.created_at === "string"
          ? body.created_at
          : undefined,
    updatedAt:
      typeof body.updatedAt === "string"
        ? body.updatedAt
        : typeof body.updated_at === "string"
          ? body.updated_at
          : undefined,
    comments,
  }
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
    pendingUpload: (res.pendingUpload ?? []).map(coerceVideoFileCategory),
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
