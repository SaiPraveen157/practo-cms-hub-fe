/**
 * Phase 7 — Language packages (localized deliverables per script).
 * Postman: `postman/Phase7_Language_Packages_Postman.json`
 */

import type { PackageScriptRef, PackageUserRef } from "@/types/package"

export type PackageLanguage =
  | "ENGLISH"
  | "HINDI"
  | "BENGALI"
  | "TAMIL"
  | "TELUGU"
  | "KANNADA"
  | "MALAYALAM"
  | "MARATHI"

export type LanguageVideoStatus =
  | "BRAND_REVIEW"
  | "AWAITING_APPROVER"
  | "APPROVED"
  | "WITHDRAWN"

export type LanguageThumbnailStatus = "PENDING" | "APPROVED" | "REJECTED"

export interface LanguageThumbnailRecord {
  id: string
  assetId?: string
  fileUrl: string
  fileName: string
  fileType?: string | null
  fileSize?: number | string | null
  status: LanguageThumbnailStatus
  comment?: string | null
  version?: number
  createdAt?: string
}

export interface LanguageVideoAsset {
  id: string
  languageVideoId?: string
  fileUrl: string
  fileName: string
  fileType?: string | null
  fileSize?: number | string | null
  version: number
  title?: string | null
  description?: string | null
  tags?: string[] | null
  doctorName?: string | null
  specialty?: string | null
  thumbnails?: LanguageThumbnailRecord[]
  createdAt?: string
}

export interface LanguageVideoReview {
  id: string
  decision: string
  reviewerType?: string
  overallComments?: string | null
  reviewedAt: string
  itemFeedback?: LanguageItemFeedbackEntry[]
}

export interface LanguageItemFeedbackEntry {
  field: string
  hasIssue: boolean
  comment?: string
  videoAssetId?: string
  thumbnailId?: string
}

export interface LanguageVideo {
  id: string
  packageId: string
  status: LanguageVideoStatus
  currentVersion: number
  assets: LanguageVideoAsset[]
  reviews?: LanguageVideoReview[]
  uploadedById?: string | null
  createdAt?: string
  updatedAt?: string
  scriptId?: string
  package?: {
    id: string
    name?: string
    language?: PackageLanguage | string
    scriptId?: string
  }
}

export interface LanguagePackage {
  id: string
  scriptId: string
  name: string
  language: PackageLanguage | string
  stage?: string
  videos: LanguageVideo[]
  createdAt: string
  updatedAt: string
  script?: PackageScriptRef
  uploadedBy?: PackageUserRef
}

export interface LanguagePackageUploadUrlResponse {
  success?: boolean
  uploadUrl: string
  fileUrl: string
  key: string
  expiresIn?: number
}

export type LanguagePackageUploadUrlAssetType = "video" | "thumbnail"

export interface SubmitLanguageThumbnailInput {
  fileUrl: string
  fileName: string
  fileType?: string
  fileSize?: number
}

export interface SubmitLanguageVideoInput {
  fileUrl: string
  fileName: string
  fileType?: string
  fileSize?: number
  title?: string
  description?: string
  tags?: string[]
  doctorName?: string
  specialty?: string
  thumbnails?: SubmitLanguageThumbnailInput[]
}

export interface CreateLanguagePackageBody {
  scriptId: string
  name: string
  language: PackageLanguage | string
  video: SubmitLanguageVideoInput
}

export interface ResubmitLanguageVideoBody {
  fileUrl: string
  fileName: string
  fileType?: string
  fileSize?: number
}

export interface ResubmitLanguageMetadataBody {
  title?: string
  description?: string
  tags?: string[]
  doctorName?: string
  specialty?: string
  thumbnails?: SubmitLanguageThumbnailInput[]
}

export interface ApproveLanguageVideoBody {
  overallComments?: string
}

export interface RejectLanguageVideoBody {
  overallComments: string
  itemFeedback: LanguageItemFeedbackEntry[]
}

export interface ReviewLanguageThumbnailBody {
  status: "APPROVED" | "REJECTED"
  comment?: string
}

export interface LanguagePackageQueueResponse {
  success?: boolean
  total?: number
  videos: LanguageVideo[]
}

export interface LanguagePackageStatsResponse {
  success?: boolean
  data?: Record<string, number>
}
