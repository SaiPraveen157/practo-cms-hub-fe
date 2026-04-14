"use client"

import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { toast } from "sonner"
import {
  getScriptComments,
  createScriptComment,
  patchScriptComment,
  deleteScriptComment,
} from "@/lib/script-comments-api"
import type { ScriptComment, ScriptCommentAnchor } from "@/types/script"
import { recordFromCommentArray } from "@/lib/feedback-sticker-sync"

export type ScriptCommentsMergeMeta = {
  scriptVersion?: number
}

export type UseScriptCommentsRemoteSyncOptions = {
  token: string | null
  scriptId: string | undefined
  /** GET /api/scripts/:id/comments after mount / scriptId change / refetch key change. */
  fetchEnabled: boolean
  /** POST/PATCH/DELETE when local comment map changes. */
  pushEnabled: boolean
  /** Bump when `Script.version` changes so GET re-runs (new round after Agency resubmit). */
  commentsRefetchKey?: string | number
  /** When GET returns rows, parent should apply to UI (e.g. setFeedbackStickers). */
  onMergeFromServer?: (
    comments: ScriptComment[],
    meta?: ScriptCommentsMergeMeta
  ) => void
  /** After POST/PATCH returns `comment`, merge `resolvedBy` / server fields into local state. */
  onAfterCommentMutation?: (comment: ScriptComment) => void
}

/**
 * Loads inline comments from the dedicated comments API and pushes local edits via
 * POST (create), PATCH (update), DELETE (remove). Call {@link syncBaseline} whenever
 * you replace comment state from the script/queue payload so diffs stay correct.
 */
export function useScriptCommentsRemoteSync({
  token,
  scriptId,
  fetchEnabled,
  pushEnabled,
  commentsRefetchKey,
  onMergeFromServer,
  onAfterCommentMutation,
}: UseScriptCommentsRemoteSyncOptions) {
  const prevMapRef = useRef<Record<string, ScriptComment>>({})
  const onAfterCommentMutationRef = useRef(onAfterCommentMutation)
  useLayoutEffect(() => {
    onAfterCommentMutationRef.current = onAfterCommentMutation
  }, [onAfterCommentMutation])

  /** Reset diff baseline after loading comments from the script payload or queue. */
  const syncBaseline = useCallback((map: Record<string, ScriptComment>) => {
    prevMapRef.current = { ...map }
  }, [])

  useEffect(() => {
    if (!fetchEnabled || !token || !scriptId) return
    let cancelled = false
    getScriptComments(token, scriptId)
      .then((res) => {
        if (cancelled) return
        const list = res.comments ?? []
        const map = recordFromCommentArray(list)
        prevMapRef.current = { ...map }
        onMergeFromServer?.(list, { scriptVersion: res.scriptVersion })
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : "Request failed"
        toast.error("Could not load comments", {
          description: message,
        })
      })
    return () => {
      cancelled = true
    }
  }, [fetchEnabled, token, scriptId, commentsRefetchKey, onMergeFromServer])

  const notifyStickersChanged = useCallback(
    (next: Record<string, ScriptComment>) => {
      if (!pushEnabled || !token || !scriptId) {
        prevMapRef.current = { ...next }
        return
      }

      const prev = prevMapRef.current
      const prevIds = new Set(Object.keys(prev))
      const nextIds = new Set(Object.keys(next))

      const run = async () => {
        const mergedNext: Record<string, ScriptComment> = { ...next }
        try {
          for (const id of nextIds) {
            if (!prevIds.has(id)) {
              const c = next[id]
              const anchor: ScriptCommentAnchor = c.anchor ?? {
                space: "plain_text_utf16",
                startOffset: 0,
                endOffset: 0,
              }
              const created = await createScriptComment(token, scriptId, {
                id: c.id,
                body: c.body,
                anchor,
                contextSnippet: c.contextSnippet ?? undefined,
                resolved: c.resolved,
              })
              if (created.comment) {
                mergedNext[id] = { ...c, ...created.comment }
                onAfterCommentMutationRef.current?.(created.comment)
              }
              toast.success("Comment posted", { duration: 2000 })
            } else {
              const a = prev[id]
              const b = next[id]
              const anchorChanged =
                JSON.stringify(a.anchor ?? null) !==
                JSON.stringify(b.anchor ?? null)
              const bodyOrMetaChanged =
                a.body !== b.body ||
                (a.contextSnippet ?? "") !== (b.contextSnippet ?? "") ||
                anchorChanged
              const resolvedChanged =
                Boolean(a.resolved) !== Boolean(b.resolved)
              if (bodyOrMetaChanged || resolvedChanged) {
                const patchBody =
                  resolvedChanged && !bodyOrMetaChanged
                    ? { resolved: Boolean(b.resolved) }
                    : {
                        body: b.body,
                        contextSnippet: b.contextSnippet ?? undefined,
                        resolved: b.resolved,
                        ...(anchorChanged && b.anchor ? { anchor: b.anchor } : {}),
                      }
                const patched = await patchScriptComment(
                  token,
                  scriptId,
                  id,
                  patchBody
                )
                if (patched.comment) {
                  mergedNext[id] = { ...b, ...patched.comment }
                  onAfterCommentMutationRef.current?.(patched.comment)
                }
                toast.success("Comment updated", { duration: 1800 })
              }
            }
          }
          for (const id of prevIds) {
            if (!nextIds.has(id)) {
              await deleteScriptComment(token, scriptId, id)
              toast.success("Comment removed", { duration: 1800 })
              delete mergedNext[id]
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Request failed"
          toast.error("Comment API error", { description: message })
        } finally {
          prevMapRef.current = mergedNext
        }
      }

      void run()
    },
    [pushEnabled, token, scriptId]
  )

  return {
    notifyStickersChanged,
    syncBaseline,
  }
}
