/** Super Admin dashboard & content APIs — shapes aligned with backend integration guide. */

export type AdminScriptsByStatus = {
  draft?: number
  contentBrandReview?: number
  agencyProduction?: number
  medicalReview?: number
  contentBrandApproval?: number
  contentApproverReview?: number
  locked?: number
}

export type AdminVideoPhaseStats = {
  total: number
  awaitingUpload: number
  medicalReview: number
  brandReview: number
  approved: number
  overdue: number
}

export type AdminVideoStats = {
  firstLineUp: AdminVideoPhaseStats
  firstCut: AdminVideoPhaseStats
}

export type AdminPackageStats = {
  total: number
  medicalReview: number
  brandReview: number
  awaitingApprover: number
  approved: number
  overdue: number
}

export type AdminLanguagePackageStats = {
  total: number
  brandReview: number
  awaitingApprover: number
  approved: number
  withdrawn: number
}

export type AdminOverviewResponse = {
  success?: boolean
  scripts: {
    total: number
    byStatus: AdminScriptsByStatus
    overdue: number
  }
  videos: AdminVideoStats
  packages: AdminPackageStats
  languagePackages: AdminLanguagePackageStats
  users: { total: number; active: number }
  activity: { reviewsToday: number; actionsToday: number }
  overdue: {
    scripts: number
    videos: number
    packages: number
    total: number
  }
  notifications: { unread: number }
}

export type AdminOverdueItemType =
  | "script"
  | "video"
  | "package"
  | "languageBatch"

export type AdminOverdueItem = {
  type: AdminOverdueItemType
  id: string
  title: string
  stage?: string
  stageLabel: string
  phase?: string
  owner: string
  hoursOverdue: number
  hoursElapsed?: number
  tatLimit: number
  assignedAt: string
  pendingLanguages?: number
}

export type AdminOverdueResponse = {
  success?: boolean
  items: AdminOverdueItem[]
  total: number
}

export type TeamPerformancePeriod = "today" | "week" | "month"

export type TeamPerformanceUser = {
  id: string
  name: string
  role: string
  email: string
  period: TeamPerformancePeriod
  totalReviews: number
  scriptReviews: number
  videoReviews: number
  packageReviews: number
  approvals: number
  rejections: number
  rejectionRate: number
  avgResponseHours: number | null
  pendingNow: number
}

export type TeamPerformanceResponse = {
  success?: boolean
  users: TeamPerformanceUser[]
  period: TeamPerformancePeriod
}

export type AdminContentSort = "newest" | "oldest" | "title"

export type AdminContentItem = {
  id: string
  contentType: string
  phase: string
  phaseLabel: string
  title: string
  status: string
  statusLabel: string
  version: number | null
  doctorName: string | null
  specialty: string | null
  language: string | null
  assetType: string | null
  packageName: string | null
  fileUrl: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  videoTrackStatus?: string | null
  metadataTrackStatus?: string | null
}

export type AdminContentFilterOptions = {
  phases: string[]
  statuses: string[]
  specialties: string[]
  languages: string[]
  assetTypes: string[]
}

export type AdminContentResponse = {
  success?: boolean
  items: AdminContentItem[]
  total: number
  page: number
  limit: number
  totalPages: number
  filterOptions: AdminContentFilterOptions
}

export type PipelinePeriod = "week" | "month" | "all"

export type PipelineFunnel = Record<string, number>

export type PipelineConversionRates = Record<string, number>

export type PipelineResponse = {
  success?: boolean
  period: PipelinePeriod
  funnel: PipelineFunnel
  conversionRates: PipelineConversionRates
}

export type RejectionReportPeriod = "week" | "month" | "all"

export type RejectionSummary = {
  totalRejections: number
  uniqueScriptsRejected: number
  avgRejectionsPerScript: number
  byRole: Record<string, number>
  byStage: Record<string, number>
}

export type RejectionScriptRow = {
  scriptId: string
  title: string
  currentStatus: string
  currentVersion: number
  rejections: number
  rejectedBy: string[]
  stages: string[]
  lastRejectionReason: string | null
  lastRejectedAt: string
}

export type RejectionReportResponse = {
  success?: boolean
  period: RejectionReportPeriod
  summary: RejectionSummary
  scripts: RejectionScriptRow[]
}

export type ScriptTimelineEntry = {
  action: string
  by: string
  role: string
  at: string
  oldStatus: string | null
  newStatus: string | null
  comments: string | null
  durationHours: number | null
}

export type ScriptTimelineResponse = {
  success?: boolean
  scriptId: string
  title: string
  currentStatus: string
  currentVersion: number
  totalDays: number
  totalSteps: number
  createdBy: string
  lockedBy: string | null
  lockedAt: string | null
  timeline: ScriptTimelineEntry[]
  videos: { id: string; phase: string; status: string; version: number }[]
  packages: {
    id: string
    name: string
    videoCount: number
    videoStatuses: string[]
  }[]
}
