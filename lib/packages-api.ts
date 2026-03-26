/**
 * Phase 6 — Final Package Delivery API (redesigned).
 * Postman: `postman/Phase 6 — Final Package Delivery.postman_collection.json`
 */

import { apiRequest } from "@/lib/api"
import { normalizeFinalPackage } from "@/lib/package-response-normalize"
import { uploadFileToPresignedUrl } from "@/lib/videos-api"
import type {
  ApprovePackageBody,
  FinalPackage,
  PackageMyReviewsResponse,
  PackageQueueResponse,
  PackageStatsResponse,
  PackageUploadUrlAssetType,
  PackageUploadUrlResponse,
  PackageVersionsResponse,
  RejectPackageBody,
  ResubmitMetadataBody,
  ResubmitVideosBody,
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

/** Upload a package video file (presign uses assetType `video`). */
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

/** Upload a thumbnail image (presign uses assetType `thumbnail`). */
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

export async function resubmitPackageVideos(
  token: string | null,
  packageId: string,
  body: ResubmitVideosBody
): Promise<{ success?: boolean; message?: string; package: FinalPackage }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    package: unknown
  }>(`/api/packages/${packageId}/resubmit-videos`, {
    method: "POST",
    body,
    token,
  })
  return { ...data, package: normalizeFinalPackage(data.package) }
}

export async function resubmitPackageMetadata(
  token: string | null,
  packageId: string,
  body: ResubmitMetadataBody
): Promise<{ success?: boolean; message?: string; package: FinalPackage }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    package: unknown
  }>(`/api/packages/${packageId}/resubmit-metadata`, {
    method: "POST",
    body,
    token,
  })
  return { ...data, package: normalizeFinalPackage(data.package) }
}

export async function withdrawPackage(
  token: string | null,
  packageId: string
): Promise<{ success?: boolean; message?: string; package: FinalPackage }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    package: unknown
  }>(`/api/packages/${packageId}/withdraw`, {
    method: "PATCH",
    token,
  })
  return { ...data, package: normalizeFinalPackage(data.package) }
}

export async function approvePackage(
  token: string | null,
  packageId: string,
  body: ApprovePackageBody
): Promise<{ success?: boolean; message?: string; package: FinalPackage }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    package: unknown
  }>(`/api/packages/${packageId}/approve`, {
    method: "POST",
    body,
    token,
  })
  return { ...data, package: normalizeFinalPackage(data.package) }
}

export async function rejectPackage(
  token: string | null,
  packageId: string,
  body: RejectPackageBody
): Promise<{ success?: boolean; message?: string; package: FinalPackage }> {
  checkToken(token)
  const data = await apiRequest<{
    success?: boolean
    message?: string
    package: unknown
  }>(`/api/packages/${packageId}/reject`, {
    method: "POST",
    body,
    token,
  })
  return { ...data, package: normalizeFinalPackage(data.package) }
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

export async function getPackageVersions(
  token: string | null,
  packageId: string
): Promise<PackageVersionsResponse> {
  checkToken(token)
  return apiRequest<PackageVersionsResponse>(
    `/api/packages/${packageId}/versions`,
    { token }
  )
}

export async function getPackageQueue(
  token: string | null
): Promise<PackageQueueResponse> {
  checkToken(token)
  const data = await apiRequest<PackageQueueResponse>(
    "/api/packages/queue",
    { token }
  )
  return {
    ...data,
    available: (data.available ?? []).map(normalizeFinalPackage),
    myReviews: (data.myReviews ?? []).map(normalizeFinalPackage),
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
  const data = await apiRequest<PackageMyReviewsResponse>(
    `/api/packages/my-reviews?${sp.toString()}`,
    { token }
  )
  return {
    ...data,
    packages: (data.packages ?? []).map(normalizeFinalPackage),
  }
}
