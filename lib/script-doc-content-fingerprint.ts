/**
 * Compares script document structure ignoring inline feedbackSticker nodes,
 * so edits that only add/remove/move stickers pass while body/mark changes fail.
 */

export function stripFeedbackStickersFromDocJson(
  node: Record<string, unknown> | null | undefined
): Record<string, unknown> | null | undefined {
  if (!node || typeof node !== "object") return node
  const next: Record<string, unknown> = { ...node }
  if (Array.isArray(next.content)) {
    next.content = (next.content as Record<string, unknown>[])
      .filter((c) => c && typeof c === "object" && c.type !== "feedbackSticker")
      .map((c) =>
        typeof c === "object" && c !== null && "content" in c
          ? stripFeedbackStickersFromDocJson(c as Record<string, unknown>)
          : c
      )
  }
  return next
}

/** Stable string for PM doc equality checks (stickers stripped). */
export function scriptDocContentFingerprint(docJson: Record<string, unknown>): string {
  return JSON.stringify(stripFeedbackStickersFromDocJson(docJson))
}
