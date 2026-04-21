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

/** Shipped on the new row after reject — summary of who rejected the prior version. */
export interface VideoRejectionComment {
  reviewerName: string
  reviewerRole: string
  comment: string
  reviewedAt: string
  fromVideoId: string
}

export interface Video {
  id: string
  scriptId: string
  phase: VideoPhase
  status: VideoStatus
  stage?: string
  version: number
  /** Prior cut’s row id — use with GET …/comments?previousVideoId=… and to load the file for review. */
  previousVideoId?: string | null
  /** Present when this row was created after a rejection (optional). */
  rejectionComment?: VideoRejectionComment | null
  /**
   * Timestamp thread comments from the rejected cut — embedded on GET /api/videos/:id
   * (preferred over a separate comments request when present).
   */
  previousVideoComments?: VideoComment[] | null
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
  /** AGENCY_UPLOAD_PENDING row after reject — attach file to this version (First Line Up + First Cut). */
  videoId?: string
}

export interface SubmitVideoResponse {
  success: boolean
  message?: string
  video: Video
}

export interface VideoQueueResponse {
  available: Video[]
  myReviews: Video[]
  /** Optional fourth bucket from some backends — merged client-side with available + myReviews. */
  pendingUpload?: Video[]
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

/** Row from GET /api/videos/:id/versions (lightweight list for dropdown). */
export interface VideoVersionListEntry {
  version: number
  /** Row id for this version (may differ from the “current” route id). */
  videoId: string
  status?: string
  fileName?: string | null
  createdAt?: string
  updatedAt?: string
  uploadedAt?: string
  commentCount?: number
  wasRejected?: boolean
  rejectionReason?: string | null
  rejection?: Record<string, unknown> | null
}

/** GET /api/videos/:videoId/versions */
export interface VideoVersionsListResponse {
  success?: boolean
  scriptId?: string
  scriptTitle?: string
  phase?: string
  currentVersion?: number
  totalVersions?: number
  versions: VideoVersionListEntry[]
}

/** Normalized GET /api/videos/:videoId/versions/:version — for archived read-only playback. */
export interface VideoVersionDetailView {
  id: string
  version: number
  isCurrentVersion?: boolean
  scriptId?: string
  scriptTitle?: string
  phase?: string
  status?: string
  fileUrl: string | null
  fileName?: string | null
  fileType?: string | null
  fileSize?: number | null
  createdAt?: string
  updatedAt?: string
  /** Timestamp-only thread for this file version. */
  comments: VideoComment[]
}

export interface VideoComment {
  id: string
  content: string
  createdAt: string
  /**
   * Playback position in seconds for video-file threads. The app only displays
   * comments with a timestamp; metadata/copy feedback uses other APIs.
   */
  timestampSeconds?: number | null
  /**
   * File/version snapshot this note applies to (First Line Up / First Cut
   * `Video.version`, package `currentVersion`, language `currentVersion`).
   * When omitted on legacy rows, the client treats them as version 1 only.
   * Filled from GET `video.version` via `normalizeVideoComment`.
   */
  assetVersion?: number | null
  /** Some GET responses nest version here; prefer `assetVersion` after normalize. */
  video?: { version?: number }
  author?: { id: string; firstName: string; lastName: string; role: string }
}
