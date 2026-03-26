/**
 * Build POST /api/packages body from an existing package (e.g. DRAFT after withdraw)
 * using stored asset URLs — no re-upload. Phase 6 Postman shape.
 */

import { thumbnailsForVideo, videoAssets } from "@/lib/package-ui"
import type {
  FinalPackage,
  PackageAsset,
  SubmitPackageBody,
  SubmitPackageThumbnailInput,
  SubmitPackageVideoInput,
} from "@/types/package"

function mapThumbnails(asset: PackageAsset): SubmitPackageThumbnailInput[] {
  return thumbnailsForVideo(asset).map((t) => ({
    fileUrl: t.fileUrl,
    fileName: t.fileName,
    fileType: t.fileType ?? undefined,
    fileSize: t.fileSize ?? undefined,
  }))
}

function tagsForVideo(v: PackageAsset, pkg: FinalPackage): string[] {
  if (v.tags?.length) return [...v.tags]
  if (pkg.tags?.length) return [...pkg.tags]
  return []
}

function mapVideo(
  v: PackageAsset,
  pkg: FinalPackage,
  fallbackTitle: string
): SubmitPackageVideoInput | null {
  if (!v.fileUrl?.trim() || !v.fileName?.trim()) return null
  const thumbs = mapThumbnails(v)
  if (thumbs.length === 0) return null
  const tags = tagsForVideo(v, pkg)
  if (tags.length === 0) return null
  return {
    type: v.type as "LONG_FORM" | "SHORT_FORM",
    fileUrl: v.fileUrl,
    fileName: v.fileName,
    fileType: v.fileType ?? "video/mp4",
    fileSize: v.fileSize ?? 0,
    order: v.order ?? 1,
    title: (v.title?.trim() || fallbackTitle || "Untitled").trim(),
    description: (v.description?.trim() ?? "").trim(),
    tags,
    thumbnails: thumbs,
  }
}

/**
 * Returns null if long-form, at least one short-form, URLs, and per-video thumbnails are missing.
 */
export function buildSubmitPackageBodyFromPackage(
  pkg: FinalPackage
): SubmitPackageBody | null {
  const ordered = [...videoAssets(pkg)].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  )
  const long = ordered.find((v) => v.type === "LONG_FORM")
  const shorts = ordered.filter((v) => v.type === "SHORT_FORM")
  if (!long || shorts.length === 0) return null

  const nameBase = (pkg.name ?? pkg.title ?? long.title ?? "").trim()
  const longInput = mapVideo(long, pkg, nameBase || "Package")
  if (!longInput) return null
  const shortInputs: SubmitPackageVideoInput[] = []
  for (const s of shorts) {
    const m = mapVideo(s, pkg, nameBase || "Short video")
    if (!m) return null
    shortInputs.push(m)
  }

  const name = nameBase || longInput.title

  return {
    scriptId: pkg.scriptId,
    name,
    videos: [longInput, ...shortInputs],
  }
}
