import { apiRequest } from "@/lib/api"
import {
  coerceAdminContentResponse,
  coerceAdminOverdueResponse,
  coerceAdminOverviewResponse,
  coerceScriptTimelineResponse,
} from "@/lib/admin-normalize"
import type {
  AdminContentResponse,
  AdminContentSort,
  AdminOverdueResponse,
  AdminOverviewResponse,
  PipelinePeriod,
  PipelineResponse,
  RejectionReportPeriod,
  RejectionReportResponse,
  ScriptTimelineResponse,
  TeamPerformancePeriod,
  TeamPerformanceResponse,
} from "@/types/admin"

export async function getAdminOverview(
  token: string
): Promise<AdminOverviewResponse> {
  const raw = await apiRequest<unknown>("/api/admin/overview", { token })
  return coerceAdminOverviewResponse(raw)
}

export async function getAdminOverdue(
  token: string
): Promise<AdminOverdueResponse> {
  const raw = await apiRequest<unknown>("/api/admin/overdue", { token })
  return coerceAdminOverdueResponse(raw)
}

export async function getTeamPerformance(
  token: string,
  period: TeamPerformancePeriod = "week"
): Promise<TeamPerformanceResponse> {
  const q = new URLSearchParams({ period })
  return apiRequest<TeamPerformanceResponse>(
    `/api/admin/team-performance?${q.toString()}`,
    { token }
  )
}

export async function getScriptTimeline(
  token: string,
  scriptId: string
): Promise<ScriptTimelineResponse> {
  const raw = await apiRequest<unknown>(
    `/api/admin/script-timeline/${encodeURIComponent(scriptId)}`,
    { token }
  )
  return coerceScriptTimelineResponse(raw)
}

export async function getRejectionReport(
  token: string,
  period: RejectionReportPeriod = "month"
): Promise<RejectionReportResponse> {
  const q = new URLSearchParams({ period })
  return apiRequest<RejectionReportResponse>(
    `/api/admin/rejection-report?${q.toString()}`,
    { token }
  )
}

export async function getPipelineMetrics(
  token: string,
  period: PipelinePeriod = "month"
): Promise<PipelineResponse> {
  const q = new URLSearchParams({ period })
  return apiRequest<PipelineResponse>(
    `/api/admin/pipeline?${q.toString()}`,
    { token }
  )
}

export type AdminContentQuery = {
  search?: string
  status?: string
  phase?: string
  specialty?: string
  language?: string
  type?: string
  packageName?: string
  page?: number
  limit?: number
  sort?: AdminContentSort
}

export async function getAdminContent(
  token: string,
  query: AdminContentQuery = {}
): Promise<AdminContentResponse> {
  const q = new URLSearchParams()
  if (query.search) q.set("search", query.search)
  if (query.status) q.set("status", query.status)
  if (query.phase) q.set("phase", query.phase)
  if (query.specialty) q.set("specialty", query.specialty)
  if (query.language) q.set("language", query.language)
  if (query.type) q.set("type", query.type)
  if (query.packageName) q.set("packageName", query.packageName)
  if (query.page != null) q.set("page", String(query.page))
  if (query.limit != null) q.set("limit", String(query.limit))
  if (query.sort) q.set("sort", query.sort)
  const qs = q.toString()
  const raw = await apiRequest<unknown>(
    `/api/admin/content${qs ? `?${qs}` : ""}`,
    { token }
  )
  return coerceAdminContentResponse(raw)
}
