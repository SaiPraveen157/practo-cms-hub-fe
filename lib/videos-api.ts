/**
 * Videos API — Phase 4 (First Line Up) & Phase 5 (First Cut).
 * Upload: Step A (presigned URL) → Step B (PUT to S3) → Step C (POST /api/videos).
 */

import { apiRequest } from "@/lib/api"
import type {
  Video,
  VideoPhase,
  UploadUrlResponse,
  SubmitVideoBody,
  SubmitVideoResponse,
  VideoQueueResponse,
  VideoStatsResponse,
  ApproveRejectBody,
  RejectVideoResponse,
  VideoComment,
} from "@/types/video"

function checkToken(token: string | null): asserts token is string {
  if (!token) throw new Error("Not authenticated")
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
  return apiRequest<VideoQueueResponse>("/api/videos/queue", { token })
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
  const data = await apiRequest<{ video?: Video } & Record<string, unknown>>(
    `/api/videos/${videoId}`,
    { token }
  )
  if (data.video) return { video: data.video }
  throw new Error("Video not found")
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
  videoId: string
): Promise<VideoComment[]> {
  checkToken(token)
  const data = await apiRequest<
    { comments?: VideoComment[] } & Record<string, unknown>
  >(`/api/videos/${videoId}/comments`, { token })
  return data.comments ?? []
}

/** POST /api/videos/:id/comments. */
export async function addVideoComment(
  token: string | null,
  videoId: string,
  content: string
): Promise<{ success: boolean; comment: VideoComment }> {
  checkToken(token)
  return apiRequest(`/api/videos/${videoId}/comments`, {
    method: "POST",
    body: { content },
    token,
  })
}

/** Step A → B → C — POST /api/videos body matches Postman (scriptId, phase, file metadata). */
export async function uploadVideoFlow(
  token: string | null,
  file: File,
  scriptId: string,
  phase: VideoPhase
): Promise<Video> {
  const fileName = file.name
  const fileType = file.type || "application/octet-stream"
  const fileSize = file.size

  const { uploadUrl, fileUrl } = await getUploadUrl(token, {
    fileName,
    fileType,
    fileSize,
  })
  await uploadFileToPresignedUrl(uploadUrl, file)
  const res = await submitVideo(token, {
    scriptId,
    phase,
    fileUrl,
    fileName,
    fileType,
    fileSize,
  })
  if (!res.video) throw new Error("No video in response")
  return res.video
}
