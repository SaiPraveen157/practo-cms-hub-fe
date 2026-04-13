export type ScriptStatus =
  | "DRAFT"
  | "CONTENT_BRAND_REVIEW"
  | "AGENCY_PRODUCTION"
  | "MEDICAL_REVIEW"
  | "CONTENT_BRAND_APPROVAL"
  | "CONTENT_APPROVER_REVIEW"
  | "LOCKED"

/** First Line Up state on locked scripts from `GET /api/scripts/queue` (`fluStatus`). */
export type ScriptFluStatus =
  | "AGENCY_UPLOAD_PENDING"
  | "MEDICAL_REVIEW"
  | "CONTENT_BRAND_REVIEW"
  | "APPROVED"

export type ScriptCommentAnchorSpace = "plain_text_utf16" | "prosemirror_pos"

export interface ScriptCommentAnchor {
  space: ScriptCommentAnchorSpace
  startOffset: number
  endOffset: number
  contentVersion?: number
}

/** Populated on GET /api/scripts/:id/comments (backend). */
export interface ScriptCommentAuthor {
  id: string
  firstName: string
  lastName: string
  role: string
}

export interface ScriptComment {
  id: string
  body: string
  anchor?: ScriptCommentAnchor
  createdAt?: string
  updatedAt?: string
  authorId?: string
  /** Present when loaded from the comments API. */
  author?: ScriptCommentAuthor
  scriptId?: string
  /** Which script revision this comment belongs to (matches `Script.version`). */
  scriptVersion?: number
  contextSnippet?: string | null
  resolved?: boolean
}

export type ScriptFeedbackSticker = ScriptComment

export interface Script {
  id: string
  version: number
  title: string | null
  insight: string | null
  content: string
  status: ScriptStatus
  summary?: string | null
  tags?: string[]
  createdById?: string | null
  createdAt: string
  updatedAt: string
  lockedAt?: string | null
  createdBy?: { id: string; firstName: string; lastName: string } | null
  tat?: {
    hoursElapsed: number
    isOverdue: boolean
    tatLimitHours: number
    repeatCycleHours: number
    hoursInCurrentCycle: number
    cycleNumber: number
  } | null
  latestRejection?: {
    comments: string
    rejectedBy: string
    stageAtReview: string
    reviewedAt: string
  } | null
  /**
   * Locked scripts: First Line Up (Phase 4) progress from script queue.
   * `null` = not uploaded yet; enum = pipeline stage.
   */
  fluStatus?: ScriptFluStatus | null
  comments?: ScriptComment[]
  feedbackStickers?: ScriptComment[]
}

export interface ScriptQueueResponse {
  success: boolean
  available: Script[]
  myReviews: Script[]
  total: number
}

export interface CreateScriptBody {
  title?: string
  insight?: string
  content: string
  comments?: ScriptComment[]
  feedbackStickers?: ScriptComment[]
}

export interface UpdateScriptBody {
  title?: string
  insight?: string
  content?: string
  summary?: string
  tags?: string[]
  comments?: ScriptComment[]
  feedbackStickers?: ScriptComment[]
}

export interface ListScriptsParams {
  page?: number
  limit?: number
  status?: ScriptStatus
  q?: string
  title?: string
}

export interface ListScriptsResponse {
  success: boolean
  scripts: Script[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface SingleScriptResponse {
  success?: boolean
  script: Script
}

export interface ScriptStatsResponse {
  success: boolean
  pendingReview: number
  overdueCount: number
  reviewedToday: number
  tatConfig?: { limitHours: number; repeatCycleHours: number }
}

export interface ScriptCommentsListResponse {
  success: boolean
  /** Current script revision; GET returns only comments for this version. */
  scriptVersion?: number
  comments: ScriptComment[]
}

export type ScriptCommentsListResponseWire = {
  success: boolean
  scriptVersion?: number
  comments?: ScriptComment[]
  feedbackStickers?: ScriptComment[]
}

export interface ScriptCommentCreateBody {
  id: string
  body: string
  anchor: ScriptCommentAnchor
  contextSnippet?: string
  resolved?: boolean
}

export interface ScriptCommentPatchBody {
  body?: string
  contextSnippet?: string
  resolved?: boolean
  anchor?: ScriptCommentAnchor
}

export interface ScriptCommentMutationResponse {
  success: boolean
  comment?: ScriptComment
}

export interface ScriptCommentsPutBody {
  comments: ScriptComment[]
}
