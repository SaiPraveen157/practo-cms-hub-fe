/**
 * Video workflow types — Phase 4 (First Line Up) & Phase 5 (First Cut).
 * Aligned with POST /api/videos/upload-url, POST /api/videos, GET /api/videos/queue, etc.
 */

export type VideoPhase = "FIRST_LINE_UP" | "FIRST_CUT"

export type VideoStatus =
  | "AGENCY_UPLOAD_PENDING"
  | "MEDICAL_REVIEW"
  | "CONTENT_BRAND_REVIEW"
  | "APPROVED"

export type VideoReviewDecision = "APPROVED" | "REJECTED"

export type VideoFileCategory = "video" | "pdf" | "image" | "other" | null

export interface VideoScriptRef {
  id: string
  title: string
  status: string
}

export interface VideoUploadedBy {
  id: string
  firstName: string
  lastName: string
}

export interface VideoReview {
  id: string
  videoId: string
  reviewerId: string
  reviewerType: string
  decision: VideoReviewDecision
  comments: string | null
  stageAtReview: string
  reviewedAt: string
  createdAt: string
  reviewer?: {
    id: string
    firstName: string
    lastName: string
    role: string
  }
}

export interface Video {
  id: string
  scriptId: string
  phase: VideoPhase
  status: VideoStatus
  stage?: string
  version: number
  fileUrl: string | null
  fileName: string | null
  fileType: string | null
  fileSize: number | null
  uploadedById: string | null
  assignedReviewerId: string | null
  assignedAt: string | null
  createdAt: string
  updatedAt: string
  script?: VideoScriptRef
  uploadedBy?: VideoUploadedBy
  reviews?: VideoReview[]
  fileCategory: VideoFileCategory
  tat?: { dueAt: string; limitHours: number } | null
}

export interface UploadUrlResponse {
  uploadUrl: string
  key: string
  fileUrl: string
  expiresIn: number
}

/** POST /api/videos — Step C after S3 upload (Postman: scriptId, phase, file fields only). */
export interface SubmitVideoBody {
  scriptId: string
  phase: VideoPhase
  fileUrl: string
  fileName: string
  fileType: string
  fileSize: number
}

export interface SubmitVideoResponse {
  success: boolean
  message?: string
  video: Video
}

export interface VideoQueueResponse {
  available: Video[]
  myReviews: Video[]
  total: number
}

export interface VideoStatsResponse {
  firstLineUp?: {
    awaitingUpload: number
    pending: number
    overdue: number
    approved: number
  }
  firstCut?: {
    awaitingUpload: number
    pending: number
    overdue: number
    approved: number
  }
  tatConfig?: { limitHours: number; repeatCycleHours: number }
}

export interface ApproveRejectBody {
  comments?: string | null
}

/** POST /api/videos/:id/reject — Postman: newVersion = AGENCY_UPLOAD_PENDING row for re-upload. */
export interface RejectVideoResponse {
  rejectedVideo: Video
  newVersion?: Video
}

export interface VideoComment {
  id: string
  content: string
  createdAt: string
  timestampSeconds?: number | null
  author?: { id: string; firstName: string; lastName: string; role: string }
}
