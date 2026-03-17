/**
 * Scripts API — Phase 1 (Create, List, Get, Update, Submit).
 * Aligned with postman/Practo CMS V2 — Complete (Part 1 + Part 2).
 */

import { apiRequest } from "@/lib/api"
import type {
  CreateScriptBody,
  UpdateScriptBody,
  ListScriptsParams,
  ListScriptsResponse,
  ScriptQueueResponse,
  ScriptStatsResponse,
  SingleScriptResponse,
} from "@/types/script"

function checkToken(token: string | null): asserts token is string {
  if (!token) throw new Error("Not authenticated")
}

export async function createScript(
  token: string | null,
  body: CreateScriptBody
): Promise<SingleScriptResponse> {
  checkToken(token)
  return apiRequest<SingleScriptResponse>("/api/scripts", {
    method: "POST",
    body,
    token,
  })
}

export async function listScripts(
  token: string | null,
  params: ListScriptsParams = {}
): Promise<ListScriptsResponse> {
  checkToken(token)
  const sp = new URLSearchParams()
  if (params.page != null) sp.set("page", String(params.page))
  if (params.limit != null) sp.set("limit", String(params.limit))
  if (params.status) sp.set("status", params.status)
  if (params.q) sp.set("q", params.q)
  if (params.title) sp.set("title", params.title)
  const query = sp.toString()
  return apiRequest<ListScriptsResponse>(
    `/api/scripts${query ? `?${query}` : ""}`,
    { token }
  )
}

/** GET /api/scripts/queue — role-based queue (available + myReviews). Use for scripts list. */
export async function getScriptQueue(
  token: string | null
): Promise<ScriptQueueResponse> {
  checkToken(token)
  return apiRequest<ScriptQueueResponse>("/api/scripts/queue", { token })
}

/** GET /api/scripts/stats — dashboard counts (pendingReview, overdueCount, reviewedToday). */
export async function getScriptStats(
  token: string | null
): Promise<ScriptStatsResponse> {
  checkToken(token)
  return apiRequest<ScriptStatsResponse>("/api/scripts/stats", { token })
}

export async function getScript(
  token: string | null,
  id: string
): Promise<SingleScriptResponse> {
  checkToken(token)
  return apiRequest<SingleScriptResponse>(`/api/scripts/${id}`, { token })
}

/** My reviews: scripts approved or rejected by current user (e.g. Medical Affairs). GET /api/scripts/my-reviews?decision=APPROVED|REJECTED */
export async function getMyReviews(
  token: string | null,
  params: { decision: "APPROVED" | "REJECTED"; page?: number; limit?: number }
): Promise<ListScriptsResponse> {
  checkToken(token)
  const sp = new URLSearchParams()
  sp.set("decision", params.decision)
  if (params.page != null) sp.set("page", String(params.page))
  if (params.limit != null) sp.set("limit", String(params.limit))
  return apiRequest<ListScriptsResponse>(`/api/scripts/my-reviews?${sp.toString()}`, { token })
}

export async function updateScript(
  token: string | null,
  id: string,
  body: UpdateScriptBody
): Promise<SingleScriptResponse> {
  checkToken(token)
  return apiRequest<SingleScriptResponse>(`/api/scripts/${id}`, {
    method: "PATCH",
    body,
    token,
  })
}

export async function submitScript(
  token: string | null,
  id: string
): Promise<SingleScriptResponse> {
  checkToken(token)
  return apiRequest<SingleScriptResponse>(`/api/scripts/${id}/submit`, {
    method: "POST",
    body: {},
    token,
  })
}

/** Phase 2: Content/Brand approve → CONTENT_BRAND_REVIEW to AGENCY_PRODUCTION */
export async function approveScript(
  token: string | null,
  id: string,
  body: { comments?: string } = {}
): Promise<SingleScriptResponse> {
  checkToken(token)
  const comments = body.comments?.trim()
  const requestBody = comments ? { comments } : {}
  return apiRequest<SingleScriptResponse>(`/api/scripts/${id}/approve`, {
    method: "POST",
    body: requestBody,
    token,
  })
}

/** Phase 2: Content/Brand reject → CONTENT_BRAND_REVIEW to DRAFT (feedback to Medical Affairs) */
export async function rejectScript(
  token: string | null,
  id: string,
  body: { comments: string }
): Promise<SingleScriptResponse> {
  checkToken(token)
  return apiRequest<SingleScriptResponse>(`/api/scripts/${id}/reject`, {
    method: "POST",
    body,
    token,
  })
}

/** Phase 3: Agency submit revision → AGENCY_PRODUCTION to MEDICAL_REVIEW */
export async function submitRevision(
  token: string | null,
  id: string,
  body: { content: string }
): Promise<SingleScriptResponse> {
  checkToken(token)
  return apiRequest<SingleScriptResponse>(`/api/scripts/${id}/submit-revision`, {
    method: "POST",
    body,
    token,
  })
}

/** Phase 3: Content Approver lock → CONTENT_APPROVER_REVIEW to LOCKED */
export async function lockScript(
  token: string | null,
  id: string
): Promise<SingleScriptResponse> {
  checkToken(token)
  return apiRequest<SingleScriptResponse>(`/api/scripts/${id}/lock`, {
    method: "POST",
    body: {},
    token,
  })
}
