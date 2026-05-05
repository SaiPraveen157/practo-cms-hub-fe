/**
 * Phase 7 — Language packages API (`/api/language-packages`).
 */

import { apiRequest } from "@/lib/api"
import { assertDeliverableVideoFile } from "@/lib/video-file-validation"
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
import type {
  VideoComment,
  VideoTimestampVersionApis,
  VideoVersionDetailView,
  VideoVersionListEntry,
  VideoVersionsListResponse,
} from "@/types/video"
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
  assertDeliverableVideoFile(file)
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

function langNum(v: unknown): number | undefined {
  if (v == null || v === "") return undefined
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

function langUnwrapRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const d = unwrapData<Record<string, unknown>>(raw)
  if (d && typeof d === "object" && !Array.isArray(d)) return d
  return raw
}

function extractLangVersionCommentsBody(body: Record<string, unknown>): unknown[] {
  const top = body.comments
  if (Array.isArray(top)) return top
  return []
}

function pickLanguageVersionPrimaryVideo(
  body: Record<string, unknown>
): {
  fileUrl: string | null
  fileName: string | null
  fileType: string | null
  fileSize: number | null
} {
  const top = body.fileUrl ?? body.file_url
  if (typeof top === "string" && top) {
    return {
      fileUrl: top,
      fileName:
        body.fileName != null || body.file_name != null
          ? String(body.fileName ?? body.file_name)
          : null,
      fileType:
        body.fileType != null || body.file_type != null
          ? String(body.fileType ?? body.file_type)
          : null,
      fileSize: langNum(body.fileSize ?? body.file_size) ?? null,
    }
  }
  const assets = body.assets
  if (Array.isArray(assets)) {
    for (const typ of ["LONG_FORM", "SHORT_FORM"] as const) {
      for (const el of assets) {
        if (!el || typeof el !== "object") continue
        const o = el as Record<string, unknown>
        if (String(o.type ?? "").toUpperCase() !== typ) continue
        const u = o.fileUrl ?? o.file_url
        if (typeof u === "string" && u) {
          return {
            fileUrl: u,
            fileName:
              o.fileName != null || o.file_name != null
                ? String(o.fileName ?? o.file_name)
                : null,
            fileType:
              o.fileType != null || o.file_type != null
                ? String(o.fileType ?? o.file_type)
                : null,
            fileSize: langNum(o.fileSize ?? o.file_size) ?? null,
          }
        }
      }
    }
    for (const el of assets) {
      if (!el || typeof el !== "object") continue
      const o = el as Record<string, unknown>
      const ft = String(o.fileType ?? o.file_type ?? "")
      const u = o.fileUrl ?? o.file_url
      if (typeof u === "string" && u && ft.startsWith("video/")) {
        return {
          fileUrl: u,
          fileName:
            o.fileName != null || o.file_name != null
              ? String(o.fileName ?? o.file_name)
              : null,
          fileType: ft || null,
          fileSize: langNum(o.fileSize ?? o.file_size) ?? null,
        }
      }
    }
  }
  return { fileUrl: null, fileName: null, fileType: null, fileSize: null }
}

/**
 * GET /api/language-packages/videos/:videoId/versions — normalized for
 * {@link useVideoTimestampVersionView}.
 */
export async function getLanguageVideoVersionsListNormalized(
  token: string | null,
  videoId: string
): Promise<VideoVersionsListResponse> {
  checkToken(token)
  const raw = await apiRequest<Record<string, unknown>>(
    `/api/language-packages/videos/${videoId}/versions`,
    { token }
  )
  let versionsRaw: unknown[] = []
  let currentVersion = langNum(
    raw.currentVersion ?? raw.current_version
  )
  let totalVersions = langNum(raw.totalVersions ?? raw.total_versions)
  const dataField = raw.data
  if (Array.isArray(dataField)) {
    versionsRaw = dataField
  } else if (dataField && typeof dataField === "object" && !Array.isArray(dataField)) {
    const obj = dataField as Record<string, unknown>
    currentVersion ??= langNum(obj.currentVersion ?? obj.current_version)
    totalVersions ??= langNum(obj.totalVersions ?? obj.total_versions)
    if (Array.isArray(obj.versions)) versionsRaw = obj.versions as unknown[]
  } else {
    const inner = langUnwrapRecord(raw)
    currentVersion ??= langNum(inner.currentVersion ?? inner.current_version)
    totalVersions ??= langNum(inner.totalVersions ?? inner.total_versions)
    if (Array.isArray(inner.versions)) versionsRaw = inner.versions as unknown[]
  }
  if (currentVersion == null && versionsRaw.length > 0) {
    const nums = versionsRaw
      .map((el) =>
        el && typeof el === "object"
          ? langNum((el as Record<string, unknown>).version) ?? 0
          : 0
      )
      .filter((n) => n >= 1)
    if (nums.length > 0) currentVersion = Math.max(...nums)
  }
  const versions: VideoVersionListEntry[] = []
  for (const el of versionsRaw) {
    if (!el || typeof el !== "object") continue
    const item = el as Record<string, unknown>
    const v = langNum(item.version ?? item.videoVersion ?? item.video_version)
    if (v == null || v < 1) continue
    versions.push({
      version: v,
      videoId,
      status: typeof item.status === "string" ? item.status : undefined,
      commentCount: langNum(item.commentCount ?? item.comment_count),
      wasRejected: Boolean(item.wasRejected ?? item.was_rejected),
      rejectionReason:
        item.rejectionReason != null || item.rejection_reason != null
          ? String(item.rejectionReason ?? item.rejection_reason)
          : null,
      rejection:
        item.rejection != null && typeof item.rejection === "object"
          ? (item.rejection as Record<string, unknown>)
          : null,
    })
  }
  versions.sort((a, b) => b.version - a.version)
  return {
    success: Boolean(raw.success),
    currentVersion: currentVersion ?? undefined,
    totalVersions: totalVersions ?? undefined,
    versions,
  }
}

/** GET /api/language-packages/videos/:videoId/versions/:version */
export async function getLanguageVideoVersionDetail(
  token: string | null,
  videoId: string,
  version: number
): Promise<VideoVersionDetailView> {
  checkToken(token)
  if (!Number.isFinite(version) || version < 1) {
    throw new Error("version must be a positive integer")
  }
  const raw = await apiRequest<Record<string, unknown>>(
    `/api/language-packages/videos/${videoId}/versions/${Math.trunc(version)}`,
    { token }
  )
  const body = langUnwrapRecord(raw)
  const ver = langNum(body.version) ?? Math.trunc(version)
  const id = String(
    body.languageVideoId ?? body.language_video_id ?? videoId
  ).trim()
  const { fileUrl, fileName, fileType, fileSize } =
    pickLanguageVersionPrimaryVideo(body)
  const list = extractLangVersionCommentsBody(body)
  const comments: VideoComment[] = filterVideoCommentsWithTimestamp(
    list.map((c) =>
      ensureVideoCommentAssetVersion(
        normalizeVideoComment(c as Record<string, unknown>),
        ver
      )
    )
  )
  return {
    id: id || videoId,
    version: ver,
    isCurrentVersion: Boolean(body.isCurrentVersion ?? body.is_current_version),
    status: typeof body.currentStatus === "string"
      ? body.currentStatus
      : typeof body.status === "string"
        ? body.status
        : undefined,
    fileUrl,
    fileName,
    fileType,
    fileSize,
    createdAt:
      typeof body.submittedAt === "string"
        ? body.submittedAt
        : typeof body.submitted_at === "string"
          ? body.submitted_at
          : typeof body.createdAt === "string"
            ? body.createdAt
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

/** Phase 7 language package video — wire into {@link useVideoTimestampVersionView}. */
export const languageVideoTimestampVersionApis: VideoTimestampVersionApis = {
  listVersions: getLanguageVideoVersionsListNormalized,
  getVersionDetail: getLanguageVideoVersionDetail,
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
