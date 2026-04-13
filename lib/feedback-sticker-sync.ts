import type { Script, ScriptComment } from "@/types/script"

/** Prefer `comments`, fall back to legacy `feedbackStickers`. */
export function scriptCommentsListFromScript(
  script: Pick<Script, "comments" | "feedbackStickers"> | null | undefined
): ScriptComment[] {
  if (!script) return []
  const fromPrimary = script.comments
  if (fromPrimary?.length) return fromPrimary
  return script.feedbackStickers ?? []
}

/**
 * Merge queue-loaded script data into the sticker map. Prefer non-empty
 * `comments` / `feedbackStickers` on the script. If the queue omits them (common),
 * keep `prev` only when every entry belongs to this script (`scriptId` or legacy
 * without `scriptId`) so another script’s threads are not shown after navigation.
 */
export function mergeStickersFromQueuePayload(
  prev: Record<string, ScriptComment>,
  script: Script
): Record<string, ScriptComment> {
  const fromScript = recordFromCommentArray(
    scriptCommentsListFromScript(script)
  )
  if (Object.keys(fromScript).length > 0) return fromScript
  const prevValues = Object.values(prev)
  if (prevValues.length === 0) return prev
  const allForThisScript = prevValues.every(
    (c) => !c.scriptId || c.scriptId === script.id
  )
  return allForThisScript ? prev : {}
}

export function recordFromCommentArray(
  list: ScriptComment[] | undefined
): Record<string, ScriptComment> {
  if (!list?.length) return {}
  return Object.fromEntries(list.map((s) => [s.id, s]))
}

/** @deprecated Use `recordFromCommentArray`. */
export const recordFromStickerArray = recordFromCommentArray

export function canonicalStickersJsonFromArray(
  list: ScriptComment[] | undefined
): string {
  return JSON.stringify([...(list ?? [])].sort((a, b) => a.id.localeCompare(b.id)))
}

export function canonicalStickersJsonFromRecord(
  record: Record<string, ScriptComment>
): string {
  return JSON.stringify(Object.values(record).sort((a, b) => a.id.localeCompare(b.id)))
}
