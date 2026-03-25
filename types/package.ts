/**
 * Phase 6 — Final Package Delivery (redesigned API).
 * Postman: `postman/Phase 6 — Final Package Delivery.postman_collection.json`
 */

export type PackageStatus =
  | "DRAFT"
  | "MEDICAL_REVIEW"
  | "BRAND_REVIEW"
  | "APPROVER_REVIEW"
  | "APPROVED"
  | "REJECTED"

export type PackageTrackStatus = "PENDING" | "APPROVED" | "REJECTED"

export type PackageAssetType = "LONG_FORM" | "SHORT_FORM" | "THUMBNAIL"

export type PackageFeedbackAssetType =
  | PackageAssetType
  | "TITLE"
  | "DESCRIPTION"
  | "TAGS"

/** Reject / review item feedback (redesigned). */
export type PackageItemFeedbackField =
  | "VIDEO"
  | "TITLE"
  | "DESCRIPTION"
  | "TAGS"
  | "THUMBNAIL"

export interface PackageItemFeedbackEntry {
  videoAssetId: string
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
  /** Per-video metadata (nested model from GET package). */
  title?: string | null
  description?: string | null
  tags?: string[] | null
  /** Thumbnail options for this video (nested). */
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

export interface PackageTat {
  hoursElapsed: number
  isOverdue: boolean
  tatLimitHours: number
  repeatCycleHours: number
  hoursInCurrentCycle: number
  cycleNumber: number
}

export interface FinalPackage {
  id: string
  scriptId: string
  status: PackageStatus
  version: number
  videoTrackStatus: PackageTrackStatus
  metadataTrackStatus: PackageTrackStatus
  /** Package display name (submit `name`). */
  name?: string
  title: string
  description: string
  tags: string[]
  assignedAt?: string | null
  lockedAt?: string | null
  createdAt: string
  updatedAt: string
  script?: PackageScriptRef
  uploadedBy?: PackageUserRef
  lockedBy?: PackageUserRef | null
  currentAssets: PackageAsset[]
  previousAssets?: PackageAsset[]
  /** Legacy single selected thumb; prefer nested `thumbnails[].isSelected` per video. */
  selectedThumbnail?: PackageAsset | null
  latestRejection?: PackageLatestRejection | null
  reviews?: PackageReview[]
  tat?: PackageTat | null
}

export interface PackageUploadUrlResponse {
  success?: boolean
  uploadUrl: string
  fileUrl: string
  key: string
}

/** Presign request — `assetType` is `video` or `thumbnail`. */
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
  order: number
  title: string
  description: string
  tags: string[]
  thumbnails: SubmitPackageThumbnailInput[]
}

export interface SubmitPackageBody {
  scriptId: string
  name: string
  videos: SubmitPackageVideoInput[]
}

export interface ResubmitVideosBody {
  videos: Array<{
    type: "LONG_FORM" | "SHORT_FORM"
    fileUrl: string
    fileName: string
    fileType?: string
    fileSize?: number
    order: number
  }>
}

export interface ResubmitVideoMetadataEntry {
  order: number
  type: "LONG_FORM" | "SHORT_FORM"
  title: string
  description: string
  tags: string[]
  thumbnails: SubmitPackageThumbnailInput[]
}

export interface ResubmitMetadataBody {
  videoMetadata: ResubmitVideoMetadataEntry[]
}

export type ApprovePackageBody = {
  comments?: string
  /** Brand metadata approval at MEDICAL_REVIEW — one selection per video asset. */
  thumbnailSelections?: Array<{ assetId: string; thumbnailId: string }>
}

export type RejectPackageBody = {
  overallComments: string
  itemFeedback?: PackageItemFeedbackEntry[]
}

export interface PackageQueueResponse {
  success?: boolean
  available: FinalPackage[]
  myReviews: FinalPackage[]
  total: number
}

export interface PackageStatsResponse {
  success?: boolean
  draft: number
  inReview: number
  overdue: number
  approved: number
  rejected: number
  tatConfig?: {
    limitHours: number
    repeatCycleHours: number
  }
}

export interface PackageVersionEntry {
  version: number
  assets: PackageAsset[]
}

export interface PackageVersionsResponse {
  success?: boolean
  packageId: string
  currentVersion: number
  versions: PackageVersionEntry[]
}

export interface PackageMyReviewsResponse {
  success?: boolean
  packages: FinalPackage[]
  total: number
  page: number
  limit: number
  totalPages: number
}
