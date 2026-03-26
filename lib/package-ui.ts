import type {
  FinalPackage,
  PackageAsset,
  PackageItemFeedbackField,
  PackageStatus,
  PackageTrackStatus,
} from "@/types/package"

export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  DRAFT: "Draft",
  MEDICAL_REVIEW: "Medical review",
  BRAND_REVIEW: "Brand video review",
  APPROVER_REVIEW: "Content approver",
  APPROVED: "Approved",
  REJECTED: "Rejected",
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
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
    case "APPROVER_REVIEW":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
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

/** Top-level video assets (long + shorts). Thumbnails may be nested under each. */
export function videoAssets(pkg: FinalPackage): PackageAsset[] {
  return (pkg.currentAssets ?? []).filter(
    (a) => a.type === "LONG_FORM" || a.type === "SHORT_FORM"
  )
}

/** Label a video deliverable for reviewers (long-form vs short N) by asset id. */
export function packageVideoAssetLabel(
  pkg: FinalPackage,
  videoAssetId: string
): string {
  const sorted = [...videoAssets(pkg)].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  )
  let shortNum = 0
  for (const v of sorted) {
    if (v.id === videoAssetId) {
      if (v.type === "LONG_FORM") return "Long-form (main)"
      return `Short-form ${shortNum + 1}`
    }
    if (v.type === "SHORT_FORM") shortNum += 1
  }
  return "Video deliverable"
}

/** Card / row accent for parallel track status. */
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

/** Agency may withdraw only in MEDICAL_REVIEW before any review exists. */
export function canWithdrawPackage(pkg: FinalPackage): boolean {
  if (pkg.status !== "MEDICAL_REVIEW") return false
  const n = pkg.reviews?.length ?? 0
  return n === 0
}
