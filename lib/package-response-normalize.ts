/**
 * Coerce Phase 6 package / video payloads (camelCase or snake_case).
 */

import { videoAssetToPackageAsset } from "@/lib/package-video-helpers"
import type {
  FinalPackage,
  PackageAsset,
  PackageThumbnailRecord,
  PackageTrackStatus,
  PackageVideo,
  PackageVideoAsset,
  PackageVideoStatus,
  ThumbnailReviewStatus,
} from "@/types/package"

const TRACK_STATUSES: PackageTrackStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
]

const VIDEO_STATUSES: PackageVideoStatus[] = [
  "MEDICAL_REVIEW",
  "BRAND_VIDEO_REVIEW",
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

function coerceTrackStatus(raw: unknown): PackageTrackStatus {
  const s = normalizeEnumToken(raw)
  if (TRACK_STATUSES.includes(s as PackageTrackStatus))
    return s as PackageTrackStatus
  return "PENDING"
}

function coerceVideoStatus(raw: unknown): PackageVideoStatus {
  let s = normalizeEnumToken(raw)
  if (s === "BRAND_REVIEW") s = "BRAND_VIDEO_REVIEW"
  if (s === "APPROVER_REVIEW") s = "AWAITING_APPROVER"
  if (VIDEO_STATUSES.includes(s as PackageVideoStatus))
    return s as PackageVideoStatus
  return "MEDICAL_REVIEW"
}

function coerceThumbStatus(raw: unknown): ThumbnailReviewStatus {
  const s = normalizeEnumToken(raw)
  if (s === "APPROVED" || s === "REJECTED" || s === "PENDING")
    return s as ThumbnailReviewStatus
  return "PENDING"
}

function normalizeThumbnailRecord(t: unknown): PackageThumbnailRecord | null {
  if (!t || typeof t !== "object") return null
  const x = t as Record<string, unknown>
  const id = String(x.id ?? "")
  if (!id) return null
  return {
    id,
    assetId: String(x.assetId ?? x.asset_id ?? ""),
    fileUrl: String(x.fileUrl ?? x.file_url ?? ""),
    fileName: String(x.fileName ?? x.file_name ?? ""),
    fileType: (x.fileType ?? x.file_type) as string | null | undefined,
    fileSize: (x.fileSize ?? x.file_size) as number | null | undefined,
    status: coerceThumbStatus(x.status),
    comment: (x.comment as string | null) ?? null,
    version: (x.version as number) ?? undefined,
    createdAt: (x.createdAt ?? x.created_at) as string | undefined,
  }
}

function normalizeAssetVideo(a: unknown): PackageVideoAsset | null {
  if (!a || typeof a !== "object") return null
  const x = a as Record<string, unknown>
  const id = String(x.id ?? "")
  if (!id) return null
  const rawThumbs = x.thumbnails
  let thumbnails: PackageVideoAsset["thumbnails"] = []
  if (Array.isArray(rawThumbs)) {
    thumbnails = rawThumbs
      .map((row) => normalizeThumbnailRecord(row))
      .filter(Boolean) as PackageThumbnailRecord[]
  }
  return {
    id,
    packageVideoId: String(x.packageVideoId ?? x.package_video_id ?? "") || undefined,
    type: (normalizeEnumToken(x.type) === "SHORT_FORM"
      ? "SHORT_FORM"
      : "LONG_FORM") as "LONG_FORM" | "SHORT_FORM",
    fileUrl: String(x.fileUrl ?? x.file_url ?? ""),
    fileName: String(x.fileName ?? x.file_name ?? ""),
    fileType: (x.fileType ?? x.file_type) as string | null | undefined,
    fileSize: (x.fileSize ?? x.file_size) as number | null | undefined,
    order: (x.order as number) ?? null,
    version: Number(x.version ?? 1),
    createdAt: (x.createdAt ?? x.created_at) as string | undefined,
    title: (x.title as string | null) ?? null,
    description: (x.description as string | null) ?? null,
    tags: (x.tags as string[] | null) ?? null,
    thumbnails,
  }
}

/**
 * Some API responses use `currentAsset` + `previousAssets` instead of a flat
 * `assets` array. The UI always resolves the active file via
 * `assets.find(version === currentVersion)`.
 */
function mergeVideoAssetsFromBackendShape(
  fromAssetsArray: PackageVideoAsset[],
  x: Record<string, unknown>
): PackageVideoAsset[] {
  const byId = new Map<string, PackageVideoAsset>()
  for (const a of fromAssetsArray) {
    if (a?.id) byId.set(a.id, a)
  }
  const prevRaw = x.previousAssets ?? x.previous_assets
  if (Array.isArray(prevRaw)) {
    for (const row of prevRaw) {
      const a = normalizeAssetVideo(row)
      if (a?.id) byId.set(a.id, a)
    }
  }
  const curRaw = x.currentAsset ?? x.current_asset
  if (curRaw) {
    const cur = normalizeAssetVideo(curRaw)
    if (cur?.id) byId.set(cur.id, cur)
  }
  if (byId.size === 0) return fromAssetsArray
  return [...byId.values()].sort(
    (a, b) => a.version - b.version || a.id.localeCompare(b.id)
  )
}

export function normalizePackageVideo(v: unknown): PackageVideo {
  if (!v || typeof v !== "object") {
    return v as PackageVideo
  }
  const x = v as Record<string, unknown>
  const assetsRaw = x.assets
  const fromArray: PackageVideoAsset[] = Array.isArray(assetsRaw)
    ? (assetsRaw.map((a) => normalizeAssetVideo(a)).filter(Boolean) as PackageVideoAsset[])
    : []
  const assets = mergeVideoAssetsFromBackendShape(fromArray, x)

  const nestedPkg = x.package as Record<string, unknown> | undefined
  const script = x.script as FinalPackage["script"] | undefined
  const sid =
    (x.scriptId as string) ??
    (x.script_id as string) ??
    (nestedPkg?.scriptId as string) ??
    (nestedPkg?.script_id as string)

  return {
    id: String(x.id ?? ""),
    packageId: String(x.packageId ?? x.package_id ?? nestedPkg?.id ?? ""),
    type: (normalizeEnumToken(x.type) === "SHORT_FORM"
      ? "SHORT_FORM"
      : "LONG_FORM") as "LONG_FORM" | "SHORT_FORM",
    status: coerceVideoStatus(x.status),
    videoTrackStatus: coerceTrackStatus(
      x.videoTrackStatus ?? x.video_track_status
    ),
    metadataTrackStatus: coerceTrackStatus(
      x.metadataTrackStatus ?? x.metadata_track_status
    ),
    currentVersion: Number(x.currentVersion ?? x.current_version ?? 1),
    assets,
    reviews: (x.reviews as PackageVideo["reviews"]) ?? undefined,
    uploadedById: (x.uploadedById ?? x.uploaded_by_id) as string | undefined,
    createdAt: (x.createdAt ?? x.created_at) as string | undefined,
    updatedAt: (x.updatedAt ?? x.updated_at) as string | undefined,
    scriptId: sid,
    script,
    package: nestedPkg
      ? {
          id: String(nestedPkg.id ?? ""),
          name: (nestedPkg.name as string) ?? undefined,
          scriptId: (nestedPkg.scriptId ?? nestedPkg.script_id) as string | undefined,
        }
      : undefined,
  }
}

function flattenLegacyCurrentAssets(videos: PackageVideo[]): PackageAsset[] {
  const out: PackageAsset[] = []
  for (const v of videos) {
    const a = v.assets.find((x) => x.version === v.currentVersion)
    if (a) out.push(videoAssetToPackageAsset(a))
  }
  return out
}

/**
 * Normalizes a package payload. **Phase 6:** workflow is per video — use each
 * `videos[i].status`, `videoTrackStatus`, `metadataTrackStatus`, and
 * `currentVersion` for logic. Top-level `status` / track fields / `version` are
 * legacy mirrors of `videos[0]` only; do not use them to gate other deliverables.
 */
export function normalizeFinalPackage(pkg: unknown): FinalPackage {
  if (!pkg || typeof pkg !== "object") {
    return pkg as FinalPackage
  }
  const p = pkg as Record<string, unknown>
  const rawVideos = p.videos
  let videos: PackageVideo[] = []
  if (Array.isArray(rawVideos)) {
    videos = rawVideos.map((v) => normalizePackageVideo(v))
  }

  const name = (p.name as string) ?? undefined
  const scriptId = String(p.scriptId ?? p.script_id ?? "")
  const script = p.script as FinalPackage["script"] | undefined

  const rawLegacy = p as unknown as FinalPackage
  const base: FinalPackage = {
    ...rawLegacy,
    id: String(p.id ?? ""),
    scriptId,
    name,
    title: (p.title as string) ?? name,
    description: (p.description as string) ?? undefined,
    tags: (p.tags as string[]) ?? undefined,
    language: (p.language as string) ?? undefined,
    stage: (p.stage as string) ?? undefined,
    videos,
    createdAt: String(p.createdAt ?? p.created_at ?? ""),
    updatedAt: String(p.updatedAt ?? p.updated_at ?? ""),
    uploadedBy: p.uploadedBy as FinalPackage["uploadedBy"],
    script,
    tat: (p.tat as FinalPackage["tat"]) ?? null,
    currentAssets:
      videos.length > 0
        ? flattenLegacyCurrentAssets(videos)
        : (rawLegacy.currentAssets ?? []),
  }

  if (videos.length > 0) {
    const first = videos[0]
    base.status = first.status as FinalPackage["status"]
    base.videoTrackStatus = first.videoTrackStatus
    base.metadataTrackStatus = first.metadataTrackStatus
    base.version = first.currentVersion
  }

  return base
}
