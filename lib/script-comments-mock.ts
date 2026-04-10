/**
 * In-browser mock for script inline comments until the real API exists.
 * Persists per tab via sessionStorage.
 *
 * Disable when backend is ready:
 *   NEXT_PUBLIC_MOCK_SCRIPT_COMMENTS=false
 */
import type {
  ScriptComment,
  ScriptCommentCreateBody,
  ScriptCommentMutationResponse,
  ScriptCommentPatchBody,
  ScriptCommentsListResponse,
} from "@/types/script"

const STORAGE_KEY = "practo-hub-mock-script-comments-v1"

type ScriptId = string
type Store = Record<ScriptId, Record<string, ScriptComment>>

function readStore(): Store {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // ignore quota / private mode
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function isScriptCommentsMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_SCRIPT_COMMENTS !== "false"
}

export async function mockGetScriptComments(
  scriptId: string
): Promise<ScriptCommentsListResponse> {
  await delay(80)
  const store = readStore()
  const list = Object.values(store[scriptId] ?? {})
  return { success: true, comments: list }
}

export async function mockCreateScriptComment(
  scriptId: string,
  body: ScriptCommentCreateBody
): Promise<ScriptCommentMutationResponse> {
  await delay(100)
  const store = readStore()
  if (!store[scriptId]) store[scriptId] = {}
  const comment: ScriptComment = {
    id: body.id,
    body: body.body,
    anchor: body.anchor,
    contextSnippet: body.contextSnippet,
    resolved: body.resolved,
    createdAt: new Date().toISOString(),
  }
  store[scriptId][body.id] = comment
  writeStore(store)
  return { success: true, comment }
}

export async function mockPatchScriptComment(
  scriptId: string,
  commentId: string,
  body: ScriptCommentPatchBody
): Promise<ScriptCommentMutationResponse> {
  await delay(80)
  const store = readStore()
  const prev = store[scriptId]?.[commentId]
  if (!prev) {
    return { success: true }
  }
  const next: ScriptComment = {
    ...prev,
    ...body,
    id: commentId,
    updatedAt: new Date().toISOString(),
  }
  store[scriptId][commentId] = next
  writeStore(store)
  return { success: true, comment: next }
}

export async function mockDeleteScriptComment(
  scriptId: string,
  commentId: string
): Promise<{ success: boolean }> {
  await delay(80)
  const store = readStore()
  if (store[scriptId]?.[commentId]) {
    delete store[scriptId][commentId]
    writeStore(store)
  }
  return { success: true }
}

export async function mockPutScriptComments(
  scriptId: string,
  comments: ScriptComment[]
): Promise<ScriptCommentsListResponse> {
  await delay(80)
  const store = readStore()
  const next: Record<string, ScriptComment> = {}
  for (const c of comments) {
    next[c.id] = c
  }
  store[scriptId] = next
  writeStore(store)
  return { success: true, comments: Object.values(next) }
}
