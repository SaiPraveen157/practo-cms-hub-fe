import {
  getCurrentVideoAsset,
  packageItemFeedbackDeliverableLabel,
  packageVideosSorted,
  thumbnailsOnAsset,
  videoAssetToPackageAsset,
} from "@/lib/package-video-helpers"
import type {
  FinalPackage,
  PackageAsset,
  PackageItemFeedbackField,
  PackageStatus,
  PackageTrackStatus,
  PackageVideoStatus,
} from "@/types/package"

export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  DRAFT: "Draft",
  MEDICAL_REVIEW: "Medical review",
  BRAND_REVIEW: "Brand video review",
  BRAND_VIDEO_REVIEW: "Content/Brand review",
  APPROVER_REVIEW: "Content approver",
  AWAITING_APPROVER: "Awaiting final approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
}

export const VIDEO_STATUS_LABELS: Record<PackageVideoStatus, string> = {
  MEDICAL_REVIEW: "Medical & Brand review",
  BRAND_VIDEO_REVIEW: "Content/Brand review",
  AWAITING_APPROVER: "Awaiting final approval",
  APPROVED: "Approved",
  WITHDRAWN: "Withdrawn",
}

export const TRACK_STATUS_LABELS: Record<PackageTrackStatus, string> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected — changes required",
}

export function humanizeItemFeedbackField(
  field: PackageItemFeedbackField
): string {
  switch (field) {
    case "VIDEO":
      return "Video file"
    case "TITLE":
      return "Title"
    case "DESCRIPTION":
      return "Description"
    case "TAGS":
      return "Tags"
    case "THUMBNAIL":
      return "Thumbnail"
    default:
      return field
  }
}

export function packageStatusBadgeClass(status: PackageStatus): string {
  switch (status) {
    case "DRAFT":
      return "bg-muted text-muted-foreground"
    case "MEDICAL_REVIEW":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
    case "BRAND_REVIEW":
    case "BRAND_VIDEO_REVIEW":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
    case "APPROVER_REVIEW":
    case "AWAITING_APPROVER":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
    case "WITHDRAWN":
      return "bg-muted text-muted-foreground"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export function videoStatusBadgeClass(status: PackageVideoStatus): string {
  switch (status) {
    case "MEDICAL_REVIEW":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
    case "BRAND_VIDEO_REVIEW":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
    case "AWAITING_APPROVER":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    case "WITHDRAWN":
      return "bg-muted text-muted-foreground"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export function formatPackageDate(s: string) {
  try {
    return new Date(s).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return s
  }
}

export function videoAssets(pkg: FinalPackage): PackageAsset[] {
  const flat = pkg.currentAssets ?? []
  if (flat.length > 0) {
    return flat.filter(
      (a) => a.type === "LONG_FORM" || a.type === "SHORT_FORM"
    )
  }
  return packageVideosSorted(pkg)
    .map((v) => {
      const a = getCurrentVideoAsset(v)
      return a ? videoAssetToPackageAsset(a) : null
    })
    .filter((x): x is PackageAsset => x != null)
}

export function packageVideoAssetLabel(
  pkg: FinalPackage,
  videoAssetId: string
): string {
  return packageItemFeedbackDeliverableLabel(pkg, { videoAssetId })
}

export function trackStatusSurfaceClass(
  status: PackageTrackStatus | undefined
): string {
  switch (status) {
    case "REJECTED":
      return "border-destructive/40 bg-destructive/5"
    case "APPROVED":
      return "border-green-600/25 bg-green-500/5 dark:border-green-500/30 dark:bg-green-500/10"
    default:
      return "border-border bg-muted/30"
  }
}

export function thumbnailsForVideo(asset: PackageAsset): PackageAsset[] {
  return asset.thumbnails ?? []
}

export function assetsOfType(
  pkg: FinalPackage,
  type: "LONG_FORM" | "SHORT_FORM" | "THUMBNAIL"
) {
  if (type === "THUMBNAIL") {
    const nested = videoAssets(pkg).flatMap((v) => thumbnailsForVideo(v))
    if (nested.length > 0) return nested
  }
  return (pkg.currentAssets ?? []).filter((a) => a.type === type)
}

export function formatPackageFileSize(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Package-level withdraw removed — Super Admin withdraws per video only. */
export function canWithdrawPackage(_pkg: FinalPackage): boolean {
  return false
}
