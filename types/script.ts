/**
 * Script types aligned with backend (Script model, API responses).
 * See docs/database-schema.prisma and Postman collection.
 */

export type ScriptStatus =
  | "DRAFT"
  | "CONTENT_BRAND_REVIEW"
  | "AGENCY_PRODUCTION"
  | "MEDICAL_REVIEW"
  | "CONTENT_BRAND_APPROVAL"
  | "CONTENT_APPROVER_REVIEW"
  | "LOCKED"

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
  /** Present in queue response */
  createdBy?: { id: string; firstName: string; lastName: string } | null
  /** TAT info from queue */
  tat?: {
    hoursElapsed: number
    isOverdue: boolean
    tatLimitHours: number
    repeatCycleHours: number
    hoursInCurrentCycle: number
    cycleNumber: number
  } | null
  /** Latest rejection (from queue) when script came back due to rejection */
  latestRejection?: {
    comments: string
    rejectedBy: string
    stageAtReview: string
    reviewedAt: string
  } | null
}

/** GET /api/scripts/queue — role-based queue: available + myReviews */
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
}

export interface UpdateScriptBody {
  title?: string
  insight?: string
  content?: string
  summary?: string
  tags?: string[]
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
