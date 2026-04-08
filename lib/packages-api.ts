/**
 * Phase 6 — Final Package Delivery (per-video flow).
 */

import { apiRequest } from "@/lib/api"
import {
  normalizeFinalPackage,
  normalizePackageVideo,
} from "@/lib/package-response-normalize"
import {
  filterVideoCommentsWithTimestamp,
  normalizeVideoComment,
} from "@/lib/video-comment"
import { uploadFileToPresignedUrl } from "@/lib/videos-api"
import type { VideoComment } from "@/types/video"
import type {
  AddPackageVideoBody,
  ApprovePackageVideoBody,
  FinalPackage,
  PackageMyReviewsResponse,
  PackageQueueResponse,
  PackageStatsResponse,
  PackageUploadUrlAssetType,
  PackageUploadUrlResponse,
  PackageVideo,
  PackageVideoVersionsResponse,
  RejectPackageVideoBody,
  ResubmitPackageVideoBody,
  ResubmitPackageVideoMetadataBody,
  ReviewThumbnailBody,
  SubmitPackageBody,
} from "@/types/package"

function checkToken(token: string | null): asserts token is string {
  if (!token) throw new Error("Not authenticated")
}

export async function getPackageUploadUrl(
  token: string | null,
  params: {
    fileName: string
    fileType: string
    assetType: PackageUploadUrlAssetType
  }
): Promise<PackageUploadUrlResponse> {
  checkToken(token)
  return apiRequest<PackageUploadUrlResponse>("/api/packages/upload-url", {
    method: "POST",
    body: params,
    token,
  })
}

export type UploadedPackageFileMeta = {
  fileUrl: string
  fileName: string
  fileType: string
  fileSize: number
}

export async function uploadPackageVideoFile(
  token: string | null,
  file: File
): Promise<UploadedPackageFileMeta> {
  const fileName = file.name
  const fileType = file.type || "application/octet-stream"
  const { uploadUrl, fileUrl } = await getPackageUploadUrl(token, {
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

export async function uploadPackageThumbnailFile(
  token: string | null,
  file: File
): Promise<UploadedPackageFileMeta> {
  const fileName = file.name
  const fileType = file.type || "application/octet-stream"
  const { uploadUrl, fileUrl } = await getPackageUploadUrl(token, {
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

export async function submitPackage(
  token: string | null,
  body: SubmitPackageBody
): Promise<{ success?: boolean; message?: string; package: FinalPackage }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    package: unknown
  }>("/api/packages", {
    method: "POST",
    body,
    token,
  })
  return { ...data, package: normalizeFinalPackage(data.package) }
}

export async function addPackageVideo(
  token: string | null,
  packageId: string,
  body: AddPackageVideoBody
): Promise<{ success?: boolean; message?: string; video: PackageVideo }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    video?: unknown
    videos?: unknown[]
  }>(`/api/packages/${packageId}/videos`, {
    method: "POST",
    // Backend payload shape has been inconsistent across environments:
    // some deployments validate `video` while others validate `videos`.
    // Sending both keeps the frontend compatible without backend changes.
    body: { video: body, videos: [body] },
    token,
  })
  const rawVideo =
    data.video ?? (Array.isArray(data.videos) ? data.videos[0] : undefined)
  if (rawVideo == null) {
    throw new Error(
      typeof data.message === "string" ? data.message : "Add video failed"
    )
  }
  return {
    success: data.success,
    message: data.message,
    video: normalizePackageVideo(rawVideo),
  }
}

export async function updatePackageName(
  token: string | null,
  packageId: string,
  body: { name: string }
): Promise<{ success?: boolean; message?: string; package: FinalPackage }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    package: unknown
  }>(`/api/packages/${packageId}`, {
    method: "PATCH",
    body,
    token,
  })
  return { ...data, package: normalizeFinalPackage(data.package) }
}

export async function resubmitPackageVideoFile(
  token: string | null,
  videoId: string,
  body: ResubmitPackageVideoBody
): Promise<{ success?: boolean; message?: string; video: PackageVideo }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    video: unknown
  }>(`/api/packages/videos/${videoId}/resubmit-video`, {
    method: "POST",
    body,
    token,
  })
  return {
    success: data.success,
    message: data.message,
    video: normalizePackageVideo(data.video),
  }
}

export async function resubmitPackageMetadata(
  token: string | null,
  videoId: string,
  body: ResubmitPackageVideoMetadataBody
): Promise<{ success?: boolean; message?: string; video: PackageVideo }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    video: unknown
  }>(`/api/packages/videos/${videoId}/resubmit-metadata`, {
    method: "POST",
    body,
    token,
  })
  return {
    success: data.success,
    message: data.message,
    video: normalizePackageVideo(data.video),
  }
}

export async function withdrawPackageVideo(
  token: string | null,
  videoId: string
): Promise<{ success?: boolean; message?: string; video: PackageVideo }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    video: unknown
  }>(`/api/packages/videos/${videoId}/withdraw`, {
    method: "PATCH",
    token,
  })
  return {
    success: data.success,
    message: data.message,
    video: normalizePackageVideo(data.video),
  }
}

export async function approvePackageVideo(
  token: string | null,
  videoId: string,
  body: ApprovePackageVideoBody
): Promise<{ success?: boolean; message?: string; video: PackageVideo }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    video: unknown
  }>(`/api/packages/videos/${videoId}/approve`, {
    method: "POST",
    body,
    token,
  })
  return {
    success: data.success,
    message: data.message,
    video: normalizePackageVideo(data.video),
  }
}

export async function rejectPackageVideo(
  token: string | null,
  videoId: string,
  body: RejectPackageVideoBody
): Promise<{ success?: boolean; message?: string; video: PackageVideo }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    video: unknown
  }>(`/api/packages/videos/${videoId}/reject`, {
    method: "POST",
    body,
    token,
  })
  return {
    success: data.success,
    message: data.message,
    video: normalizePackageVideo(data.video),
  }
}

export async function reviewPackageThumbnail(
  token: string | null,
  thumbnailId: string,
  body: ReviewThumbnailBody
): Promise<{ success?: boolean; thumbnail?: unknown; message?: string }> {
  checkToken(token)
  return apiRequest<{
    success?: boolean
    thumbnail?: unknown
    message?: string
  }>(`/api/packages/thumbnails/${thumbnailId}/review`, {
    method: "PATCH",
    body,
    token,
  })
}

export async function getPackage(
  token: string | null,
  packageId: string
): Promise<{ success?: boolean; package: FinalPackage }> {
  checkToken(token)
  const data = await apiRequest<{ success?: boolean; package: unknown }>(
    `/api/packages/${packageId}`,
    { token }
  )
  return { ...data, package: normalizeFinalPackage(data.package) }
}

export async function getPackageVideo(
  token: string | null,
  videoId: string
): Promise<{ success?: boolean; video: PackageVideo }> {
  checkToken(token)
  const data = await apiRequest<{ success?: boolean; video: unknown }>(
    `/api/packages/videos/${videoId}`,
    { token }
  )
  return { ...data, video: normalizePackageVideo(data.video) }
}

export async function getPackageByScriptId(
  token: string | null,
  scriptId: string
): Promise<{ success?: boolean; package: FinalPackage }> {
  checkToken(token)
  const data = await apiRequest<{ success?: boolean; package: unknown }>(
    `/api/packages/script/${scriptId}`,
    { token }
  )
  return { ...data, package: normalizeFinalPackage(data.package) }
}

export async function getPackageVideoVersions(
  token: string | null,
  videoId: string
): Promise<PackageVideoVersionsResponse> {
  checkToken(token)
  return apiRequest<PackageVideoVersionsResponse>(
    `/api/packages/videos/${videoId}/versions`,
    { token }
  )
}

function extractPackageCommentsArray(data: Record<string, unknown>): unknown[] {
  const direct = data.comments
  if (Array.isArray(direct)) return direct
  const nested = data.data
  if (nested && typeof nested === "object" && "comments" in nested) {
    const c = (nested as { comments?: unknown }).comments
    if (Array.isArray(c)) return c
  }
  return []
}

/** GET /api/packages/videos/:videoId/comments */
export async function getPackageVideoComments(
  token: string | null,
  videoId: string
): Promise<VideoComment[]> {
  checkToken(token)
  const data = await apiRequest<Record<string, unknown>>(
    `/api/packages/videos/${videoId}/comments`,
    { token }
  )
  return filterVideoCommentsWithTimestamp(
    extractPackageCommentsArray(data).map((c) =>
      normalizeVideoComment(c as Record<string, unknown>)
    )
  )
}

/** POST /api/packages/videos/:videoId/comments — timestamp + `currentVersion`. */
export async function addPackageVideoComment(
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
    `/api/packages/videos/${videoId}/comments`,
    { method: "POST", body: payload, token }
  )
  const inner =
    res.data && typeof res.data === "object"
      ? (res.data as Record<string, unknown>)
      : res
  const raw = (inner.comment ?? res.comment) as Record<string, unknown> | undefined
  return {
    success: Boolean(res.success ?? true),
    comment: normalizeVideoComment(raw ?? {}),
  }
}

/** Prefer first non-empty array so `videos: []` does not hide `packages[].videos`. */
function firstNonEmptyVideoList(
  ...candidates: (unknown[] | undefined | null)[]
): unknown[] {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c
  }
  return []
}

function dedupePackageQueueVideos(videos: PackageVideo[]): PackageVideo[] {
  const byId = new Map<string, PackageVideo>()
  for (const v of videos) {
    if (!v.id || byId.has(v.id)) continue
    byId.set(v.id, v)
  }
  return [...byId.values()]
}

export async function getPackageQueue(
  token: string | null
): Promise<PackageQueueResponse> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    total?: number
    videos?: unknown[]
    packageVideos?: unknown[]
    packages?: unknown[]
    data?: { videos?: unknown[]; total?: number }
  }>("/api/packages/queue", { token })
  const rawVideosFromPackages = Array.isArray(data.packages)
    ? data.packages.flatMap((p) => {
        if (!p || typeof p !== "object") return []
        const vids = (p as { videos?: unknown[] }).videos
        return Array.isArray(vids) ? vids : []
      })
    : []
  const rawVideos = firstNonEmptyVideoList(
    data.videos,
    data.packageVideos,
    data.data?.videos,
    rawVideosFromPackages
  )
  const normalized = rawVideos.map((v) => normalizePackageVideo(v))
  const videos = dedupePackageQueueVideos(normalized)
  return {
    success: data.success,
    total: data.total ?? data.data?.total ?? videos.length,
    videos,
  }
}

export async function getPackageStats(
  token: string | null
): Promise<PackageStatsResponse> {
  checkToken(token)
  return apiRequest<PackageStatsResponse>("/api/packages/stats", { token })
}

export async function getPackageMyReviews(
  token: string | null,
  params: { decision: "APPROVED" | "REJECTED"; page?: number; limit?: number }
): Promise<PackageMyReviewsResponse> {
  checkToken(token)
  const sp = new URLSearchParams({ decision: params.decision })
  if (params.page != null) sp.set("page", String(params.page))
  if (params.limit != null) sp.set("limit", String(params.limit))
  const data = await apiRequest<{
    success?: boolean
    total?: number
    page?: number
    limit?: number
    totalPages?: number
    videos?: unknown[]
  }>(`/api/packages/my-reviews?${sp.toString()}`, { token })
  return {
    success: data.success,
    total: data.total ?? 0,
    page: data.page ?? 1,
    limit: data.limit ?? 20,
    totalPages: data.totalPages,
    videos: (data.videos ?? []).map((v) => normalizePackageVideo(v)),
  }
}
