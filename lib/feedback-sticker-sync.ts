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
