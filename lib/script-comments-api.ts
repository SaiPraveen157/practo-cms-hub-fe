/**
 * Script inline comments API (anchored threads, separate from rejection comments).
 * Backend contract — implement these routes when ready:
 *
 * GET    /api/scripts/:scriptId/comments
 * POST   /api/scripts/:scriptId/comments
 * PATCH  /api/scripts/:scriptId/comments/:commentId
 * DELETE /api/scripts/:scriptId/comments/:commentId
 * PUT    /api/scripts/:scriptId/comments  (optional full replace)
 *
 * Until the backend exists, calls use an in-browser mock (sessionStorage).
 * Set `NEXT_PUBLIC_MOCK_SCRIPT_COMMENTS=false` to hit the real API.
 */

import { apiRequest } from "@/lib/api"
import {
  isScriptCommentsMockEnabled,
  mockCreateScriptComment,
  mockDeleteScriptComment,
  mockGetScriptComments,
  mockPatchScriptComment,
  mockPutScriptComments,
} from "@/lib/script-comments-mock"
import type {
  ScriptComment,
  ScriptCommentCreateBody,
  ScriptCommentMutationResponse,
  ScriptCommentPatchBody,
  ScriptCommentsListResponse,
  ScriptCommentsListResponseWire,
  ScriptCommentsPutBody,
} from "@/types/script"

function checkToken(token: string | null): asserts token is string {
  if (!token) throw new Error("Not authenticated")
}

/** GET /api/scripts/:scriptId/comments */
export async function getScriptComments(
  token: string | null,
  scriptId: string
): Promise<ScriptCommentsListResponse> {
  checkToken(token)
  if (isScriptCommentsMockEnabled()) {
    return mockGetScriptComments(scriptId)
  }
  const raw = await apiRequest<ScriptCommentsListResponseWire>(
    `/api/scripts/${scriptId}/comments`,
    { token }
  )
  return {
    success: raw.success,
    comments: raw.comments ?? raw.feedbackStickers ?? [],
  }
}

/** POST /api/scripts/:scriptId/comments */
export async function createScriptComment(
  token: string | null,
  scriptId: string,
  body: ScriptCommentCreateBody
): Promise<ScriptCommentMutationResponse> {
  checkToken(token)
  if (isScriptCommentsMockEnabled()) {
    return mockCreateScriptComment(scriptId, body)
  }
  return apiRequest<ScriptCommentMutationResponse>(
    `/api/scripts/${scriptId}/comments`,
    { method: "POST", body, token }
  )
}

/** PATCH /api/scripts/:scriptId/comments/:commentId */
export async function patchScriptComment(
  token: string | null,
  scriptId: string,
  commentId: string,
  body: ScriptCommentPatchBody
): Promise<ScriptCommentMutationResponse> {
  checkToken(token)
  if (isScriptCommentsMockEnabled()) {
    return mockPatchScriptComment(scriptId, commentId, body)
  }
  return apiRequest<ScriptCommentMutationResponse>(
    `/api/scripts/${scriptId}/comments/${commentId}`,
    { method: "PATCH", body, token }
  )
}

/** DELETE /api/scripts/:scriptId/comments/:commentId */
export async function deleteScriptComment(
  token: string | null,
  scriptId: string,
  commentId: string
): Promise<{ success: boolean }> {
  checkToken(token)
  if (isScriptCommentsMockEnabled()) {
    return mockDeleteScriptComment(scriptId, commentId)
  }
  return apiRequest<{ success: boolean }>(
    `/api/scripts/${scriptId}/comments/${commentId}`,
    { method: "DELETE", token }
  )
}

/** PUT /api/scripts/:scriptId/comments — replace entire comment set */
export async function putScriptComments(
  token: string | null,
  scriptId: string,
  comments: ScriptComment[]
): Promise<ScriptCommentsListResponse> {
  checkToken(token)
  if (isScriptCommentsMockEnabled()) {
    return mockPutScriptComments(scriptId, comments)
  }
  const body: ScriptCommentsPutBody & { feedbackStickers?: ScriptComment[] } = {
    comments,
    feedbackStickers: comments,
  }
  const raw = await apiRequest<ScriptCommentsListResponseWire>(
    `/api/scripts/${scriptId}/comments`,
    { method: "PUT", body, token }
  )
  return {
    success: raw.success,
    comments: raw.comments ?? raw.feedbackStickers ?? [],
  }
}
