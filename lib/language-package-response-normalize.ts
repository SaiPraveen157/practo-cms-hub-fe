/**
 * Coerce Phase 7 language package payloads (camelCase or snake_case).
 */

import type {
  LanguagePackage,
  LanguageThumbnailRecord,
  LanguageVideo,
  LanguageVideoAsset,
  LanguageVideoReview,
  LanguageVideoStatus,
  PackageLanguage,
} from "@/types/language-package"
import type { PackageScriptRef, PackageUserRef } from "@/types/package"

const VIDEO_STATUSES: LanguageVideoStatus[] = [
  "BRAND_REVIEW",
  "AWAITING_APPROVER",
  "APPROVED",
  "WITHDRAWN",
]

function normalizeEnumToken(raw: unknown): string {
  if (raw == null) return ""
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
}

function coerceVideoStatus(raw: unknown): LanguageVideoStatus {
  const s = normalizeEnumToken(raw)
  if (VIDEO_STATUSES.includes(s as LanguageVideoStatus))
    return s as LanguageVideoStatus
  return "BRAND_REVIEW"
}

function coerceThumbStatus(
  raw: unknown
): LanguageThumbnailRecord["status"] {
  const s = normalizeEnumToken(raw)
  if (s === "APPROVED" || s === "REJECTED" || s === "PENDING")
    return s as LanguageThumbnailRecord["status"]
  return "PENDING"
}

function normalizeLanguageThumbnail(t: unknown): LanguageThumbnailRecord | null {
  if (!t || typeof t !== "object") return null
  const x = t as Record<string, unknown>
  const id = String(x.id ?? "")
  if (!id) return null
  return {
    id,
    assetId: String(x.assetId ?? x.asset_id ?? "") || undefined,
    fileUrl: String(x.fileUrl ?? x.file_url ?? ""),
    fileName: String(x.fileName ?? x.file_name ?? ""),
    fileType: (x.fileType ?? x.file_type) as string | null | undefined,
    fileSize: (x.fileSize ?? x.file_size) as number | string | null | undefined,
    status: coerceThumbStatus(x.status),
    comment: (x.comment as string | null) ?? null,
    version: (x.version as number) ?? undefined,
    createdAt: (x.createdAt ?? x.created_at) as string | undefined,
  }
}

function normalizeLanguageAsset(a: unknown): LanguageVideoAsset | null {
  if (!a || typeof a !== "object") return null
  const x = a as Record<string, unknown>
  const id = String(x.id ?? "")
  if (!id) return null
  const rawThumbs = x.thumbnails
  let thumbnails: LanguageVideoAsset["thumbnails"] = []
  if (Array.isArray(rawThumbs)) {
    thumbnails = rawThumbs
      .map((row) => normalizeLanguageThumbnail(row))
      .filter(Boolean) as LanguageThumbnailRecord[]
  }
  return {
    id,
    languageVideoId:
      String(x.languageVideoId ?? x.language_video_id ?? "") || undefined,
    fileUrl: String(x.fileUrl ?? x.file_url ?? ""),
    fileName: String(x.fileName ?? x.file_name ?? ""),
    fileType: (x.fileType ?? x.file_type) as string | null | undefined,
    fileSize: (x.fileSize ?? x.file_size) as number | string | null | undefined,
    version: Number(x.version ?? 1),
    title: (x.title as string | null) ?? null,
    description: (x.description as string | null) ?? null,
    tags: (x.tags as string[] | null) ?? null,
    thumbnails,
    createdAt: (x.createdAt ?? x.created_at) as string | undefined,
  }
}

function normalizeLanguageReview(r: unknown): LanguageVideoReview | null {
  if (!r || typeof r !== "object") return null
  const x = r as Record<string, unknown>
  const id = String(x.id ?? "")
  if (!id) return null
  const rawItems = x.itemFeedback ?? x.item_feedback
  let itemFeedback: LanguageVideoReview["itemFeedback"]
  if (Array.isArray(rawItems)) {
    itemFeedback = rawItems
      .map((row) => {
        if (!row || typeof row !== "object") return null
        const it = row as Record<string, unknown>
        return {
          field: String(it.field ?? ""),
          hasIssue: Boolean(it.hasIssue ?? it.has_issue),
          comment: (it.comment as string) ?? undefined,
          videoAssetId: String(it.videoAssetId ?? it.video_asset_id ?? "") || undefined,
          thumbnailId: String(it.thumbnailId ?? it.thumbnail_id ?? "") || undefined,
        }
      })
      .filter(Boolean) as LanguageVideoReview["itemFeedback"]
  }
  return {
    id,
    decision: String(x.decision ?? ""),
    reviewerType: String(x.reviewerType ?? x.reviewer_type ?? "") || undefined,
    overallComments:
      (x.overallComments ?? x.overall_comments) as string | null | undefined,
    reviewedAt: String(x.reviewedAt ?? x.reviewed_at ?? ""),
    itemFeedback,
  }
}

function mergeAssetsFromShape(video: Record<string, unknown>): unknown[] {
  const assets = video.assets
  if (Array.isArray(assets) && assets.length > 0) return assets
  const cur = video.currentAsset ?? video.current_asset
  const prev = video.previousAssets ?? video.previous_assets
  const out: unknown[] = []
  if (cur && typeof cur === "object") out.push(cur)
  if (Array.isArray(prev)) out.push(...prev)
  return out
}

export function normalizeLanguageVideo(raw: unknown): LanguageVideo {
  if (!raw || typeof raw !== "object") {
    return {
      id: "",
      packageId: "",
      status: "BRAND_REVIEW",
      currentVersion: 1,
      assets: [],
    }
  }
  const x = raw as Record<string, unknown>
  const rawAssets = mergeAssetsFromShape(x)
  const assets = rawAssets
    .map((a) => normalizeLanguageAsset(a))
    .filter(Boolean) as LanguageVideoAsset[]
  const rawReviews = x.reviews
  const reviews = Array.isArray(rawReviews)
    ? (rawReviews
        .map((r) => normalizeLanguageReview(r))
        .filter(Boolean) as LanguageVideoReview[])
    : undefined
  let pkg: LanguageVideo["package"]
  const p = x.package
  if (p && typeof p === "object") {
    const pr = p as Record<string, unknown>
    pkg = {
      id: String(pr.id ?? ""),
      name: (pr.name as string) ?? undefined,
      language: (pr.language as string) ?? undefined,
      scriptId: String(pr.scriptId ?? pr.script_id ?? "") || undefined,
    }
  }
  return {
    id: String(x.id ?? ""),
    packageId: String(x.packageId ?? x.package_id ?? ""),
    status: coerceVideoStatus(x.status),
    currentVersion: Number(x.currentVersion ?? x.current_version ?? 1),
    assets,
    reviews,
    uploadedById: String(x.uploadedById ?? x.uploaded_by_id ?? "") || null,
    createdAt: (x.createdAt ?? x.created_at) as string | undefined,
    updatedAt: (x.updatedAt ?? x.updated_at) as string | undefined,
    scriptId: String(x.scriptId ?? x.script_id ?? "") || undefined,
    package: pkg,
  }
}

function normalizeScriptRef(raw: unknown): PackageScriptRef | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const s = raw as Record<string, unknown>
  const id = String(s.id ?? "")
  if (!id) return undefined
  return {
    id,
    title: String(s.title ?? ""),
    status: String(s.status ?? ""),
    version: (s.version as number) ?? undefined,
  }
}

function normalizeUploadedBy(raw: unknown): PackageUserRef | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const u = raw as Record<string, unknown>
  const id = String(u.id ?? "")
  if (!id) return undefined
  return {
    id,
    firstName: String(u.firstName ?? u.first_name ?? ""),
    lastName: String(u.lastName ?? u.last_name ?? ""),
    role: (u.role as string) ?? undefined,
  }
}

export function normalizeLanguagePackage(raw: unknown): LanguagePackage {
  if (!raw || typeof raw !== "object") {
    return {
      id: "",
      scriptId: "",
      name: "",
      language: "HINDI",
      videos: [],
      createdAt: "",
      updatedAt: "",
    }
  }
  const x = raw as Record<string, unknown>
  const rawVideos = x.videos
  const videos = Array.isArray(rawVideos)
    ? rawVideos.map((v) => normalizeLanguageVideo(v))
    : []
  return {
    id: String(x.id ?? ""),
    scriptId: String(x.scriptId ?? x.script_id ?? ""),
    name: String(x.name ?? ""),
    language: (normalizeEnumToken(x.language) || "HINDI") as PackageLanguage,
    stage: (x.stage as string) ?? undefined,
    videos,
    createdAt: String(x.createdAt ?? x.created_at ?? ""),
    updatedAt: String(x.updatedAt ?? x.updated_at ?? ""),
    script: normalizeScriptRef(x.script),
    uploadedBy: normalizeUploadedBy(x.uploadedBy ?? x.uploaded_by),
  }
}
