/**
 * Phase 7 — Language packages API (`/api/language-packages`).
 */

import { apiRequest } from "@/lib/api"
import {
  normalizeLanguagePackage,
  normalizeLanguageVideo,
} from "@/lib/language-package-response-normalize"
import {
  ensureVideoCommentAssetVersion,
  filterVideoCommentsWithTimestamp,
  normalizeVideoComment,
} from "@/lib/video-comment"
import { uploadFileToPresignedUrl } from "@/lib/videos-api"
import type { VideoComment } from "@/types/video"
import type {
  ApproveLanguageVideoBody,
  CreateLanguagePackageBody,
  LanguagePackage,
  LanguagePackageQueueResponse,
  LanguagePackageStatsResponse,
  LanguagePackageUploadUrlAssetType,
  LanguagePackageUploadUrlResponse,
  LanguageVideo,
  RejectLanguageVideoBody,
  ResubmitLanguageMetadataBody,
  ResubmitLanguageVideoBody,
  ReviewLanguageThumbnailBody,
  SubmitLanguageVideoInput,
} from "@/types/language-package"

function checkToken(token: string | null): asserts token is string {
  if (!token) throw new Error("Not authenticated")
}

function unwrapData<T>(raw: unknown): T | undefined {
  if (raw && typeof raw === "object" && "data" in raw) {
    return (raw as { data: T }).data
  }
  return undefined
}

export async function getLanguagePackageUploadUrl(
  token: string | null,
  params: {
    fileName: string
    fileType: string
    assetType?: LanguagePackageUploadUrlAssetType
  }
): Promise<LanguagePackageUploadUrlResponse> {
  checkToken(token)
  return apiRequest<LanguagePackageUploadUrlResponse>(
    "/api/language-packages/upload-url",
    {
      method: "POST",
      body: {
        fileName: params.fileName,
        fileType: params.fileType,
        ...(params.assetType && { assetType: params.assetType }),
      },
      token,
    }
  )
}

export type UploadedLanguageFileMeta = {
  fileUrl: string
  fileName: string
  fileType: string
  fileSize: number
}

export async function uploadLanguagePackageVideoFile(
  token: string | null,
  file: File
): Promise<UploadedLanguageFileMeta> {
  const fileName = file.name
  const fileType = file.type || "application/octet-stream"
  const { uploadUrl, fileUrl } = await getLanguagePackageUploadUrl(token, {
    fileName,
    fileType,
    assetType: "video",
  })
  await uploadFileToPresignedUrl(uploadUrl, file)
  return {
    fileUrl,
    fileName,
    fileType,
    fileSize: file.size,
  }
}

export async function uploadLanguagePackageThumbnailFile(
  token: string | null,
  file: File
): Promise<UploadedLanguageFileMeta> {
  const fileName = file.name
  const fileType = file.type || "application/octet-stream"
  const { uploadUrl, fileUrl } = await getLanguagePackageUploadUrl(token, {
    fileName,
    fileType,
    assetType: "thumbnail",
  })
  await uploadFileToPresignedUrl(uploadUrl, file)
  return {
    fileUrl,
    fileName,
    fileType,
    fileSize: file.size,
  }
}

export async function createLanguagePackage(
  token: string | null,
  body: CreateLanguagePackageBody
): Promise<{ success?: boolean; message?: string; data: LanguagePackage }> {
  checkToken(token)
  const res = await apiRequest<{
    success?: boolean
    message?: string
    data?: unknown
  }>("/api/language-packages", {
    method: "POST",
    body,
    token,
  })
  const data = unwrapData<unknown>(res) ?? res.data
  if (data == null || typeof data !== "object") {
    throw new Error(
      typeof res.message === "string" ? res.message : "Create failed"
    )
  }
  return {
    success: res.success,
    message: res.message,
    data: normalizeLanguagePackage(data),
  }
}

export async function addLanguagePackageVideo(
  token: string | null,
  packageId: string,
  video: SubmitLanguageVideoInput
): Promise<{ success?: boolean; message?: string; data: LanguageVideo }> {
  checkToken(token)
  const res = await apiRequest<{
    success?: boolean
    message?: string
    data?: unknown
  }>(`/api/language-packages/${packageId}/videos`, {
    method: "POST",
    body: { video },
    token,
  })
  const raw = unwrapData<unknown>(res) ?? res.data
  if (raw == null) {
    throw new Error(
      typeof res.message === "string" ? res.message : "Add video failed"
    )
  }
  return {
    success: res.success,
    message: res.message,
    data: normalizeLanguageVideo(raw),
  }
}

export async function updateLanguagePackageName(
  token: string | null,
  packageId: string,
  body: { name: string }
): Promise<{ success?: boolean; message?: string; data: LanguagePackage }> {
  checkToken(token)
  const res = await apiRequest<{
    success?: boolean
    message?: string
    data?: unknown
  }>(`/api/language-packages/${packageId}`, {
    method: "PATCH",
    body,
    token,
  })
  const raw = unwrapData<unknown>(res) ?? res.data
  if (raw == null) {
    throw new Error(
      typeof res.message === "string" ? res.message : "Rename failed"
    )
  }
  return {
    success: res.success,
    message: res.message,
    data: normalizeLanguagePackage(raw),
  }
}

export async function getLanguagePackage(
  token: string | null,
  packageId: string
): Promise<{ success?: boolean; data: LanguagePackage }> {
  checkToken(token)
  const res = await apiRequest<{ success?: boolean; data?: unknown }>(
    `/api/language-packages/${packageId}`,
    { token }
  )
  const raw = unwrapData<unknown>(res) ?? res.data
  if (raw == null) throw new Error("Package not found")
  return { success: res.success, data: normalizeLanguagePackage(raw) }
}

export async function getLanguagePackagesByScriptId(
  token: string | null,
  scriptId: string
): Promise<{ success?: boolean; data: LanguagePackage[] }> {
  checkToken(token)
  const res = await apiRequest<{ success?: boolean; data?: unknown }>(
    `/api/language-packages/script/${scriptId}`,
    { token }
  )
  const raw = unwrapData<unknown>(res) ?? res.data
  const list = Array.isArray(raw) ? raw : []
  return {
    success: res.success,
    data: list.map((p) => normalizeLanguagePackage(p)),
  }
}

export async function getLanguagePackageVideo(
  token: string | null,
  videoId: string
): Promise<{ success?: boolean; data: LanguageVideo }> {
  checkToken(token)
  const res = await apiRequest<{ success?: boolean; data?: unknown }>(
    `/api/language-packages/videos/${videoId}`,
    { token }
  )
  const raw = unwrapData<unknown>(res) ?? res.data
  if (raw == null) throw new Error("Video not found")
  return { success: res.success, data: normalizeLanguageVideo(raw) }
}

export async function getLanguagePackageVideoVersions(
  token: string | null,
  videoId: string
): Promise<{ success?: boolean; data: unknown[] }> {
  checkToken(token)
  const res = await apiRequest<{ success?: boolean; data?: unknown }>(
    `/api/language-packages/videos/${videoId}/versions`,
    { token }
  )
  const raw = unwrapData<unknown>(res) ?? res.data
  return {
    success: res.success,
    data: Array.isArray(raw) ? raw : [],
  }
}

export async function resubmitLanguageVideoFile(
  token: string | null,
  videoId: string,
  body: ResubmitLanguageVideoBody
): Promise<{ success?: boolean; message?: string; data: LanguageVideo }> {
  checkToken(token)
  const res = await apiRequest<{
    success?: boolean
    message?: string
    data?: unknown
  }>(`/api/language-packages/videos/${videoId}/resubmit-video`, {
    method: "POST",
    body,
    token,
  })
  const raw = unwrapData<unknown>(res) ?? res.data
  if (raw == null) {
    throw new Error(
      typeof res.message === "string" ? res.message : "Resubmit failed"
    )
  }
  return {
    success: res.success,
    message: res.message,
    data: normalizeLanguageVideo(raw),
  }
}

export async function resubmitLanguageMetadata(
  token: string | null,
  videoId: string,
  body: ResubmitLanguageMetadataBody
): Promise<{ success?: boolean; message?: string; data: LanguageVideo }> {
  checkToken(token)
  const res = await apiRequest<{
    success?: boolean
    message?: string
    data?: unknown
  }>(`/api/language-packages/videos/${videoId}/resubmit-metadata`, {
    method: "POST",
    body,
    token,
  })
  const raw = unwrapData<unknown>(res) ?? res.data
  if (raw == null) {
    throw new Error(
      typeof res.message === "string" ? res.message : "Resubmit failed"
    )
  }
  return {
    success: res.success,
    message: res.message,
    data: normalizeLanguageVideo(raw),
  }
}

export async function approveLanguageVideo(
  token: string | null,
  videoId: string,
  body: ApproveLanguageVideoBody
): Promise<{ success?: boolean; message?: string; data: LanguageVideo }> {
  checkToken(token)
  const res = await apiRequest<{
    success?: boolean
    message?: string
    data?: unknown
  }>(`/api/language-packages/videos/${videoId}/approve`, {
    method: "POST",
    body: body ?? {},
    token,
  })
  const raw = unwrapData<unknown>(res) ?? res.data
  if (raw == null) {
    throw new Error(
      typeof res.message === "string" ? res.message : "Approve failed"
    )
  }
  return {
    success: res.success,
    message: res.message,
    data: normalizeLanguageVideo(raw),
  }
}

export async function rejectLanguageVideo(
  token: string | null,
  videoId: string,
  body: RejectLanguageVideoBody
): Promise<{ success?: boolean; message?: string; data: LanguageVideo }> {
  checkToken(token)
  const res = await apiRequest<{
    success?: boolean
    message?: string
    data?: unknown
  }>(`/api/language-packages/videos/${videoId}/reject`, {
    method: "POST",
    body,
    token,
  })
  const raw = unwrapData<unknown>(res) ?? res.data
  if (raw == null) {
    throw new Error(
      typeof res.message === "string" ? res.message : "Reject failed"
    )
  }
  return {
    success: res.success,
    message: res.message,
    data: normalizeLanguageVideo(raw),
  }
}

export async function reviewLanguageThumbnail(
  token: string | null,
  thumbnailId: string,
  body: ReviewLanguageThumbnailBody
): Promise<{ success?: boolean; message?: string; data?: unknown }> {
  checkToken(token)
  return apiRequest(`/api/language-packages/thumbnails/${thumbnailId}/review`, {
    method: "PATCH",
    body,
    token,
  })
}

export async function withdrawLanguageVideo(
  token: string | null,
  videoId: string
): Promise<{ success?: boolean; message?: string; data: LanguageVideo }> {
  checkToken(token)
  const res = await apiRequest<{
    success?: boolean
    message?: string
    data?: unknown
  }>(`/api/language-packages/videos/${videoId}/withdraw`, {
    method: "PATCH",
    token,
  })
  const raw = unwrapData<unknown>(res) ?? res.data
  if (raw == null) {
    throw new Error(
      typeof res.message === "string" ? res.message : "Withdraw failed"
    )
  }
  return {
    success: res.success,
    message: res.message,
    data: normalizeLanguageVideo(raw),
  }
}

function extractLangCommentsArray(res: Record<string, unknown>): unknown[] {
  const top = res.comments
  if (Array.isArray(top)) return top
  const inner = unwrapData<Record<string, unknown>>(res)
  if (inner && Array.isArray(inner.comments)) return inner.comments
  return []
}

/** GET /api/language-packages/videos/:videoId/comments */
export async function getLanguageVideoComments(
  token: string | null,
  videoId: string
): Promise<VideoComment[]> {
  checkToken(token)
  const res = await apiRequest<Record<string, unknown>>(
    `/api/language-packages/videos/${videoId}/comments`,
    { token }
  )
  return filterVideoCommentsWithTimestamp(
    extractLangCommentsArray(res).map((c) =>
      normalizeVideoComment(c as Record<string, unknown>)
    )
  )
}

/** POST /api/language-packages/videos/:videoId/comments — timestamp + `currentVersion`. */
export async function addLanguageVideoComment(
  token: string | null,
  videoId: string,
  body: { content: string; timestampSeconds: number; assetVersion: number }
): Promise<{ success: boolean; comment: VideoComment }> {
  checkToken(token)
  const content = body.content.trim()
  if (!content) throw new Error("Comment cannot be empty")
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
    content,
    timestampSeconds: ts,
    assetVersion: Math.trunc(av),
  }
  const res = await apiRequest<Record<string, unknown>>(
    `/api/language-packages/videos/${videoId}/comments`,
    { method: "POST", body: payload, token }
  )
  const inner = unwrapData<Record<string, unknown>>(res) ?? res
  const raw = (inner.comment ?? res.comment) as Record<string, unknown> | undefined
  return {
    success: Boolean(res.success ?? true),
    comment: ensureVideoCommentAssetVersion(
      normalizeVideoComment(raw ?? {}),
      payload.assetVersion
    ),
  }
}

function firstNonEmptyVideoList(
  ...candidates: (unknown[] | undefined | null)[]
): unknown[] {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c
  }
  return []
}

export async function getLanguagePackageQueue(
  token: string | null
): Promise<LanguagePackageQueueResponse> {
  checkToken(token)
  const res = await apiRequest<{
    success?: boolean
    total?: number
    data?: unknown
    videos?: unknown[]
  }>("/api/language-packages/queue", { token })
  const fromData = Array.isArray(res.data) ? res.data : []
  const rawVideos = firstNonEmptyVideoList(fromData, res.videos)
  const videos = rawVideos.map((v) => normalizeLanguageVideo(v))
  return {
    success: res.success,
    total: res.total ?? videos.length,
    videos,
  }
}

export async function getLanguagePackageStats(
  token: string | null
): Promise<LanguagePackageStatsResponse> {
  checkToken(token)
  return apiRequest<LanguagePackageStatsResponse>(
    "/api/language-packages/stats",
    { token }
  )
}
