/**
 * Phase 6 — Final Package Delivery (per-video independent flow).
 * Postman: `postman/Phase 6 — Final Package Delivery (Per-Video Flow).postman_collection.json`
 */

/** @deprecated Legacy package-level status; workflow is per `PackageVideo.status`. */
export type PackageStatus =
  | "DRAFT"
  | "MEDICAL_REVIEW"
  | "BRAND_REVIEW"
  | "BRAND_VIDEO_REVIEW"
  | "APPROVER_REVIEW"
  | "AWAITING_APPROVER"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN"

export type PackageTrackStatus = "PENDING" | "APPROVED" | "REJECTED"

export type PackageAssetType = "LONG_FORM" | "SHORT_FORM" | "THUMBNAIL"

export type PackageVideoStatus =
  | "MEDICAL_REVIEW"
  | "BRAND_VIDEO_REVIEW"
  | "AWAITING_APPROVER"
  | "APPROVED"
  | "WITHDRAWN"

export type ThumbnailReviewStatus = "PENDING" | "APPROVED" | "REJECTED"

export type PackageFeedbackAssetType =
  | PackageAssetType
  | "TITLE"
  | "DESCRIPTION"
  | "TAGS"

export type PackageItemFeedbackField =
  | "VIDEO"
  | "TITLE"
  | "DESCRIPTION"
  | "TAGS"
  | "THUMBNAIL"

export interface PackageItemFeedbackEntry {
  videoAssetId?: string
  thumbnailId?: string
  field: PackageItemFeedbackField
  hasIssue: boolean
  comment?: string
}

export interface PackageScriptRef {
  id: string
  title: string
  status: string
  version?: number
}

export interface PackageUserRef {
  id: string
  firstName: string
  lastName: string
  role?: string
}

/** Thumbnail on a package video asset (reviewed individually by Brand). */
export interface PackageThumbnailRecord {
  id: string
  assetId: string
  fileUrl: string
  fileName: string
  fileType?: string | null
  fileSize?: number | null
  status: ThumbnailReviewStatus
  comment?: string | null
  version?: number
  createdAt?: string
}

/** One version snapshot for a package video (video file + metadata + thumbnails). */
export interface PackageVideoAsset {
  id: string
  packageVideoId?: string
  type: "LONG_FORM" | "SHORT_FORM"
  fileUrl: string
  fileName: string
  fileType?: string | null
  fileSize?: number | null
  order?: number | null
  version: number
  createdAt?: string
  title?: string | null
  description?: string | null
  tags?: string[] | null
  thumbnails?: PackageThumbnailRecord[]
}

/**
 * Legacy flat asset shape (nested thumbnails as PackageAsset[]) — still used by
 * some UI helpers / players; convert from `PackageVideoAsset` when needed.
 */
export interface PackageAsset {
  id: string
  packageId?: string
  type: PackageAssetType
  fileUrl: string
  fileName: string
  fileType?: string | null
  fileSize?: number | null
  order?: number | null
  isSelected?: boolean
  version?: number
  createdAt?: string
  title?: string | null
  description?: string | null
  tags?: string[] | null
  thumbnails?: PackageAsset[]
}

export interface PackageAssetFeedback {
  id?: string
  packageReviewId?: string
  assetId?: string | null
  assetType: PackageFeedbackAssetType
  hasIssue: boolean
  comments?: string | null
}

export interface PackageLatestRejection {
  id: string
  packageId: string
  reviewerId: string
  reviewerType: string
  decision: "REJECTED"
  overallComments: string
  trackReviewed?: string
  stageAtReview?: PackageStatus | string
  reviewedAt: string
  createdAt?: string
  reviewer?: PackageUserRef
  assetFeedback?: PackageAssetFeedback[]
  itemFeedback?: PackageItemFeedbackEntry[]
}

export interface PackageReview {
  id: string
  decision: string
  reviewerType: string
  trackReviewed?: string
  stageAtReview?: string
  overallComments?: string | null
  comments?: string | null
  reviewedAt: string
  reviewer?: Pick<PackageUserRef, "firstName" | "lastName" | "role">
  assetFeedback?: PackageAssetFeedback[]
  itemFeedback?: PackageItemFeedbackEntry[]
}

export interface PackageVideoReview {
  id: string
  packageVideoId: string
  reviewerId?: string
  reviewerType: string
  decision: string
  overallComments?: string | null
  trackReviewed?: string
  stageAtReview?: string
  reviewedAt: string
  itemFeedback?: PackageItemFeedbackEntry[]
}

/** One deliverable video — independent workflow from siblings in the same package. */
export interface PackageVideo {
  id: string
  packageId: string
  type: "LONG_FORM" | "SHORT_FORM"
  status: PackageVideoStatus
  videoTrackStatus: PackageTrackStatus
  metadataTrackStatus: PackageTrackStatus
  currentVersion: number
  assets: PackageVideoAsset[]
  reviews?: PackageVideoReview[]
  uploadedById?: string | null
  createdAt?: string
  updatedAt?: string
  /** When API embeds script on queue items */
  scriptId?: string
  script?: PackageScriptRef
  /** When API embeds parent package summary */
  package?: { id: string; name?: string; scriptId?: string }
}

export interface PackageTat {
  hoursElapsed: number
  isOverdue: boolean
  tatLimitHours: number
  repeatCycleHours: number
  hoursInCurrentCycle: number
  cycleNumber: number
}

/** API package container — no workflow status at package level. */
export interface FinalPackage {
  id: string
  scriptId: string
  name?: string
  /** Legacy display fallback */
  title?: string
  description?: string
  tags?: string[]
  language?: string
  stage?: string
  videos: PackageVideo[]
  assignedAt?: string | null
  lockedAt?: string | null
  createdAt: string
  updatedAt: string
  script?: PackageScriptRef
  uploadedBy?: PackageUserRef
  lockedBy?: PackageUserRef | null
  tat?: PackageTat | null
  /** @deprecated Aggregated / legacy — prefer per-video fields */
  status?: PackageStatus
  version?: number
  videoTrackStatus?: PackageTrackStatus
  metadataTrackStatus?: PackageTrackStatus
  currentAssets?: PackageAsset[]
  previousAssets?: PackageAsset[]
  selectedThumbnail?: PackageAsset | null
  latestRejection?: PackageLatestRejection | null
  reviews?: PackageReview[]
}

export interface PackageUploadUrlResponse {
  success?: boolean
  uploadUrl: string
  fileUrl: string
  key: string
}

export type PackageUploadUrlAssetType = "video" | "thumbnail"

export interface SubmitPackageThumbnailInput {
  fileUrl: string
  fileName: string
  fileType?: string
  fileSize?: number
}

export interface SubmitPackageVideoInput {
  type: "LONG_FORM" | "SHORT_FORM"
  fileUrl: string
  fileName: string
  fileType?: string
  fileSize?: number
  title?: string
  description?: string
  tags?: string[]
  thumbnails: SubmitPackageThumbnailInput[]
}

export interface SubmitPackageBody {
  scriptId: string
  name: string
  video: SubmitPackageVideoInput
}

export interface AddPackageVideoBody extends SubmitPackageVideoInput {}

export interface ResubmitPackageVideoBody {
  fileUrl: string
  fileName: string
  fileType?: string
  fileSize?: number
}

export interface ResubmitPackageVideoMetadataBody {
  title: string
  description: string
  tags?: string[]
  thumbnails: SubmitPackageThumbnailInput[]
}

export type ApprovePackageVideoBody = {
  comments?: string
}

export type RejectPackageVideoBody = {
  overallComments?: string
  itemFeedback: PackageItemFeedbackEntry[]
}

export interface ReviewThumbnailBody {
  status: "APPROVED" | "REJECTED"
  comment?: string
}

export interface PackageQueueResponse {
  success?: boolean
  total: number
  videos: PackageVideo[]
}

export interface PackageStatsResponse {
  success?: boolean
  stats: {
    total: number
    byStatus: Partial<Record<PackageVideoStatus | string, number>>
  }
}

export interface PackageVersionHistoryEntry {
  version: number
  asset: PackageVideoAsset
  reviews?: PackageVideoReview[]
}

export interface PackageVideoVersionsResponse {
  success?: boolean
  videoId: string
  currentVersion: number
  totalVersions?: number
  versions: PackageVersionHistoryEntry[]
}

/** @deprecated Use PackageVideoVersionsResponse per video */
export interface PackageVersionEntry {
  version: number
  assets: PackageAsset[]
}

/** @deprecated */
export interface PackageVersionsResponse {
  success?: boolean
  packageId: string
  currentVersion: number
  versions: PackageVersionEntry[]
}

export interface PackageMyReviewsResponse {
  success?: boolean
  total: number
  page: number
  limit: number
  totalPages?: number
  videos: PackageVideo[]
}
